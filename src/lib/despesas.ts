import { supabase } from './supabase'
import type {
  Despesa, DespesaInput, DespesaFoto, DespesaTipo,
  Fundo, FundoInput, ExtratoMes, AluguerAtivoOpc,
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

// As despesas do próprio (a RLS já limita ao colaborador). Filtro por mês opcional.
export async function listarMinhasDespesas(mes?: string): Promise<Despesa[]> {
  let q = supabase.from('despesas_alugueres').select('*').order('data_despesa', { ascending: false })
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

// ─── Alugueres ativos (dropdown: cliente + rótulo livre) ─────────────────────

export async function listarAlugueresAtivos(): Promise<AluguerAtivoOpc[]> {
  const { data } = await supabase
    .from('alugueres')
    .select('id, modelo, cliente_id, clientes(nome)')
    .is('data_recolha', null)
    .order('data_entrega', { ascending: false })
    .limit(300)
  type ClienteEmbed = { nome: string | null } | { nome: string | null }[] | null
  type Row = { id: string; modelo: string | null; cliente_id: string | null; clientes: ClienteEmbed }
  return ((data as unknown as Row[]) ?? []).map((r) => {
    const emb = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    const nome = emb?.nome ?? 'Cliente'
    const label = [nome, r.modelo].filter(Boolean).join(' · ')
    return { cliente_id: r.cliente_id, cliente_nome: nome, label }
  })
}
