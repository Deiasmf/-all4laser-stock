// Tipos, constantes e helpers PUROS do módulo Cotações de Transporte.
// Sem dependências do Supabase — pode ser importado no cliente e no servidor
// (ex.: na rota de envio). A camada de dados está em src/lib/freight.ts.

// ─── Enumerações ─────────────────────────────────────────────────────────────
export type IdiomaFreight = 'pt' | 'en'
export type TipoTransporte = 'terrestre' | 'aereo' | 'maritimo' | 'expresso'
export type EstadoPedido = 'rascunho' | 'enviado' | 'em_rececao' | 'fechado' | 'cancelado'
export type EstadoDestinatario = 'pendente' | 'enviado' | 'falhou'

// Tipo de transporte: label para a UI e o adjetivo (feminino, concorda com
// "cotação") usado no assunto/corpo — ex.: "Pedido de cotação aérea".
export const TIPOS_TRANSPORTE: { valor: TipoTransporte; label: string; adjetivo: string }[] = [
  { valor: 'terrestre', label: 'Terrestre', adjetivo: 'terrestre' },
  { valor: 'aereo',     label: 'Aéreo',     adjetivo: 'aérea' },
  { valor: 'maritimo',  label: 'Marítimo',  adjetivo: 'marítima' },
  { valor: 'expresso',  label: 'Expresso',  adjetivo: 'expresso' },
]

export function tipoTransporteLabel(t: TipoTransporte): string {
  return TIPOS_TRANSPORTE.find((x) => x.valor === t)?.label ?? t
}
export function tipoTransporteAdjetivo(t: TipoTransporte): string {
  return TIPOS_TRANSPORTE.find((x) => x.valor === t)?.adjetivo ?? t
}

export const ESTADOS_PEDIDO: { valor: EstadoPedido; label: string; cor: string; bg: string }[] = [
  { valor: 'rascunho',   label: 'Rascunho',            cor: '#374151', bg: '#F3F4F6' },
  { valor: 'enviado',    label: 'Enviado',             cor: '#1D4ED8', bg: '#DBEAFE' },
  { valor: 'em_rececao', label: 'Em receção',          cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'fechado',    label: 'Fechado',             cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'cancelado',  label: 'Cancelado',           cor: '#B91C1C', bg: '#FEE2E2' },
]
export function estadoPedidoInfo(e: EstadoPedido) {
  return ESTADOS_PEDIDO.find((x) => x.valor === e) ?? ESTADOS_PEDIDO[0]
}

// ─── Linhas da base de dados ─────────────────────────────────────────────────
export type FreightForwarder = {
  id: string
  nome: string
  pessoa_contacto: string | null
  emails: string[]
  telefone: string | null
  pais: string | null
  notas: string | null
  ativo: boolean
  fornecedor_id: string | null
  created_at: string
  updated_at: string
}

export type ForwarderGroup = {
  id: string
  nome: string
  idioma: IdiomaFreight
  notas: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export type StandardBox = {
  id: string
  nome: string
  int_c: number | null; int_l: number | null; int_a: number | null
  ext_c: number; ext_l: number; ext_a: number
  peso_tipico: number | null
  notas: string | null
  ativo: boolean
  ordem: number
  created_at: string
  updated_at: string
}

export type CargoLine = {
  id: string
  request_id: string
  box_id: string | null
  descricao: string | null
  ext_c: number; ext_l: number; ext_a: number
  quantidade: number
  peso_volume: number | null
  ordem: number
}

export type FreightRequest = {
  id: string
  numero: string | null
  estado: EstadoPedido
  tipo_transporte: TipoTransporte
  origem_nome: string | null
  origem_morada: string | null
  origem_cp: string | null
  origem_localidade: string | null
  origem_pais: string | null
  destino_pais: string | null
  destino_cidade_cp: string | null
  destino_morada: string | null
  data_recolha: string | null
  flexibilidade: string | null
  extra_paletizar: boolean
  extra_seguro: boolean
  extra_plataforma: boolean
  extra_urgente: boolean
  observacoes: string | null
  idioma: IdiomaFreight
  assunto_email: string | null
  remetente: string | null   // email @all4laser.com de quem envia
  group_id: string | null
  vencedor_forwarder_id: string | null
  fechado_em: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type FreightRecipient = {
  id: string
  request_id: string
  forwarder_id: string | null
  nome_empresa: string | null
  emails: string[]
  saudacao: string | null
  estado: EstadoDestinatario
  tentativas: number
  erro: string | null
  enviado_em: string | null
  gmail_message_id: string | null
  gmail_thread_id: string | null
  created_at: string
}

export type FreightQuote = {
  id: string
  request_id: string
  forwarder_id: string | null
  recipient_id: string | null
  valor: number | null
  moeda: string
  prazo_transito: string | null
  validade: string | null
  notas: string | null
  pdf_path: string | null
  escolhido: boolean
  created_at: string
}

export type FreightEmailTemplate = {
  idioma: IdiomaFreight
  assunto_template: string
  corpo_template: string
  updated_at: string
}

export type FreightSettings = {
  id: number
  dias_uteis_alerta: number
  remetentes: string[]
  updated_at: string
}

// Remetente por omissão e validação (só contas @all4laser.com podem ser
// personificadas pela Service Account via delegação de domínio).
export const REMETENTE_DEFAULT = 'vanessa.tavares@all4laser.com'
export function remetenteValido(email: string | null | undefined): boolean {
  return !!email && /^[^\s@]+@all4laser\.com$/i.test(email.trim())
}

// ─── Cálculos de carga ───────────────────────────────────────────────────────
export type TotaisCarga = {
  volumes: number       // nº total de volumes (soma das quantidades)
  pesoTotal: number     // kg
  volumeM3: number      // m³ (a partir das dimensões exteriores)
  pesoIncompleto: boolean // true se alguma linha não tem peso preenchido
}

export function totaisCarga(linhas: Pick<CargoLine, 'ext_c' | 'ext_l' | 'ext_a' | 'quantidade' | 'peso_volume'>[]): TotaisCarga {
  let volumes = 0, pesoTotal = 0, volumeM3 = 0, pesoIncompleto = false
  for (const l of linhas) {
    const q = Number(l.quantidade) || 0
    volumes += q
    if (l.peso_volume == null) pesoIncompleto = pesoIncompleto || q > 0
    else pesoTotal += q * Number(l.peso_volume)
    // cm → m: dividir cada dimensão por 100
    const m3 = (Number(l.ext_c) / 100) * (Number(l.ext_l) / 100) * (Number(l.ext_a) / 100)
    volumeM3 += q * m3
  }
  return { volumes, pesoTotal: round2(pesoTotal), volumeM3: round3(volumeM3), pesoIncompleto }
}

function round2(n: number) { return Math.round(n * 100) / 100 }
function round3(n: number) { return Math.round(n * 1000) / 1000 }

// ─── Textos derivados (origem, destino, datas, extras) ───────────────────────
export function moradaOrigem(r: Pick<FreightRequest, 'origem_nome' | 'origem_morada' | 'origem_cp' | 'origem_localidade' | 'origem_pais'>): string {
  return [r.origem_nome, r.origem_morada, [r.origem_cp, r.origem_localidade].filter(Boolean).join(' '), r.origem_pais]
    .map((s) => (s ?? '').trim()).filter(Boolean).join(', ')
}

export function moradaDestino(r: Pick<FreightRequest, 'destino_morada' | 'destino_cidade_cp' | 'destino_pais'>): string {
  return [r.destino_morada, r.destino_cidade_cp, r.destino_pais]
    .map((s) => (s ?? '').trim()).filter(Boolean).join(', ')
}

// Destino curto para o assunto: país (ou cidade se não houver país).
export function destinoCurto(r: Pick<FreightRequest, 'destino_pais' | 'destino_cidade_cp'>): string {
  return (r.destino_pais || r.destino_cidade_cp || '').trim() || '—'
}

export function datasTexto(r: Pick<FreightRequest, 'data_recolha' | 'flexibilidade'>, idioma: IdiomaFreight): string {
  const partes: string[] = []
  if (r.data_recolha) partes.push(idioma === 'en' ? `Preferred pickup: ${r.data_recolha}` : `Recolha pretendida: ${r.data_recolha}`)
  if (r.flexibilidade) partes.push(r.flexibilidade)
  if (partes.length === 0) return idioma === 'en' ? 'To be confirmed' : 'A combinar'
  return partes.join(' — ')
}

export function extrasTexto(r: Pick<FreightRequest, 'extra_paletizar' | 'extra_seguro' | 'extra_plataforma' | 'extra_urgente'>, idioma: IdiomaFreight): string {
  const pt = { pal: 'mercadoria a paletizar', seg: 'seguro', plat: 'entrega com plataforma elevatória', urg: 'urgente' }
  const en = { pal: 'goods to be palletised', seg: 'insurance', plat: 'tail-lift delivery', urg: 'urgent' }
  const d = idioma === 'en' ? en : pt
  const lista = [
    r.extra_paletizar ? d.pal : null,
    r.extra_seguro ? d.seg : null,
    r.extra_plataforma ? d.plat : null,
    r.extra_urgente ? d.urg : null,
  ].filter(Boolean)
  if (lista.length === 0) return idioma === 'en' ? 'None' : 'Nenhum'
  return lista.join(', ')
}

// Saudação por destinatário: pessoa de contacto ou nome da empresa.
export function saudacaoPara(f: Pick<FreightForwarder, 'nome' | 'pessoa_contacto'>): string {
  return (f.pessoa_contacto || f.nome || '').trim()
}

// Tabela de volumes em texto (largura fixa) para o corpo do email.
export type LinhaVolume = { descricao: string | null; ext_c: number; ext_l: number; ext_a: number; quantidade: number; peso_volume: number | null }
export function tabelaVolumesTexto(linhas: LinhaVolume[], idioma: IdiomaFreight): string {
  const cab = idioma === 'en'
    ? ['Description', 'Qty', 'L×W×H (cm)', 'Weight/unit']
    : ['Descrição', 'Qtd', 'C×L×A (cm)', 'Peso/vol']
  const linhasFmt = linhas.map((l) => [
    l.descricao || '—',
    String(l.quantidade),
    `${num(l.ext_c)}×${num(l.ext_l)}×${num(l.ext_a)}`,
    l.peso_volume != null ? `${num(l.peso_volume)} kg` : (idioma === 'en' ? '—' : '—'),
  ])
  const larguras = cab.map((c, i) => Math.max(c.length, ...linhasFmt.map((r) => r[i].length)))
  const fmtLinha = (cols: string[]) => cols.map((c, i) => c.padEnd(larguras[i])).join('  ')
  const sep = larguras.map((w) => '-'.repeat(w)).join('  ')
  return [fmtLinha(cab), sep, ...linhasFmt.map(fmtLinha)].join('\n')
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n))
}

// ─── Render de template ──────────────────────────────────────────────────────
// Substitui {{chave}} pelos valores. Chaves em falta ficam vazias.
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '')
}

// Variáveis comuns (tipo/destino) para o ASSUNTO — o corpo acrescenta as restantes.
export function varsAssunto(r: Pick<FreightRequest, 'tipo_transporte' | 'destino_pais' | 'destino_cidade_cp'>): Record<string, string> {
  return { tipo: tipoTransporteAdjetivo(r.tipo_transporte), destino: destinoCurto(r) }
}
