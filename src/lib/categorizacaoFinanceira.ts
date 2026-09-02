// Classificação dos documentos importados (Keyinvoice) por natureza do negócio
// e deteção das despesas a deduzir na comissão do serviço técnico.
//
// Tudo aqui é puro (sem BD): a importação usa-o para propor uma categoria e as
// despesas; o utilizador pode sempre corrigir à mão (categoria_manual=true).

export type CategoriaDoc = 'servico_tecnico' | 'aluguer' | 'venda' | 'outro'

export const CATEGORIAS: { valor: CategoriaDoc; label: string; icon: string; cor: string; bg: string }[] = [
  { valor: 'servico_tecnico', label: 'Serviço técnico', icon: '🔧', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'aluguer', label: 'Aluguer', icon: '📅', cor: '#5B21B6', bg: '#EDE9FE' },
  { valor: 'venda', label: 'Venda', icon: '🛒', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'outro', label: 'Outro', icon: '📄', cor: '#374151', bg: '#F3F4F6' },
]

export function categoriaInfo(v: string | null | undefined) {
  return CATEGORIAS.find((c) => c.valor === v) ?? null
}
export function categoriaLabel(v: string | null | undefined): string {
  return categoriaInfo(v)?.label ?? 'Por classificar'
}

// ─── Normalização ────────────────────────────────────────────────────────────

export function semAcentos(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Converte um número em texto português/inglês para float ("1.234,50" → 1234.5).
export function parseMontantePt(s: string): number {
  let t = (s ?? '').trim().replace(/[€\s]/g, '')
  if (!t) return NaN
  const temVirgula = t.includes(',')
  const temPonto = t.includes('.')
  if (temVirgula && temPonto) t = t.replace(/\./g, '').replace(',', '.')
  else if (temVirgula) t = t.replace(',', '.')
  else if (temPonto && /\.\d{3}\b/.test(t)) t = t.replace(/\./g, '') // 1.234 = milhares
  const n = Number(t)
  return isNaN(n) ? NaN : n
}

// ─── Classificação automática ────────────────────────────────────────────────

// Ordem intencional: o serviço técnico ganha a "instalação"/"formação" a uma
// eventual venda de equipamento mencionada na mesma linha.
const REGRAS: { categoria: CategoriaDoc; termos: string[] }[] = [
  {
    categoria: 'servico_tecnico',
    termos: [
      'servico tecnico', 'assistencia', 'assist tecnica', 'reparacao', 'reparacoes',
      'manutencao', 'intervencao', 'mao de obra', 'mao-de-obra', 'instalacao',
      'calibracao', 'formacao', 'avaria', 'folha de obra', 'diagnostico', 'revisao',
    ],
  },
  {
    categoria: 'aluguer',
    termos: ['aluguer', 'alugueres', 'rental', 'renda', 'mensalidade', 'locacao', 'leasing'],
  },
  {
    categoria: 'venda',
    termos: [
      'venda', 'equipamento', 'peca', 'pecas', 'consumivel', 'consumiveis',
      'material', 'acessorio', 'acessorios', 'fornecimento', 'artigo', 'kit',
    ],
  },
]

// Devolve a categoria proposta ou null ("por classificar") quando nada encaixa.
// Recebe o que houver: descrição do documento, referência e notas.
export function categorizar(...textos: (string | null | undefined)[]): CategoriaDoc | null {
  const t = semAcentos(textos.filter(Boolean).join(' '))
  if (!t.trim()) return null
  for (const r of REGRAS) {
    if (r.termos.some((termo) => t.includes(termo))) return r.categoria
  }
  return null
}

// ─── Despesas a deduzir (deslocações, alimentação, estadia) ──────────────────

export type TipoDespesa = 'deslocacao' | 'alimentacao' | 'estadia' | 'outro'

export const TIPOS_DESPESA: { valor: TipoDespesa; label: string; icon: string }[] = [
  { valor: 'deslocacao', label: 'Deslocação', icon: '🚗' },
  { valor: 'alimentacao', label: 'Alimentação', icon: '🍽️' },
  { valor: 'estadia', label: 'Estadia', icon: '🏨' },
  { valor: 'outro', label: 'Outro', icon: '🧾' },
]
export function tipoDespesaLabel(v: string): string {
  return TIPOS_DESPESA.find((t) => t.valor === v)?.label ?? 'Outro'
}

const TERMOS_DESPESA: { tipo: TipoDespesa; termos: string[] }[] = [
  { tipo: 'deslocacao', termos: ['deslocacao', 'deslocacoes', 'viagem', 'viagens', 'portagem', 'portagens', 'combustivel', 'quilometro', 'quilometros', 'transporte', 'voo', 'voos'] },
  { tipo: 'alimentacao', termos: ['alimentacao', 'refeicao', 'refeicoes', 'almoco', 'jantar', 'ajudas de custo'] },
  { tipo: 'estadia', termos: ['estadia', 'estadias', 'alojamento', 'hotel', 'hoteis', 'dormida', 'pernoita'] },
]

// Unidades que desqualificam um número como montante ("120 km", "3 dias").
const UNIDADES = /^(km|kms|kilometros|quilometros|h|horas|hora|dias|dia|noites|noite|un|uni|unidades|x)\b/i

// Extrai o montante de um segmento de texto. Só aceita números que sejam
// claramente dinheiro: com símbolo/moeda ao lado, ou com 2 casas decimais e
// sem unidade a seguir. Devolve o último encontrado (o total do segmento).
export function extrairMontante(texto: string): number | null {
  const t = texto ?? ''
  const re = /\d[\d .]*\d|\d/g
  let m: RegExpExecArray | null
  let ultimo: number | null = null
  while ((m = re.exec(t)) !== null) {
    const bruto = m[0]
    const antes = t.slice(Math.max(0, m.index - 6), m.index)
    const depois = t.slice(m.index + bruto.length)
    // Inclui a parte decimal separada por vírgula (o regex acima não a apanha).
    const dec = depois.match(/^,(\d{1,2})\b/)
    const texto_num = dec ? `${bruto},${dec[1]}` : bruto
    const resto = dec ? depois.slice(dec[0].length) : depois
    const moedaDepois = /^\s*(€|eur(os?)?\b)/i.test(resto)
    const moedaAntes = /(€|eur(os?)?)\s*$/i.test(antes)
    const temDecimais = /[.,]\d{1,2}$/.test(texto_num)
    const unidade = UNIDADES.test(resto.trimStart())
    if (unidade && !moedaDepois) continue
    if (!moedaDepois && !moedaAntes && !temDecimais) continue
    const v = parseMontantePt(texto_num)
    if (!isNaN(v) && v > 0) ultimo = v
  }
  return ultimo
}

export type DespesaDetetada = { tipo: TipoDespesa; descricao: string; valor: number }

// Lê a descrição do documento e devolve as despesas identificáveis. Cada
// segmento (separado por ; | ou quebra de linha) tem de ter termo + montante;
// o que não tiver montante fica para lançamento manual.
export function extrairDespesas(descricao: string | null | undefined): DespesaDetetada[] {
  if (!descricao) return []
  const out: DespesaDetetada[] = []
  for (const seg of descricao.split(/[;|\n]+/)) {
    const limpo = seg.trim()
    if (!limpo) continue
    const norm = semAcentos(limpo)
    const regra = TERMOS_DESPESA.find((r) => r.termos.some((t) => norm.includes(t)))
    if (!regra) continue
    const valor = extrairMontante(limpo)
    if (valor == null) continue
    out.push({ tipo: regra.tipo, descricao: limpo, valor })
  }
  return out
}
