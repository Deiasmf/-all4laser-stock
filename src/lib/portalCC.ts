// ─────────────────────────────────────────────────────────────────────────────
// Portal do cliente (Contas Correntes) — dados só de leitura.
//
// Lê EXCLUSIVAMENTE as views v_cc_portal_* (SECURITY DEFINER, auto-filtradas por
// portal_users + auth.uid()). Nunca toca nas tabelas base cc_*, por isso nunca
// expõe valor_compra, notas internas nem reconciliações.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
export { formatarMoeda, formatarData } from './cc'

// ─── Tipos das views do portal ───────────────────────────────────────────────

export type PortalResumo = {
  conta_id: string
  conta_nome: string
  moeda: string
  saldo: number
  total_esperado: number
  total_recebido: number
  maquinas_em_stock: number
  proximo_vencimento: string | null
}

export type PortalEquipamento = {
  conta_id: string
  consignacao_id: string
  modelo: string | null
  ano: string | null
  numero_serie: string | null
  custo_declarado: number
  moeda_custo: string
  data_envio: string | null
  estado: string
}

export type PortalVenda = {
  conta_id: string
  data_venda: string
  numero_serie: string | null
  preco_venda: number
  moeda_venda: string
  custo_convertido: number | null
  margem: number | null
  partilha: number | null
  valor_devido: number | null
  estado: string
}

export type PortalPrestacao = {
  conta_id: string
  descricao: string | null
  numero: number
  data_vencimento: string
  valor: number
  moeda: string
  estado: string
  data_pagamento: string | null
}

export type PortalMovimento = {
  conta_id: string
  data: string
  descricao: string | null
  esperado: number
  recebido: number
  moeda: string
  saldo: number
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function portalContas(): Promise<PortalResumo[]> {
  const { data } = await supabase.from('v_cc_portal_resumo').select('*').order('conta_nome')
  return (data ?? []) as PortalResumo[]
}

export async function portalResumo(contaId: string): Promise<PortalResumo | null> {
  const { data } = await supabase.from('v_cc_portal_resumo').select('*').eq('conta_id', contaId).maybeSingle()
  return (data as PortalResumo) ?? null
}

export async function portalEquipamentos(contaId: string): Promise<PortalEquipamento[]> {
  const { data } = await supabase.from('v_cc_portal_equipamentos').select('*')
    .eq('conta_id', contaId).order('data_envio', { ascending: false })
  return (data ?? []) as PortalEquipamento[]
}

export async function portalVendas(contaId: string): Promise<PortalVenda[]> {
  const { data } = await supabase.from('v_cc_portal_vendas').select('*')
    .eq('conta_id', contaId).order('data_venda', { ascending: false })
  return (data ?? []) as PortalVenda[]
}

export async function portalPrestacoes(contaId: string): Promise<PortalPrestacao[]> {
  const { data } = await supabase.from('v_cc_portal_prestacoes').select('*')
    .eq('conta_id', contaId).order('data_vencimento')
  return (data ?? []) as PortalPrestacao[]
}

export async function portalExtrato(contaId: string): Promise<PortalMovimento[]> {
  const { data } = await supabase.from('v_cc_portal_extrato').select('*')
    .eq('conta_id', contaId).order('data')
  return (data ?? []) as PortalMovimento[]
}

// ─── i18n (inglês por defeito; pt-PT disponível) ─────────────────────────────

export type Lang = 'en' | 'pt'

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    brand: 'All4laser — Client Portal',
    login_title: 'Sign in', login_sub: 'Enter your email and we will send you a secure sign-in link.',
    email: 'Email', send_link: 'Send sign-in link', sending: 'Sending…',
    link_sent: 'Check your inbox (and spam) for the sign-in link.',
    login_error: 'Could not send the link. Please try again shortly.',
    loading: 'Loading…', no_access: 'This account has no client portal access.',
    logout: 'Sign out', account: 'Account', updated_at: 'Data updated at',
    nav_summary: 'Summary', nav_equipment: 'Equipment', nav_sales: 'Sales',
    nav_installments: 'Installments', nav_statement: 'Statement', nav_documents: 'Documents',
    balance: 'Current balance', open_total: 'Total outstanding', next_due: 'Next due date',
    in_stock: 'Machines in stock', received_total: 'Total received',
    col_model: 'Model', col_year: 'Year', col_serial: 'Serial no.', col_declared_cost: 'Declared cost',
    col_ship_date: 'Ship date', col_status: 'Status', col_date: 'Date', col_sale_price: 'Sale price',
    col_cost: 'Cost', col_margin: 'Margin', col_share: 'Your share', col_amount_due: 'Amount due',
    col_payment: 'Payment', col_number: 'No.', col_due: 'Due date', col_amount: 'Amount',
    col_description: 'Description', col_expected: 'Expected', col_received: 'Received', col_balance: 'Balance',
    entry: 'Deposit', no_data: 'Nothing to show yet.',
    st_em_stock: 'In stock', st_vendido: 'Sold', st_devolvido: 'Returned', st_cancelado: 'Cancelled',
    st_confirmada: 'Confirmed', st_recebida: 'Paid', st_registada: 'Registered',
    st_pendente: 'Pending', st_paga: 'Paid', st_parcial: 'Partial', st_atrasada: 'Overdue',
    contact_note: 'See something that does not match?', contact_link: 'Contact All4laser',
    documents_title: 'Statement PDF', documents_sub: 'Generate a statement for a period.',
    generate_pdf: 'Download statement (PDF)', period_all: 'All movements',
  },
  pt: {
    brand: 'All4laser — Portal do Cliente',
    login_title: 'Entrar', login_sub: 'Indica o teu email e enviamos-te um link seguro para entrar.',
    email: 'Email', send_link: 'Enviar link de acesso', sending: 'A enviar…',
    link_sent: 'Verifica a caixa de entrada (e o spam) para o link de acesso.',
    login_error: 'Não foi possível enviar o link. Tenta novamente daqui a pouco.',
    loading: 'A carregar…', no_access: 'Esta conta não tem acesso ao portal do cliente.',
    logout: 'Sair', account: 'Conta', updated_at: 'Dados atualizados em',
    nav_summary: 'Resumo', nav_equipment: 'Equipamentos', nav_sales: 'Vendas',
    nav_installments: 'Prestações', nav_statement: 'Extrato', nav_documents: 'Documentos',
    balance: 'Saldo atual', open_total: 'Total em aberto', next_due: 'Próximo vencimento',
    in_stock: 'Máquinas em stock', received_total: 'Total recebido',
    col_model: 'Modelo', col_year: 'Ano', col_serial: 'Nº de série', col_declared_cost: 'Custo declarado',
    col_ship_date: 'Data de envio', col_status: 'Estado', col_date: 'Data', col_sale_price: 'Preço de venda',
    col_cost: 'Custo', col_margin: 'Margem', col_share: 'A tua parte', col_amount_due: 'Valor devido',
    col_payment: 'Pagamento', col_number: 'Nº', col_due: 'Vencimento', col_amount: 'Valor',
    col_description: 'Descrição', col_expected: 'Esperado', col_received: 'Recebido', col_balance: 'Saldo',
    entry: 'Entrada', no_data: 'Ainda não há nada para mostrar.',
    st_em_stock: 'Em stock', st_vendido: 'Vendido', st_devolvido: 'Devolvido', st_cancelado: 'Cancelado',
    st_confirmada: 'Confirmada', st_recebida: 'Recebida', st_registada: 'Registada',
    st_pendente: 'Pendente', st_paga: 'Paga', st_parcial: 'Parcial', st_atrasada: 'Atrasada',
    contact_note: 'Vês algo que não bate certo?', contact_link: 'Contactar a All4laser',
    documents_title: 'Extrato em PDF', documents_sub: 'Gera um extrato para um período.',
    generate_pdf: 'Descarregar extrato (PDF)', period_all: 'Todos os movimentos',
  },
}

export function traduzir(lang: Lang, chave: string): string {
  return DICT[lang][chave] ?? DICT.en[chave] ?? chave
}

// Estado localizado (as views devolvem o valor cru, ex.: 'em_stock', 'paga').
export function estadoLabel(lang: Lang, estado: string): string {
  return traduzir(lang, 'st_' + estado)
}

export const CONTACTO_EMAIL = 'geral@all4laser.com'
