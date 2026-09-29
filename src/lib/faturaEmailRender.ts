// Render de templates de email de faturas de aluguer (partilhado cliente+servidor).
// Placeholders {chave} (chavetas simples; {{chave}} também é aceite por
// compatibilidade). Sem dependências de Supabase/servidor — usado no preview do
// modal e no envio.

export type TemplateChave = 'normal' | 'curto'

export type FaturaEmailTemplate = {
  chave: TemplateChave
  assunto_template: string
  corpo_template: string
  // Quando false, o email NÃO acrescenta a assinatura do Gmail no fim (o
  // template já fecha com a sua própria assinatura de departamento).
  incluir_assinatura?: boolean
}

// Variáveis disponíveis no template. (valor/cliente_nome mantidos como aliases
// de valor_total/nome_cliente por compatibilidade com templates antigos.)
export type FaturaEmailVars = {
  n_fatura: string
  data_fatura: string
  nome_cliente: string
  valor_total: string
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
  { chave: 'data_fatura', desc: 'Data da fatura (dd/mm/aaaa)' },
  { chave: 'nome_cliente', desc: 'Nome do cliente' },
  { chave: 'valor_total', desc: 'Valor total a faturar (ex.: 1.250,00)' },
  { chave: 'periodo', desc: 'Período do aluguer (mês por extenso)' },
  { chave: 'equipamento', desc: 'Modelo do equipamento' },
  { chave: 'serial_number', desc: 'Número de série' },
  { chave: 'nome_contacto', desc: 'Nome do contacto do cliente' },
  { chave: 'nome_colaborador', desc: 'Nome de quem envia' },
  { chave: 'email_colaborador', desc: 'Email de quem envia' },
  { chave: 'telefone', desc: 'Telefone de quem envia (opcional)' },
]

// Placeholders que, se vazios, tornam o email incompleto (avisar antes de enviar).
export const CRITICOS: (keyof FaturaEmailVars)[] = ['n_fatura', 'data_fatura', 'valor_total']

// Substitui {chave} e {{chave}} pelos valores; chaves em falta ficam vazias.
// Faz primeiro as chavetas duplas e só depois as simples (para não partir
// templates antigos que ainda usem {{...}}).
export function render(template: string, vars: Partial<FaturaEmailVars>): string {
  const sub = (k: string) => {
    const v = (vars as Record<string, string | undefined>)[k]
    return v == null ? '' : String(v)
  }
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => sub(k))
    .replace(/\{\s*(\w+)\s*\}/g, (_, k: string) => sub(k))
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

// Número da fatura a partir do nome do ficheiro PDF. O nome costuma ser
// 'NUMERO_CODIGOCLIENTE_HASH.pdf' (ex.: '71000000723_CAROLINAPE_3EBA8.pdf');
// ficamos só com o número ('71000000723'). Sem '_', devolve o nome sem extensão
// (ex.: 'FT2026-06.pdf' -> 'FT2026-06').
export function nFaturaDoNome(nome: string | null | undefined): string {
  if (!nome) return ''
  const semExt = nome.replace(/\.[a-z0-9]+$/i, '').trim()
  return semExt.split('_')[0].trim()
}

// Formata o valor em euros (ex.: 1234.5 -> '1.234,50').
export function formatarValor(v: number | null | undefined): string {
  if (v == null) return ''
  return v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Data da fatura em dd/mm/aaaa (a partir do created_at do registo). '' se inválida.
export function formatarDataFatura(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}
