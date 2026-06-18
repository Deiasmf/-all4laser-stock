import { supabase } from './supabase'
import { iniciais } from './ui'
import { alterarEstadoNota } from './notasEncomenda'
import type { NotaEncomenda } from '@/types/notaEncomenda'

// ─── Fases do fluxo de preparação/expedição ─────────────────────────────────

export type Fase =
  | 'logistica_preparacao'
  | 'tecnico_preparacao'
  | 'logistica_encaixotamento'
  | 'admin_expedicao'

export type EstadoFase = 'pendente' | 'em_curso' | 'concluido'

export type FluxoFase = {
  id: string
  nota_id: string
  fase: Fase
  estado: EstadoFase
  responsavel_id: string | null
  responsavel_nome: string | null
  notas: string | null
  concluido_at: string | null
}

export const ORDEM_FASES: Fase[] = [
  'logistica_preparacao',
  'tecnico_preparacao',
  'logistica_encaixotamento',
  'admin_expedicao',
]

// Config por fase: rótulo, área do comunicado e emails dos responsáveis
// (verificados em utilizadores_autorizados). `pagina` é o destino do link.
export const FASE_CONFIG: Record<Fase, { label: string; area: string; emails: string[]; pagina: string }> = {
  logistica_preparacao: {
    label: 'Preparação Logística',
    area: 'logistica',
    emails: ['sara.evaristo@all4laser.com', 'rafael.santana@all4laser.com'],
    pagina: '/logistico/preparacao',
  },
  tecnico_preparacao: {
    label: 'Preparação Técnica',
    area: 'tecnico',
    emails: ['bruno.liborio@all4laser.com', 'dinis.agueda@all4laser.com'],
    pagina: '/tecnico/preparacao',
  },
  logistica_encaixotamento: {
    label: 'Encaixotamento',
    area: 'logistica',
    emails: ['sara.evaristo@all4laser.com', 'rafael.santana@all4laser.com'],
    pagina: '/logistico/encaixotamento',
  },
  admin_expedicao: {
    label: 'Expedição',
    area: 'admin',
    emails: ['vanessa.tavares@all4laser.com'],
    pagina: '/admin-dept/expedicao',
  },
}

// ─── Criação e leitura do fluxo ──────────────────────────────────────────────

// Cria as 4 fases ao emitir uma nota (1ª em curso, restantes pendentes).
// Idempotente: se já existir o fluxo, não duplica.
export async function criarFluxoInicial(notaId: string) {
  const linhas = ORDEM_FASES.map((fase, i) => ({
    nota_id: notaId,
    fase,
    estado: (i === 0 ? 'em_curso' : 'pendente') as EstadoFase,
  }))
  return supabase.from('ne_fluxo').upsert(linhas, { onConflict: 'nota_id,fase', ignoreDuplicates: true })
}

// Notas com uma fase específica em curso (para as páginas de departamento).
export async function listarNotasNaFase(fase: Fase): Promise<NotaEncomenda[]> {
  const { data } = await supabase
    .from('ne_fluxo')
    .select('nota:notas_encomenda(*)')
    .eq('fase', fase)
    .eq('estado', 'em_curso')
  const linhas = (data ?? []) as unknown as { nota: NotaEncomenda | null }[]
  return linhas
    .map((l) => l.nota)
    .filter((n): n is NotaEncomenda => !!n)
    .sort((a, b) => (a.data_pedido < b.data_pedido ? 1 : -1))
}

// Contagem por etapa do fluxo, para o painel de evolução no Dashboard.
export type FluxoContagem = {
  notas: number
  prepLogistica: number
  prepTecnica: number
  encaixotar: number
  expedir: number
  expedida: number
}

export async function contarFluxoNotas(): Promise<FluxoContagem> {
  const [notasRes, expedidaRes, fluxoRes] = await Promise.all([
    supabase.from('notas_encomenda').select('id', { count: 'exact', head: true }),
    supabase.from('notas_encomenda').select('id', { count: 'exact', head: true }).eq('estado', 'expedida'),
    supabase.from('ne_fluxo').select('fase').eq('estado', 'em_curso'),
  ])
  const fases = ((fluxoRes.data as { fase: Fase }[] | null) ?? [])
  const cont = (f: Fase) => fases.filter((x) => x.fase === f).length
  return {
    notas: notasRes.count ?? 0,
    prepLogistica: cont('logistica_preparacao'),
    prepTecnica: cont('tecnico_preparacao'),
    encaixotar: cont('logistica_encaixotamento'),
    expedir: cont('admin_expedicao'),
    expedida: expedidaRes.count ?? 0,
  }
}

// Todas as fases de uma nota, pela ordem do fluxo.
export async function obterFluxo(notaId: string): Promise<FluxoFase[]> {
  const { data } = await supabase.from('ne_fluxo').select('*').eq('nota_id', notaId)
  return ((data as FluxoFase[]) ?? []).sort(
    (a, b) => ORDEM_FASES.indexOf(a.fase) - ORDEM_FASES.indexOf(b.fase)
  )
}

// ─── Transição de fases ──────────────────────────────────────────────────────

type Responsavel = { id: string | null; nome: string | null }

// Conclui a fase atual e avança o fluxo. Na última fase, expede a nota e marca
// o equipamento como "Enviado". Notifica (comunicado + email) os responsáveis
// da fase seguinte.
export async function concluirFase(
  nota: NotaEncomenda,
  fase: Fase,
  responsavel: Responsavel,
  notas?: string | null
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('ne_fluxo')
    .update({
      estado: 'concluido',
      concluido_at: new Date().toISOString(),
      responsavel_id: responsavel.id,
      responsavel_nome: responsavel.nome,
      notas: notas ?? null,
    })
    .eq('nota_id', nota.id)
    .eq('fase', fase)
  if (error) return { error }

  const proxima = ORDEM_FASES[ORDEM_FASES.indexOf(fase) + 1]

  if (proxima) {
    await supabase.from('ne_fluxo').update({ estado: 'em_curso' }).eq('nota_id', nota.id).eq('fase', proxima)
    if (nota.estado === 'emitida') await alterarEstadoNota(nota.id, 'em_preparacao')
    await notificarFase(nota, proxima, responsavel).catch(() => {})
  } else {
    await alterarEstadoNota(nota.id, 'expedida')
    if (nota.equipamento_id) {
      await supabase.from('equipamentos').update({ status: 'Enviado' }).eq('id', nota.equipamento_id)
    }
    await notificarExpedida(nota, responsavel).catch(() => {})
  }
  return { error: null }
}

// ─── Notificações (comunicado in-app + email) ────────────────────────────────

async function notificarFase(nota: NotaEncomenda, fase: Fase, autor: Responsavel) {
  const cfg = FASE_CONFIG[fase]
  const autorNome = autor.nome ?? 'Sistema'
  const corpo =
    `${nota.equipamento_modelo ?? '—'} SN ${nota.equipamento_sn ?? '—'} para ` +
    `${nota.cliente_nome ?? '—'} (${nota.pais_destino ?? '—'}). Pronto para: ${cfg.label}.`
  await supabase.from('comunicados').insert({
    titulo: `NE ${nota.numero ?? ''} — ${cfg.label}`.trim(),
    corpo,
    prioridade: 'importante',
    autor_id: autor.id,
    autor_nome: autorNome,
    autor_iniciais: iniciais(autorNome, null),
    area: cfg.area,
  })
  await enviarEmailFase(nota, fase).catch(() => {})
}

async function notificarExpedida(nota: NotaEncomenda, autor: Responsavel) {
  const autorNome = autor.nome ?? 'Sistema'
  await supabase.from('comunicados').insert({
    titulo: `NE ${nota.numero ?? ''} — Expedida`.trim(),
    corpo:
      `${nota.equipamento_modelo ?? '—'} SN ${nota.equipamento_sn ?? '—'} para ` +
      `${nota.cliente_nome ?? '—'} (${nota.pais_destino ?? '—'}) foi expedida.`,
    prioridade: 'importante',
    autor_id: autor.id,
    autor_nome: autorNome,
    autor_iniciais: iniciais(autorNome, null),
    area: null,
  })
}

// Pede ao backend para enviar o email da fase (só envia se o Resend estiver
// configurado na Vercel; em falta, fica em silêncio). Best-effort.
async function enviarEmailFase(nota: NotaEncomenda, fase: Fase) {
  const cfg = FASE_CONFIG[fase]
  await fetch('/api/ne/notificar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      para: cfg.emails,
      faseLabel: cfg.label,
      numero: nota.numero,
      equipamento: `${nota.equipamento_modelo ?? '—'} (SN ${nota.equipamento_sn ?? '—'})`,
      cliente: `${nota.cliente_nome ?? '—'}${nota.pais_destino ? ' · ' + nota.pais_destino : ''}`,
      pagina: cfg.pagina,
    }),
  })
}

// ─── Upload de ficheiros ─────────────────────────────────────────────────────

export const BUCKET_ENCAIX = 'ne-encaixotamento'
export const BUCKET_EXPED = 'ne-expedicao'

// Carrega um ficheiro para um bucket e devolve o URL público + caminho.
export async function uploadFicheiro(
  bucket: string,
  notaId: string,
  file: File
): Promise<{ url: string; caminho: string } | null> {
  const seguro = file.name.normalize('NFD').replace(/[^\w.\-]/g, '_')
  const caminho = `${notaId}/${Date.now()}-${seguro}`
  const { error } = await supabase.storage.from(bucket).upload(caminho, file)
  if (error) return null
  const { data } = supabase.storage.from(bucket).getPublicUrl(caminho)
  return { url: data.publicUrl, caminho }
}

// ─── Encaixotamento ──────────────────────────────────────────────────────────

export type EncaixotamentoInput = {
  caixa_tipo: string | null
  interior_comprimento: number | null
  interior_largura: number | null
  interior_altura: number | null
  exterior_comprimento: number | null
  exterior_largura: number | null
  exterior_altura: number | null
  peso_bruto: number | null
  peso_liquido: number | null
  notas: string | null
}

export type EncaixFoto = { id: string; url: string; caminho: string | null; tipo: 'foto' | 'video' | null }

export async function obterEncaixotamento(notaId: string) {
  const { data } = await supabase.from('ne_encaixotamento').select('*').eq('nota_id', notaId).maybeSingle()
  return data as (EncaixotamentoInput & { id: string; nota_id: string }) | null
}

export async function guardarEncaixotamento(notaId: string, dados: EncaixotamentoInput) {
  await supabase.from('ne_encaixotamento').delete().eq('nota_id', notaId)
  return supabase.from('ne_encaixotamento').insert({ nota_id: notaId, ...dados })
}

export async function listarFotosEncaix(notaId: string): Promise<EncaixFoto[]> {
  const { data } = await supabase
    .from('ne_encaixotamento_fotos')
    .select('id, url, caminho, tipo')
    .eq('nota_id', notaId)
    .order('created_at', { ascending: true })
  return (data as EncaixFoto[]) ?? []
}

export async function adicionarFotoEncaix(notaId: string, url: string, caminho: string, tipo: 'foto' | 'video') {
  return supabase.from('ne_encaixotamento_fotos').insert({ nota_id: notaId, url, caminho, tipo })
}

export async function apagarFotoEncaix(id: string, caminho: string | null) {
  if (caminho) await supabase.storage.from(BUCKET_ENCAIX).remove([caminho])
  return supabase.from('ne_encaixotamento_fotos').delete().eq('id', id)
}

// ─── Expedição ───────────────────────────────────────────────────────────────

export type ExpedicaoInput = {
  transportador: string | null
  valor_transporte: number | null
  fatura_url: string | null
  fatura_caminho: string | null
  packing_list_url: string | null
  packing_list_caminho: string | null
  doc_exportacao_url: string | null
  doc_exportacao_caminho: string | null
  doc_exportacao_tipo: string | null
  notas: string | null
}

export async function obterExpedicao(notaId: string) {
  const { data } = await supabase.from('ne_expedicao').select('*').eq('nota_id', notaId).maybeSingle()
  return data as (ExpedicaoInput & { id: string; nota_id: string }) | null
}

export async function guardarExpedicao(notaId: string, dados: ExpedicaoInput) {
  return supabase.from('ne_expedicao').upsert({ nota_id: notaId, ...dados }, { onConflict: 'nota_id' })
}
