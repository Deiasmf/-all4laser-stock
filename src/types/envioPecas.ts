// Tipos e constantes do módulo Pedidos de Envio de Peças.

export type EnvioEstado =
  | 'aberto'
  | 'a_realizar'
  | 'pronto_a_expedir'
  | 'expedido'
  | 'cancelado'

// Estados com rótulo legível e cores do badge (cor do texto + fundo).
export const ESTADOS_ENVIO: {
  valor: EnvioEstado
  label: string
  cor: string
  bg: string
}[] = [
  { valor: 'aberto', label: 'Aberto', cor: '#374151', bg: '#E5E7EB' },
  { valor: 'a_realizar', label: 'A realizar', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'pronto_a_expedir', label: 'Pronto a expedir', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'expedido', label: 'Expedido', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'cancelado', label: 'Cancelado', cor: '#F9FAFB', bg: '#374151' },
]

export function estadoInfo(valor: string | null) {
  return ESTADOS_ENVIO.find((e) => e.valor === valor) ?? ESTADOS_ENVIO[0]
}

export const TRANSPORTADORAS = ['Nacex', 'UPS', 'FedEx', 'Entrega em Mãos', 'Outro'] as const
export type Transportadora = (typeof TRANSPORTADORAS)[number]

// Método de envio "Entrega em Mãos": não há transportadora nem carta de porte.
export const ENTREGA_EM_MAOS = 'Entrega em Mãos'
export function ehEntregaEmMaos(transportadora: string | null | undefined): boolean {
  return transportadora === ENTREGA_EM_MAOS
}

// ── Destinatário: cliente ou fornecedor ──
export type DestinatarioTipo = 'cliente' | 'fornecedor'

// ── Motivo do envio ──
// semCusto: envios sem custo/valor associado (não faturáveis por natureza).
export type MotivoEnvio = 'venda' | 'reparacao' | 'garantia' | 'pecas_falta'

export const MOTIVOS_ENVIO: { valor: MotivoEnvio; label: string; semCusto: boolean }[] = [
  { valor: 'venda', label: 'Venda', semCusto: false },
  { valor: 'reparacao', label: 'Reparação', semCusto: false },
  { valor: 'garantia', label: 'Peças em Garantia', semCusto: true },
  { valor: 'pecas_falta', label: 'Peças em falta', semCusto: true },
]

export function motivoInfo(valor: string | null) {
  return MOTIVOS_ENVIO.find((m) => m.valor === valor) ?? MOTIVOS_ENVIO[0]
}

// Links de tracking/abertura em nova aba por transportadora.
export const TRANSPORTADORA_LINK: Record<string, string> = {
  Nacex: 'https://www.nacex.pt',
  UPS: 'https://www.ups.com',
  FedEx: 'https://www.fedex.com',
}

// Software de faturação (abre numa nova aba ao clicar em "Faturar").
export const KEYINVOICE_URL = 'https://www.keyinvoice.com'

export type EnvioPeca = {
  id: string
  numero: string | null
  estado: EnvioEstado
  destinatario_tipo: DestinatarioTipo | null
  fornecedor_id: string | null
  fornecedor_nome: string | null
  motivo: MotivoEnvio | null
  faturavel: boolean
  cliente_id: string | null
  cliente_nome: string | null
  cliente_email: string | null
  morada_envio: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  transportadora: string | null
  transportadora_outro: string | null
  peso_kg: number | null
  comprimento_cm: number | null
  largura_cm: number | null
  altura_cm: number | null
  valor_a_faturar: number | null
  iva_isento: boolean
  iva_taxa: number
  faturado: boolean
  pago: boolean
  data_pagamento: string | null
  fatura_url: string | null
  fatura_caminho: string | null
  carta_porte_url: string | null
  carta_porte_caminho: string | null
  entregue_a: string | null       // Entrega em Mãos: nome de quem recebeu
  entregue_em: string | null       // Entrega em Mãos: data da entrega
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  expedido_em: string | null
  reparacao_voltou_em: string | null   // envios de reparação: quando as peças voltaram do fornecedor
  created_at: string
  updated_at: string
}

export type EnvioItem = {
  id: string
  envio_id: string
  peca_id: string | null
  peca_nome: string | null
  serial_number: string | null
  quantidade: number
  preco_unitario: number
  preco_total: number
  created_at: string
}

// Item escolhido no formulário (antes de gravar)
export type EnvioItemInput = {
  peca_id: string | null
  peca_nome: string
  serial_number: string | null
  quantidade: number
  preco_unitario: number
}

// Campos editáveis do envio (criação)
export type EnvioInput = {
  destinatario_tipo: DestinatarioTipo
  fornecedor_id: string | null
  fornecedor_nome: string | null
  motivo: MotivoEnvio
  faturavel: boolean
  cliente_id: string | null
  cliente_nome: string | null
  cliente_email: string | null
  morada_envio: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  transportadora: string | null
  transportadora_outro: string | null
  peso_kg: number | null
  comprimento_cm: number | null
  largura_cm: number | null
  altura_cm: number | null
  valor_a_faturar: number | null
  iva_isento: boolean
  iva_taxa: number
  notas: string | null
}

// Nome a mostrar da transportadora (resolve "Outro")
export function transportadoraLabel(e: Pick<EnvioPeca, 'transportadora' | 'transportadora_outro'>) {
  if (!e.transportadora) return '—'
  if (e.transportadora === 'Outro') return e.transportadora_outro?.trim() || 'Outro'
  return e.transportadora
}

// ─── Título descritivo do envio ──────────────────────────────────────────────
// Gera um título como "Envio EP-2026-0012 — Meditek — 3 Fibras" a partir do
// número, da entidade destino e de um resumo do material. Calculado de forma
// dinâmica (sem guardar na BD) — aplica-se a todos os registos, novos e antigos.

// Item mínimo para gerar o resumo (basta nome e quantidade).
export type ItemResumo = { peca_nome: string | null; quantidade: number }

// Tipos de peça reconhecidos por palavras-chave, com singular/plural em pt-PT.
// A ordem importa: o 1º padrão que bater vence.
const TIPOS_PECA: { chaves: RegExp; singular: string; plural: string }[] = [
  { chaves: /fibra|fiber/i, singular: 'Fibra', plural: 'Fibras' },
  { chaves: /handpiece|peça de mão|peca de mao|manípulo|manipulo|\bhp\b/i, singular: 'Handpiece', plural: 'Handpieces' },
  { chaves: /ponteira|\btip\b|spot size|\bspot\b/i, singular: 'Ponteira', plural: 'Ponteiras' },
  { chaves: /cartucho|cartridge/i, singular: 'Cartucho', plural: 'Cartuchos' },
  { chaves: /lâmpada|lampada|flash ?lamp|\blamp\b/i, singular: 'Lâmpada', plural: 'Lâmpadas' },
  { chaves: /filtro|filter/i, singular: 'Filtro', plural: 'Filtros' },
  { chaves: /lente|\blens\b/i, singular: 'Lente', plural: 'Lentes' },
  { chaves: /espelho|mirror/i, singular: 'Espelho', plural: 'Espelhos' },
  { chaves: /\bcabo\b|\bcable\b/i, singular: 'Cabo', plural: 'Cabos' },
  { chaves: /fonte|power supply|\bpsu\b/i, singular: 'Fonte', plural: 'Fontes' },
  { chaves: /placa|\bboard\b|\bpcb\b/i, singular: 'Placa', plural: 'Placas' },
  { chaves: /sensor/i, singular: 'Sensor', plural: 'Sensores' },
  { chaves: /bomba|\bpump\b/i, singular: 'Bomba', plural: 'Bombas' },
  { chaves: /válvula|valvula|valve/i, singular: 'Válvula', plural: 'Válvulas' },
  { chaves: /conector|conetor|connector/i, singular: 'Conector', plural: 'Conectores' },
  { chaves: /ecrã|ecra|display|screen/i, singular: 'Ecrã', plural: 'Ecrãs' },
]

// Pluraliza uma palavra em português (regras aproximadas do pt-PT). Usado no
// fallback dos tipos de peça não catalogados.
function pluralizarPt(palavra: string): string {
  const p = palavra
  if (/s$/i.test(p)) return p                          // já no plural / invariável (-s)
  if (/ão$/i.test(p)) return p.replace(/ão$/i, 'ões')  // botão → botões
  if (/m$/i.test(p)) return p.replace(/m$/i, 'ns')     // pino? garagem → garagens
  if (/al$/i.test(p)) return p.replace(/al$/i, 'ais')  // cabeçal → cabeçais
  if (/el$/i.test(p)) return p.replace(/el$/i, 'eis')  // painel → paineis
  if (/ol$/i.test(p)) return p.replace(/ol$/i, 'ois')  // farol → farois
  if (/ul$/i.test(p)) return p.replace(/ul$/i, 'uis')
  if (/il$/i.test(p)) return p.replace(/il$/i, 'is')   // fusil → fusis
  if (/[rz]$/i.test(p)) return p + 'es'                // motor → motores, luz → luzes
  return p + 's'                                        // vogal e restantes → +s
}

// Deriva um "tipo" legível do nome da peça. Usa as palavras-chave conhecidas;
// se nenhuma bater, usa a 1ª palavra significativa do nome como tipo.
export function tipoDaPeca(nome: string | null): { singular: string; plural: string } {
  const n = (nome ?? '').trim()
  for (const t of TIPOS_PECA) if (t.chaves.test(n)) return { singular: t.singular, plural: t.plural }
  const palavra = n.match(/[\p{L}\p{N}]+/u)?.[0] ?? 'Item'
  const singular = palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase()
  return { singular, plural: pluralizarPt(singular) }
}

// Resume o material de um envio agrupando por tipo e somando quantidades:
//   1 tipo  → "3 Fibras"
//   2 tipos → "3 Fibras + 2 Handpieces"
//   3+ tipos → "5 itens (3 tipos)"
export function resumoMaterial(itens: ItemResumo[]): string {
  if (!itens || itens.length === 0) return 'Sem material'
  const ordem: string[] = []
  const grupos = new Map<string, { qtd: number; singular: string; plural: string }>()
  for (const it of itens) {
    const t = tipoDaPeca(it.peca_nome)
    const q = it.quantidade > 0 ? it.quantidade : 1
    const g = grupos.get(t.singular)
    if (g) g.qtd += q
    else { grupos.set(t.singular, { qtd: q, singular: t.singular, plural: t.plural }); ordem.push(t.singular) }
  }
  if (ordem.length <= 2) {
    return ordem
      .map((k) => { const g = grupos.get(k)!; return `${g.qtd} ${g.qtd === 1 ? g.singular : g.plural}` })
      .join(' + ')
  }
  const total = [...grupos.values()].reduce((a, g) => a + g.qtd, 0)
  return `${total} itens (${ordem.length} tipos)`
}

// Nome da entidade destino (fornecedor ou cliente).
export function entidadeDestino(
  e: Pick<EnvioPeca, 'destinatario_tipo' | 'cliente_nome' | 'fornecedor_nome'>
): string {
  const nome = e.destinatario_tipo === 'fornecedor' ? e.fornecedor_nome : e.cliente_nome
  return (nome ?? '').trim()
}

// Título descritivo para mostrar na interface (usa travessão "—").
export function tituloEnvio(e: EnvioPeca, itens: ItemResumo[]): string {
  const partes = [
    e.numero ? `Envio ${e.numero}` : 'Envio',
    entidadeDestino(e),
    resumoMaterial(itens),
  ].filter((p) => p && p.trim())
  return partes.join(' — ')
}

// Remove caracteres inválidos em nomes de ficheiro (\ / : * ? " < > |) e
// normaliza espaços. Mantém acentuação e maiúsculas.
export function sanitizarNomeFicheiro(nome: string): string {
  return nome.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
}

// Nome de ficheiro para PDFs/documentos gerados (usa hífen "-", sem extensão):
//   "Envio EP-2026-0012 - Meditek - 3 Fibras"
export function nomeFicheiroEnvio(e: EnvioPeca, itens: ItemResumo[]): string {
  const partes = [
    e.numero ? `Envio ${e.numero}` : 'Envio',
    entidadeDestino(e),
    resumoMaterial(itens),
  ].filter((p) => p && p.trim())
  return sanitizarNomeFicheiro(partes.join(' - ')) || 'Envio'
}

export function formatarEuro(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// Taxas de IVA disponíveis (além de "Isento").
export const TAXAS_IVA = [23, 6] as const

export type IvaBreakdown = { base: number; isento: boolean; taxa: number; iva: number; total: number }

// Calcula o IVA e o total de um envio a partir do valor a faturar.
export function calcularIva(e: Pick<EnvioPeca, 'valor_a_faturar' | 'iva_isento' | 'iva_taxa'>): IvaBreakdown {
  const base = e.valor_a_faturar ?? 0
  const isento = !!e.iva_isento
  const taxa = isento ? 0 : (e.iva_taxa ?? 23)
  const iva = isento ? 0 : (base * taxa) / 100
  return { base, isento, taxa, iva, total: base + iva }
}
