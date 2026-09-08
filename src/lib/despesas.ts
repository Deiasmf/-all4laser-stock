import { supabase } from './supabase'
import type {
  Despesa, DespesaInput, DespesaFoto, DespesaTipo,
  Fundo, FundoInput, ExtratoMes, AluguerAtivoOpc, ApuramentoColaborador,
} from '@/types/despesa'

export const BUCKET_DESPESAS = 'despesas-alugueres'

type Autor = { id: string | null; nome: string | null }

// Mês corrente 'YYYY-MM' na hora de Lisboa (para filtrar por omissão).
export function mesCorrente(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' }).slice(0, 7)
}

// ─── Tipos de despesa ────────────────────────────────────────────────────────

// Todos os tipos usáveis (aprovados + pendentes), aprovados primeiro. Exclui os
// que foram fundidos noutro (fundido_em não nulo).
export async function listarTipos(): Promise<DespesaTipo[]> {
  const { data } = await supabase
    .from('despesas_tipos')
    .select('*')
    .is('fundido_em', null)
    .order('estado', { ascending: true })   // 'aprovado' < 'pendente'
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  return (data as DespesaTipo[]) ?? []
}

// Cria um tipo novo (fica 'pendente'). Se já existir (por nome), devolve o existente.
export async function criarTipo(nome: string, autor: Autor): Promise<DespesaTipo | null> {
  const limpo = nome.trim()
  if (!limpo) return null
  const { data, error } = await supabase
    .from('despesas_tipos')
    .insert({ nome: limpo, estado: 'pendente', criado_por: autor.id, criado_por_nome: autor.nome })
    .select().single()
  if (!error && data) return data as DespesaTipo
  // Conflito no índice único (lower(nome)) → devolve o que já existe.
  const { data: exist } = await supabase
    .from('despesas_tipos').select('*').ilike('nome', limpo).limit(1).maybeSingle()
  return (exist as DespesaTipo) ?? null
}

// ─── Despesas ────────────────────────────────────────────────────────────────

export async function listarMeusFundosDoColaborador(colaboradorId?: string, mes?: string): Promise<Fundo[]> {
  let q = supabase.from('despesas_fundos').select('*').order('data', { ascending: false })
  if (colaboradorId) q = q.eq('colaborador_id', colaboradorId)
  if (mes) q = q.eq('mes_apuramento', mes)
  const { data } = await q
  return (data as Fundo[]) ?? []
}

// As despesas de um colaborador (o financeiro vê tudo pela RLS, por isso filtra-se
// explicitamente pelo próprio na vista pessoal). Filtro por mês opcional.
export async function listarMinhasDespesas(colaboradorId?: string, mes?: string): Promise<Despesa[]> {
  let q = supabase.from('despesas_alugueres').select('*').order('data_despesa', { ascending: false })
  if (colaboradorId) q = q.eq('colaborador_id', colaboradorId)
  if (mes) q = q.eq('mes_apuramento', mes)
  const { data } = await q
  return (data as Despesa[]) ?? []
}

export async function criarDespesa(input: DespesaInput, autor: Autor) {
  return supabase
    .from('despesas_alugueres')
    .insert({ ...input, colaborador_nome: autor.nome })   // colaborador_id vem do default auth.uid()
    .select().single()
}

export async function atualizarDespesa(id: string, patch: Partial<DespesaInput>) {
  return supabase.from('despesas_alugueres').update(patch).eq('id', id).select().single()
}

export async function apagarDespesa(id: string) {
  // As fotos vão por cascade (FK on delete cascade); limpa também o bucket.
  const fotos = await listarFotosDespesa(id)
  const caminhos = fotos.map((f) => f.caminho)
  if (caminhos.length) await supabase.storage.from(BUCKET_DESPESAS).remove(caminhos)
  return supabase.from('despesas_alugueres').delete().eq('id', id)
}

// Duplicado: mesma data + mesmo valor + mesmo fornecedor (do próprio colaborador).
export async function detetarDuplicado(
  data: string, valor: number, fornecedor: string | null,
): Promise<Despesa | null> {
  let q = supabase.from('despesas_alugueres').select('*').eq('data_despesa', data).eq('valor', valor)
  if (fornecedor && fornecedor.trim()) q = q.ilike('fornecedor', fornecedor.trim())
  const { data: rows } = await q.limit(1)
  return ((rows as Despesa[]) ?? [])[0] ?? null
}

// ─── Fotos (bucket privado; caminho por pasta de utilizador) ─────────────────

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}

export async function listarFotosDespesa(despesaId: string): Promise<DespesaFoto[]> {
  const { data } = await supabase
    .from('despesas_fotos').select('*').eq('despesa_id', despesaId).order('ordem', { ascending: true })
  return (data as DespesaFoto[]) ?? []
}

// Carrega ficheiros para o bucket em {colaboradorId}/{despesaId}/... e regista-os.
export async function carregarFotosDespesa(
  colaboradorId: string, despesaId: string, ficheiros: File[],
): Promise<{ carregadas: number; falhas: string[] }> {
  const res = { carregadas: 0, falhas: [] as string[] }
  let ordem = 0
  for (const f of ficheiros) {
    const caminho = `${colaboradorId}/${despesaId}/${Date.now()}-${ordem}-${nomeSeguro(f.name)}`
    const { error } = await supabase.storage.from(BUCKET_DESPESAS).upload(caminho, f, { contentType: f.type || undefined })
    if (error) { res.falhas.push(f.name); continue }
    const { error: erroBd } = await supabase.from('despesas_fotos').insert({ despesa_id: despesaId, caminho, ordem })
    if (erroBd) { res.falhas.push(f.name); continue }
    res.carregadas++; ordem++
  }
  return res
}

export async function urlFotoDespesa(caminho: string, segundos = 120): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_DESPESAS).createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}

// Comprime uma imagem para ~maxLado px (lado maior), JPEG. PDFs/outros passam intactos.
export async function comprimirImagem(file: File, maxLado = 2000, qualidade = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
    if (escala >= 1) return file   // já é pequena
    const w = Math.round(bitmap.width * escala)
    const h = Math.round(bitmap.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', qualidade))
    if (!blob) return file
    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// ─── Fundos em mãos ──────────────────────────────────────────────────────────

export async function listarMeusFundos(mes?: string): Promise<Fundo[]> {
  let q = supabase.from('despesas_fundos').select('*').order('data', { ascending: false })
  if (mes) q = q.eq('mes_apuramento', mes)
  const { data } = await q
  return (data as Fundo[]) ?? []
}

export async function criarFundo(input: FundoInput, autor: Autor) {
  return supabase
    .from('despesas_fundos')
    .insert({ ...input, colaborador_nome: autor.nome, criado_por: autor.id, criado_por_nome: autor.nome })
    .select().single()
}

export async function apagarFundo(id: string) {
  return supabase.from('despesas_fundos').delete().eq('id', id)
}

// Extrato do mês do próprio (recebido − despesas − entregue).
export function calcularExtrato(despesas: Despesa[], fundos: Fundo[]): ExtratoMes {
  const recebido = fundos.filter((f) => f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor), 0)
  const entregue = fundos.filter((f) => f.tipo === 'entrega').reduce((s, f) => s + Number(f.valor), 0)
  const totDespesas = despesas.reduce((s, d) => s + Number(d.valor), 0)
  return { recebido, despesas: totDespesas, entregue, apuramento: recebido - totDespesas - entregue }
}

// ─── Mês fechado? (para bloquear edição no cliente) ──────────────────────────

export async function mesFechado(mes: string): Promise<boolean> {
  const { data } = await supabase.from('despesas_meses_fechados').select('mes').eq('mes', mes).maybeSingle()
  return !!data
}

export type MesFechado = { mes: string; snapshot: unknown; fechado_por_nome: string | null; fechado_em: string }

export async function obterMesFechado(mes: string): Promise<MesFechado | null> {
  const { data } = await supabase
    .from('despesas_meses_fechados').select('mes, snapshot, fechado_por_nome, fechado_em').eq('mes', mes).maybeSingle()
  return (data as MesFechado) ?? null
}

// ─── Alugueres ativos (dropdown: cliente + rótulo livre) ─────────────────────

// ─── Gestão (admin/financeiro) ───────────────────────────────────────────────

export type Colaborador = { id: string; nome: string | null; email: string | null }

export async function listarColaboradores(): Promise<Colaborador[]> {
  const { data } = await supabase.from('profiles').select('id, nome, email').order('nome')
  return (data as Colaborador[]) ?? []
}

// Todas as despesas de um mês (a RLS dá tudo ao financeiro).
export async function listarDespesasMes(mes: string): Promise<Despesa[]> {
  const { data } = await supabase
    .from('despesas_alugueres').select('*').eq('mes_apuramento', mes)
    .order('data_despesa', { ascending: false })
  return (data as Despesa[]) ?? []
}

export async function listarFundosMes(mes: string): Promise<Fundo[]> {
  const { data } = await supabase
    .from('despesas_fundos').select('*').eq('mes_apuramento', mes).order('data', { ascending: false })
  return (data as Fundo[]) ?? []
}

// Marca/desmarca uma despesa como conferida (só enquanto o mês está aberto).
export async function conferirDespesa(id: string, conferida: boolean, autor: Autor) {
  return supabase.from('despesas_alugueres').update(
    conferida
      ? { estado: 'conferida', conferida_por: autor.id, conferida_por_nome: autor.nome, conferida_em: new Date().toISOString() }
      : { estado: 'registada', conferida_por: null, conferida_por_nome: null, conferida_em: null },
  ).eq('id', id).select().single()
}

// ─── Gestão de tipos ─────────────────────────────────────────────────────────

// Todos os tipos ativos (não fundidos), pendentes primeiro (para o financeiro tratar).
export async function listarTiposGestao(): Promise<DespesaTipo[]> {
  const { data } = await supabase.from('despesas_tipos').select('*').is('fundido_em', null)
    .order('estado', { ascending: false })   // 'pendente' > 'aprovado'
    .order('nome', { ascending: true })
  return (data as DespesaTipo[]) ?? []
}

// Todos os tipos (incluindo fundidos) — para resolver nomes na cadeia fundido_em.
export async function listarTodosTipos(): Promise<DespesaTipo[]> {
  const { data } = await supabase.from('despesas_tipos').select('*').order('nome')
  return (data as DespesaTipo[]) ?? []
}

export async function aprovarTipo(id: string) {
  return supabase.from('despesas_tipos').update({ estado: 'aprovado' }).eq('id', id)
}

export async function renomearTipo(id: string, nome: string) {
  return supabase.from('despesas_tipos').update({ nome: nome.trim() }).eq('id', id)
}

// Funde `origemId` em `destinoId`: marca a origem como fundida (some das listas) e
// reatribui as despesas de meses ABERTOS. Nos meses fechados o nome resolve-se pela
// cadeia fundido_em (ver resolverNomeTipo) — não se mexe em histórico congelado.
export async function fundirTipo(origemId: string, destinoId: string) {
  const { data: abertas } = await supabase
    .from('despesas_alugueres').select('id, mes_apuramento').eq('tipo_id', origemId)
  const { data: fechados } = await supabase.from('despesas_meses_fechados').select('mes')
  const mesesFechados = new Set(((fechados as { mes: string }[]) ?? []).map((m) => m.mes))
  const ids = ((abertas as { id: string; mes_apuramento: string }[]) ?? [])
    .filter((d) => !mesesFechados.has(d.mes_apuramento)).map((d) => d.id)
  if (ids.length) await supabase.from('despesas_alugueres').update({ tipo_id: destinoId }).in('id', ids)
  return supabase.from('despesas_tipos').update({ fundido_em: destinoId }).eq('id', origemId)
}

// Nome efetivo de um tipo, seguindo a cadeia fundido_em.
export function resolverNomeTipo(id: string | null, tipos: DespesaTipo[]): string {
  if (!id) return '—'
  const mapa = new Map(tipos.map((t) => [t.id, t]))
  let t = mapa.get(id)
  const visto = new Set<string>()
  while (t?.fundido_em && !visto.has(t.id)) { visto.add(t.id); t = mapa.get(t.fundido_em) }
  return t?.nome ?? '—'
}

// Apuramento do mês por colaborador (para o mapa). `tipos` resolve nomes (com fundido_em).
export function apurarMes(
  despesas: Despesa[], fundos: Fundo[], colaboradores: Colaborador[], tipos: DespesaTipo[],
): ApuramentoColaborador[] {
  const nome = (id: string) => {
    const c = colaboradores.find((x) => x.id === id)
    return c?.nome ?? c?.email ?? 'Colaborador'
  }
  // Junta os ids de colaborador que aparecem em despesas ou fundos.
  const ids = new Set<string>()
  despesas.forEach((d) => ids.add(d.colaborador_id))
  fundos.forEach((f) => ids.add(f.colaborador_id))
  const linhas: ApuramentoColaborador[] = []
  for (const id of ids) {
    const ds = despesas.filter((d) => d.colaborador_id === id)
    const fs = fundos.filter((f) => f.colaborador_id === id)
    const porTipo: Record<string, number> = {}
    for (const d of ds) {
      const t = resolverNomeTipo(d.tipo_id, tipos)
      porTipo[t] = (porTipo[t] ?? 0) + Number(d.valor)
    }
    const recebido = fs.filter((f) => f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor), 0)
    const entregue = fs.filter((f) => f.tipo === 'entrega').reduce((s, f) => s + Number(f.valor), 0)
    const totDespesas = ds.reduce((s, d) => s + Number(d.valor), 0)
    linhas.push({
      colaborador_id: id, colaborador_nome: nome(id), recebido, porTipo,
      despesas: totDespesas, entregue, apuramento: recebido - totDespesas - entregue,
    })
  }
  return linhas.sort((a, b) => a.colaborador_nome.localeCompare(b.colaborador_nome, 'pt'))
}

// ─── Fechar mês ──────────────────────────────────────────────────────────────

// Marca as despesas escolhidas como conferidas e congela o mês (imutável).
export async function fecharMes(
  mes: string, idsConferir: string[], snapshot: unknown, autor: Autor,
) {
  if (idsConferir.length) {
    await supabase.from('despesas_alugueres').update({
      estado: 'conferida', conferida_por: autor.id, conferida_por_nome: autor.nome,
      conferida_em: new Date().toISOString(),
    }).in('id', idsConferir)
  }
  return supabase.from('despesas_meses_fechados')
    .insert({ mes, snapshot, fechado_por: autor.id, fechado_por_nome: autor.nome })
    .select().single()
}

type ClienteEmbed = { nome: string | null } | { nome: string | null }[] | null
function nomeEmbed(c: ClienteEmbed): string {
  const emb = Array.isArray(c) ? c[0] : c
  return emb?.nome ?? 'Cliente'
}

export async function listarAlugueresAtivos(): Promise<AluguerAtivoOpc[]> {
  const { data } = await supabase
    .from('alugueres')
    .select('id, modelo, cliente_id, clientes(nome)')
    .is('data_recolha', null)
    .order('data_entrega', { ascending: false })
    .limit(300)
  type Row = { id: string; modelo: string | null; cliente_id: string | null; clientes: ClienteEmbed }
  return ((data as unknown as Row[]) ?? []).map((r) => {
    const nome = nomeEmbed(r.clientes)
    return { cliente_id: r.cliente_id, cliente_nome: nome, label: [nome, r.modelo].filter(Boolean).join(' · ') }
  })
}

// Alugueres recolhidos nas últimas ~48h (para o "Recebi do cliente" — recebe-se o
// dinheiro na altura da recolha). `data_recolha` é uma date, por isso a janela é
// ontem + hoje. O rótulo inclui a data de recolha para desambiguar.
export async function listarAlugueresRecolhidosRecentes(): Promise<AluguerAtivoOpc[]> {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const ontem = new Date(new Date(hoje).getTime() - 86400000).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('alugueres')
    .select('id, modelo, cliente_id, data_recolha, clientes(nome)')
    .gte('data_recolha', ontem)
    .order('data_recolha', { ascending: false })
    .limit(300)
  type Row = { id: string; modelo: string | null; cliente_id: string | null; data_recolha: string | null; clientes: ClienteEmbed }
  return ((data as unknown as Row[]) ?? []).map((r) => {
    const nome = nomeEmbed(r.clientes)
    const dr = r.data_recolha ? (() => { const [, m, d] = r.data_recolha!.split('-'); return `recolhido ${d}/${m}` })() : null
    return { cliente_id: r.cliente_id, cliente_nome: nome, label: [nome, r.modelo, dr].filter(Boolean).join(' · ') }
  })
}
