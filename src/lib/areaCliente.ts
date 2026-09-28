import { supabase } from './supabase'

export type ClientePortalCompleto = {
  id: string
  cliente_id: string | null
  nome: string | null
  email: string | null
  telefone: string | null
  empresa: string | null
  nif: string | null
  morada: string | null
  faturacao_nome: string | null
  faturacao_nif: string | null
  faturacao_morada: string | null
  preferencias_lembretes: Record<string, boolean>
  ativo: boolean
}

export type ClienteDocumento = {
  id: string
  categoria: 'fatura' | 'contrato' | 'certificado_formacao' | 'outro'
  titulo: string
  descricao: string | null
  data_documento: string | null
  caminho: string
  mime_type: string | null
  tamanho_bytes: number | null
  created_at: string
}

export type EquipamentoReservaCliente = {
  id: string
  equipamento_id: string | null
  nome: string
  modelo: string | null
  numero_serie: string | null
  descricao: string | null
  zona: string | null
  ativo: boolean
}

export type ReservaCliente = {
  id: string
  numero: string | null
  cliente_portal_id: string
  cliente_id: string | null
  equipamento_reserva_id: string
  modelo: string | null
  data_inicio: string
  data_fim: string
  local_utilizacao: string | null
  observacoes: string | null
  estado: 'pendente' | 'confirmada' | 'concluida' | 'cancelada'
  pedido_alteracao: string | null
  created_at: string
  cliente_equipamentos_reserva?: { nome: string; modelo: string | null; numero_serie: string | null } | null
}

export type GaleriaMaterial = {
  id: string
  titulo: string
  equipamento: string | null
  tratamento: string | null
  campanha: string | null
  formato: 'publicacao' | 'story' | 'reel' | 'outro'
  legenda_sugerida: string | null
  caminho: string
  mime_type: string | null
  tamanho_bytes: number | null
  ativo: boolean
  created_at: string
}

export type AssistenciaPedido = {
  id: string
  numero: string | null
  cliente_portal_id: string
  cliente_id: string | null
  equipamento: string
  numero_serie: string | null
  descricao: string
  equipamento_parado: boolean
  contacto: string | null
  estado: 'recebido' | 'em_analise' | 'em_resolucao' | 'resolvido'
  email_assistencia_estado: 'pendente' | 'enviado' | 'falhou'
  email_assistencia_erro: string | null
  created_at: string
  updated_at: string
}

export type AssistenciaMensagem = {
  id: string
  pedido_id: string
  cliente_portal_id: string
  visivel_cliente: boolean
  autor_tipo: 'cliente' | 'equipa'
  autor_nome: string | null
  mensagem: string
  created_at: string
}

export type AgendamentoCliente = {
  id: string
  tipo: 'aluguer' | 'formacao' | 'assistencia'
  titulo: string
  descricao: string | null
  inicio: string
  fim: string | null
  timezone: string
  estado: 'agendado' | 'confirmado' | 'alteracao_pedida' | 'cancelado' | 'concluido'
  referencia_tipo: string | null
  referencia_id: string | null
}

export type DashboardCliente = {
  cliente: ClientePortalCompleto | null
  reservas: ReservaCliente[]
  documentos: ClienteDocumento[]
  assistencia: AssistenciaPedido[]
  agendamentos: AgendamentoCliente[]
}

export function dataPt(data: string | null | undefined): string {
  if (!data) return '-'
  const d = data.slice(0, 10).split('-')
  if (d.length !== 3) return data
  return `${d[2]}/${d[1]}/${d[0]}`
}

export function estadoReservaLabel(estado: ReservaCliente['estado']) {
  return ({ pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluida', cancelada: 'Cancelada' } as const)[estado] ?? estado
}

export function estadoAssistenciaLabel(estado: AssistenciaPedido['estado']) {
  return ({ recebido: 'Recebido', em_analise: 'Em analise', em_resolucao: 'Em resolucao', resolvido: 'Resolvido' } as const)[estado] ?? estado
}

export async function perfilClienteAtual(): Promise<ClientePortalCompleto | null> {
  const { data } = await supabase.from('clientes_portal').select('*').single()
  return (data as ClientePortalCompleto) ?? null
}

export async function atualizarPerfilCliente(id: string, patch: Partial<ClientePortalCompleto>) {
  return supabase.from('clientes_portal').update(patch).eq('id', id)
}

export async function dashboardCliente(): Promise<DashboardCliente> {
  const cliente = await perfilClienteAtual()
  const [reservas, documentos, assistencia, agendamentos] = await Promise.all([
    supabase.from('cliente_reservas').select('*, cliente_equipamentos_reserva(nome, modelo, numero_serie)').order('created_at', { ascending: false }).limit(5),
    supabase.from('cliente_documentos').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('cliente_assistencia_pedidos').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('cliente_agendamentos').select('*').gte('inicio', new Date().toISOString()).order('inicio').limit(5),
  ])
  return {
    cliente,
    reservas: (reservas.data as ReservaCliente[]) ?? [],
    documentos: (documentos.data as ClienteDocumento[]) ?? [],
    assistencia: (assistencia.data as AssistenciaPedido[]) ?? [],
    agendamentos: (agendamentos.data as AgendamentoCliente[]) ?? [],
  }
}

export async function listarDocumentosCliente(): Promise<ClienteDocumento[]> {
  const { data } = await supabase.from('cliente_documentos').select('*').order('data_documento', { ascending: false }).order('created_at', { ascending: false })
  return (data as ClienteDocumento[]) ?? []
}

export async function listarEquipamentosReserva(): Promise<EquipamentoReservaCliente[]> {
  const { data } = await supabase.from('cliente_equipamentos_reserva').select('*').eq('ativo', true).order('nome')
  return (data as EquipamentoReservaCliente[]) ?? []
}

export async function listarReservasCliente(): Promise<ReservaCliente[]> {
  const { data } = await supabase.from('cliente_reservas').select('*, cliente_equipamentos_reserva(nome, modelo, numero_serie)').order('data_inicio', { ascending: false })
  return (data as ReservaCliente[]) ?? []
}

export async function criarReservaCliente(input: {
  cliente_portal_id: string
  cliente_id: string | null
  equipamento_reserva_id: string
  modelo: string | null
  data_inicio: string
  data_fim: string
  local_utilizacao: string | null
  observacoes: string | null
}) {
  return supabase.from('cliente_reservas').insert(input).select('id, numero').single()
}

export async function pedirAlteracaoReserva(id: string, texto: string) {
  return supabase.from('cliente_reservas').update({ pedido_alteracao: texto, estado: 'pendente' }).eq('id', id)
}

export async function cancelarReservaCliente(id: string) {
  return supabase.from('cliente_reservas').update({ estado: 'cancelada' }).eq('id', id)
}

export async function listarGaleriaCliente(): Promise<GaleriaMaterial[]> {
  const { data } = await supabase.from('cliente_galeria_materiais').select('*').eq('ativo', true).order('created_at', { ascending: false }).limit(1000)
  return (data as GaleriaMaterial[]) ?? []
}

export async function listarAssistenciaCliente(): Promise<AssistenciaPedido[]> {
  const { data } = await supabase.from('cliente_assistencia_pedidos').select('*').order('created_at', { ascending: false })
  return (data as AssistenciaPedido[]) ?? []
}

export async function obterAssistenciaCliente(id: string): Promise<{ pedido: AssistenciaPedido | null; mensagens: AssistenciaMensagem[] }> {
  const [pedido, mensagens] = await Promise.all([
    supabase.from('cliente_assistencia_pedidos').select('*').eq('id', id).single(),
    supabase.from('cliente_assistencia_mensagens').select('*').eq('pedido_id', id).order('created_at'),
  ])
  return { pedido: (pedido.data as AssistenciaPedido) ?? null, mensagens: (mensagens.data as AssistenciaMensagem[]) ?? [] }
}

export async function acrescentarMensagemAssistencia(pedidoId: string, clientePortalId: string, mensagem: string) {
  return supabase.from('cliente_assistencia_mensagens').insert({
    pedido_id: pedidoId,
    cliente_portal_id: clientePortalId,
    autor_tipo: 'cliente',
    autor_nome: 'Cliente',
    mensagem,
  })
}

export async function listarAgendamentosCliente(): Promise<AgendamentoCliente[]> {
  const { data } = await supabase.from('cliente_agendamentos').select('*').order('inicio')
  return (data as AgendamentoCliente[]) ?? []
}

export async function atualizarPreferenciasLembretes(clientePortalId: string, prefs: Record<string, boolean>) {
  return supabase.from('clientes_portal').update({ preferencias_lembretes: prefs }).eq('id', clientePortalId)
}

// Admin
export async function listarClientesPortalAdmin(): Promise<ClientePortalCompleto[]> {
  const { data } = await supabase.from('clientes_portal').select('*').order('created_at', { ascending: false }).limit(1000)
  return (data as ClientePortalCompleto[]) ?? []
}

export async function listarReservasAdmin(): Promise<ReservaCliente[]> {
  const { data } = await supabase.from('cliente_reservas').select('*, cliente_equipamentos_reserva(nome, modelo, numero_serie)').order('created_at', { ascending: false }).limit(1000)
  return (data as ReservaCliente[]) ?? []
}

export async function listarAssistenciaAdmin(): Promise<AssistenciaPedido[]> {
  const { data } = await supabase.from('cliente_assistencia_pedidos').select('*').order('created_at', { ascending: false }).limit(1000)
  return (data as AssistenciaPedido[]) ?? []
}

export async function atualizarEstadoReservaAdmin(id: string, estado: ReservaCliente['estado'], validador: { id: string | null; nome: string | null }) {
  return supabase.from('cliente_reservas').update({
    estado,
    validado_por: validador.id,
    validado_por_nome: validador.nome,
    validado_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function atualizarEstadoAssistenciaAdmin(id: string, estado: AssistenciaPedido['estado']) {
  return supabase.from('cliente_assistencia_pedidos').update({ estado }).eq('id', id)
}

export async function responderAssistenciaAdmin(pedido: AssistenciaPedido, mensagem: string, autor: string | null, visivelCliente: boolean) {
  return supabase.from('cliente_assistencia_mensagens').insert({
    pedido_id: pedido.id,
    cliente_portal_id: pedido.cliente_portal_id,
    autor_tipo: 'equipa',
    autor_nome: autor,
    mensagem,
    visivel_cliente: visivelCliente,
  })
}

export async function criarEquipamentoReservaAdmin(input: Partial<EquipamentoReservaCliente>) {
  return supabase.from('cliente_equipamentos_reserva').insert({
    nome: input.nome?.trim(),
    modelo: input.modelo?.trim() || null,
    numero_serie: input.numero_serie?.trim() || null,
    descricao: input.descricao?.trim() || null,
    zona: input.zona?.trim() || null,
  })
}

