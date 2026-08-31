// Render de templates de email de faturas de aluguer (partilhado cliente+servidor).
// Placeholders {{chave}} (mesma convenção dos templates de cotações). Sem
// dependências de Supabase/servidor — usado no preview do modal e no envio.

export type TemplateChave = 'normal' | 'curto'

export type FaturaEmailTemplate = {
  chave: TemplateChave
  assunto_template: string
  corpo_template: string
}

// Variáveis disponíveis no template.
export type FaturaEmailVars = {
  n_fatura: string
  periodo: string
  valor: string
  equipamento: string
  serial_number: string
  nome_contacto: string
  cliente_nome: string
  nome_colaborador: string
  email_colaborador: string
  telefone: string
}

// Lista dos placeholders (para mostrar na administração do template).
export const PLACEHOLDERS_FATURA: { chave: keyof FaturaEmailVars; desc: string }[] = [
  { chave: 'n_fatura', desc: 'Número da fatura (do nome do ficheiro PDF)' },
  { chave: 'periodo', desc: 'Período do aluguer (mês por extenso)' },
  { chave: 'valor', desc: 'Valor a faturar (€)' },
  { chave: 'equipamento', desc: 'Modelo do equipamento' },
  { chave: 'serial_number', desc: 'Número de série' },
  { chave: 'nome_contacto', desc: 'Nome do contacto do cliente' },
  { chave: 'cliente_nome', desc: 'Nome do cliente' },
  { chave: 'nome_colaborador', desc: 'Nome de quem envia' },
  { chave: 'email_colaborador', desc: 'Email de quem envia' },
  { chave: 'telefone', desc: 'Telefone de quem envia (opcional)' },
]

// Placeholders que, se vazios, tornam o email incompleto (avisar antes de enviar).
export const CRITICOS: (keyof FaturaEmailVars)[] = ['n_fatura', 'periodo', 'valor', 'equipamento', 'nome_contacto']

// Substitui {{chave}} pelos valores; chaves em falta ficam vazias.
export function render(template: string, vars: Partial<FaturaEmailVars>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = (vars as Record<string, string | undefined>)[k]
    return v == null ? '' : String(v)
  })
}

// Placeholders críticos que estão vazios nas variáveis (para o aviso).
export function criticosEmFalta(vars: Partial<FaturaEmailVars>): (keyof FaturaEmailVars)[] {
  return CRITICOS.filter((c) => {
    const v = (vars as Record<string, string | undefined>)[c]
    return !v || !String(v).trim()
  })
}

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// '2026-06' -> 'Junho 2026'. Se não reconhecer, devolve o valor original.
export function periodoDoMes(mes: string | null | undefined): string {
  const m = (mes ?? '').match(/^(\d{4})-(\d{2})$/)
  if (!m) return mes ?? ''
  const idx = Number(m[2]) - 1
  return idx >= 0 && idx < 12 ? `${MESES_PT[idx]} ${m[1]}` : (mes ?? '')
}

// Número da fatura a partir do nome do ficheiro PDF (ex.: 'FT2026-06.pdf' -> 'FT2026-06').
export function nFaturaDoNome(nome: string | null | undefined): string {
  if (!nome) return ''
  return nome.replace(/\.[a-z0-9]+$/i, '').trim()
}

// Formata o valor em euros (ex.: 1234.5 -> '1.234,50').
export function formatarValor(v: number | null | undefined): string {
  if (v == null) return ''
  return v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
