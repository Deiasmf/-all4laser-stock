// Tipos e helpers puros do módulo Tracking (sem dependências de Supabase).
// Deteção de transportadora pelo formato, validação de AWB e construção de
// links de seguimento vivem aqui para poderem ser testados isoladamente.

export type TipoTransporte = 'expresso' | 'carga_aerea' | 'outro'
export type Direcao = 'envio' | 'rececao'
export type EstadoEnvio = 'registado' | 'em_transito' | 'entregue' | 'problema' | 'devolvido'
export type OrigemEnvio = 'manual' | 'ep' | 'expedicao' | 'encomenda' | 'recolha' | 'equipamento'
export type TipoCarrier = 'expresso' | 'companhia_aerea' | 'outro'

export const ESTADOS_ENVIO: { valor: EstadoEnvio; label: string; cor: string; bg: string }[] = [
  { valor: 'registado', label: 'Registado', cor: '#374151', bg: '#E5E7EB' },
  { valor: 'em_transito', label: 'Em trânsito', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'entregue', label: 'Entregue', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'problema', label: 'Problema', cor: '#B91C1C', bg: '#FEF2F2' },
  { valor: 'devolvido', label: 'Devolvido', cor: '#4338CA', bg: '#E8E8FD' },
]
export function estadoEnvioInfo(v: string) {
  return ESTADOS_ENVIO.find((e) => e.valor === v) ?? ESTADOS_ENVIO[0]
}

export const TIPOS_TRANSPORTE: { valor: TipoTransporte; label: string }[] = [
  { valor: 'expresso', label: 'Expresso' },
  { valor: 'carga_aerea', label: 'Carga aérea (AWB)' },
  { valor: 'outro', label: 'Outro' },
]
export function tipoTransporteLabel(v: string | null): string {
  return TIPOS_TRANSPORTE.find((t) => t.valor === v)?.label ?? (v ?? '—')
}

export const ORIGENS: Record<OrigemEnvio, string> = {
  manual: 'Manual',
  ep: 'Envio de Encomenda',
  expedicao: 'Expedição',
  encomenda: 'Encomenda',
  recolha: 'Recolha',
  equipamento: 'Equipamento',
}
export function origemLabel(v: string | null): string {
  return (ORIGENS as Record<string, string>)[v ?? ''] ?? (v ?? '—')
}

// Dias em trânsito a partir dos quais um envio é destacado (configurável).
export const DIAS_DESTAQUE = { expresso: 7, carga_aerea: 14, outro: 10 }

export type Carrier = {
  id: string
  nome: string
  tipo: TipoCarrier
  codigo: string | null
  prefixo_awb: string | null
  url_template: string | null
  deteta_regex: string | null
  carrier_code_api: string | null
  ativo: boolean
}

export type ShipmentTracking = {
  id: string
  tracking_number: string | null
  awb: string | null
  awb_check_valido: boolean | null
  tipo_transporte: TipoTransporte
  carrier_id: string | null
  carrier_nome: string | null
  direcao: Direcao
  descricao_conteudo: string | null
  entidade_tipo: 'cliente' | 'fornecedor' | null
  cliente_id: string | null
  supplier_id: string | null
  entidade_nome: string | null
  origem: OrigemEnvio
  source_type: string | null
  source_id: string | null
  origem_anulada: boolean
  carta_porte_url: string | null
  carta_porte_caminho: string | null
  estado: EstadoEnvio
  data_expedicao: string | null
  entrega_prevista: string | null
  entrega_efetiva: string | null
  notas: string | null
  aeroporto_origem: string | null
  aeroporto_destino: string | null
  num_volumes: number | null
  peso_kg: number | null
  auto_tracking_enabled: boolean
  created_at: string
  updated_at: string
  // Soft delete: quando eliminado, deixa de aparecer na lista/dashboard.
  deleted_at: string | null
  deleted_by: string | null
  deleted_by_nome: string | null
}

// ─── Validação de AWB (Air Waybill) ──────────────────────────────────────────
// Formato XXX-NNNNNNNN: 3 dígitos de prefixo IATA + 7 dígitos de série + 1
// dígito de controlo. O dígito de controlo é o resto da divisão dos 7 dígitos
// de série por 7.
export type AwbInfo = {
  valido: boolean          // formato reconhecido
  prefixo: string | null   // 3 dígitos (prefixo IATA da companhia)
  serie: string | null     // 7 dígitos
  digitoControlo: number | null
  digitoEsperado: number | null
  controloOk: boolean | null  // null quando o formato não é reconhecido
  normalizado: string | null  // "074-12345678"
}

export function analisarAwb(input: string | null | undefined): AwbInfo {
  const vazio: AwbInfo = { valido: false, prefixo: null, serie: null, digitoControlo: null, digitoEsperado: null, controloOk: null, normalizado: null }
  const bruto = (input ?? '').replace(/[\s-]/g, '')
  const m = bruto.match(/^(\d{3})(\d{7})(\d)$/)
  if (!m) return vazio
  const [, prefixo, serie, dc] = m
  const esperado = Number(serie) % 7
  const controlo = Number(dc)
  return {
    valido: true,
    prefixo,
    serie,
    digitoControlo: controlo,
    digitoEsperado: esperado,
    controloOk: controlo === esperado,
    normalizado: `${prefixo}-${serie}${dc}`,
  }
}

// ─── Deteção da transportadora pelo formato do tracking number ───────────────
// Testa o número contra os deteta_regex das transportadoras expresso ativas.
// Devolve a primeira que casa (a ordem do array define a prioridade).
export function detetarTransportadoraExpresso(numero: string, carriers: Carrier[]): Carrier | null {
  const n = (numero ?? '').trim().toUpperCase()
  if (!n) return null
  for (const c of carriers) {
    if (c.tipo !== 'expresso' || !c.ativo || !c.deteta_regex) continue
    try {
      if (new RegExp(c.deteta_regex, 'i').test(n)) return c
    } catch {
      /* regex inválido na BD — ignora */
    }
  }
  return null
}

// Companhia aérea pelo prefixo IATA da AWB.
export function detetarCompanhiaPorPrefixo(prefixo: string | null, carriers: Carrier[]): Carrier | null {
  if (!prefixo) return null
  return carriers.find((c) => c.tipo === 'companhia_aerea' && c.prefixo_awb === prefixo) ?? null
}

// ─── Links de seguimento ─────────────────────────────────────────────────────
export const TRACK_TRACE_AIRCARGO = 'https://www.track-trace.com/aircargo'

// Link direto de seguimento expresso (usa o url_template da transportadora).
export function linkTrackingExpresso(carrier: Carrier | null, tracking: string | null): string | null {
  const n = (tracking ?? '').trim()
  if (!carrier?.url_template || !n) return null
  return carrier.url_template.replace('{tracking}', encodeURIComponent(n))
}

// Link de carga aérea. Se a companhia tiver url_template próprio, esse tem
// prioridade; senão devolve null (o UI abre o track-trace.com e copia a AWB).
export function linkAwbCarrier(carrier: Carrier | null, awb: string | null): string | null {
  const n = (awb ?? '').trim()
  if (!carrier?.url_template || !n) return null
  return carrier.url_template.replace('{awb}', encodeURIComponent(n)).replace('{tracking}', encodeURIComponent(n))
}
