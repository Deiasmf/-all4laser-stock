import { createClient } from '@supabase/supabase-js'
import { extrairCartaPorte, tipoSuportado, MODELO_DOC } from '@/lib/docExtract'
import { matchCarrier, detetarDirecao, matchEntidade, type EntidadeRef } from '@/lib/trackingMatch'
import { analisarAwb, detetarCompanhiaPorPrefixo, detetarTransportadoraExpresso, type Carrier } from '@/types/tracking'
import type { CartaPorteExtraida, SugestaoEnvio, RespostaExtracao } from '@/types/cartaPorte'

// Extrai os dados de uma carta de porte (PDF/imagem) com a Claude API e cruza-os
// com os dados da app (transportadora, AWB, entidades, direção, duplicados).
// Corre no servidor: valida o utilizador (admin/administrativo), usa a service
// role para ler carriers/clientes/fornecedores e regista a extração no log.
// Nunca falha "a sério": se a extração correr mal, devolve uma resposta parcial
// para o cliente abrir o formulário manual com o documento anexado.

export const runtime = 'nodejs'
export const maxDuration = 60

const LIMITE_BYTES = 10 * 1024 * 1024   // 10 MB

// Sugestão vazia (extração falhada) — o cliente abre o formulário manual.
function sugestaoVazia(): SugestaoEnvio {
  return {
    tracking_number: null, awb: null, awb_check_valido: null, tipo_transporte: 'expresso',
    carrier_id: null, carrier_nome: null, direcao: 'envio', descricao_conteudo: null,
    entidade_tipo: null, cliente_id: null, supplier_id: null, entidade_nome: null,
    estado: 'registado', data_expedicao: null, entrega_prevista: null, entrega_efetiva: null,
    notas: null, aeroporto_origem: null, aeroporto_destino: null, num_volumes: null, peso_kg: null,
  }
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // 1) Autenticação (access token da sessão).
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  // 2) Autorização: qualquer staff interno.
  const { data: perfil } = await db.from('profiles').select('role, nome, email').eq('id', userData.user.id).single()
  const p = perfil as { role?: string; nome?: string; email?: string } | null
  if (!['admin', 'financeiro', 'standard'].includes(p?.role ?? '')) {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }
  const userId = userData.user.id
  const userNome = p?.nome ?? p?.email ?? null

  // 3) Corpo: ficheiro em base64.
  let body: { base64?: string; contentType?: string; nome?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const base64 = (body.base64 ?? '').replace(/^data:[^,]*;base64,/, '')
  const contentType = (body.contentType ?? '').toLowerCase()
  const nome = body.nome ?? 'documento'
  if (!base64) return Response.json({ ok: false, erro: 'Ficheiro em falta.' }, { status: 400 })
  if (!tipoSuportado(contentType)) return Response.json({ ok: false, erro: 'Tipo de ficheiro não suportado (usa PDF, JPG ou PNG).' }, { status: 415 })
  const bytes = Math.floor((base64.length * 3) / 4)
  if (bytes > LIMITE_BYTES) return Response.json({ ok: false, erro: 'Ficheiro demasiado grande (máx. 10 MB).' }, { status: 413 })

  const registarLog = (extra: {
    sucesso: boolean; erro: string | null; json: Record<string, unknown> | null; duplicadoDe: string | null
  }) =>
    db.from('tracking_extracao_log').insert({
      ficheiro_nome: nome, content_type: contentType, tamanho: bytes,
      sucesso: extra.sucesso, modelo: MODELO_DOC, erro: extra.erro,
      extracao_json: extra.json, duplicado_de: extra.duplicadoDe,
      tracking_id: null, user_id: userId, user_nome: userNome,
    })

  // 4) Extração AI. Se falhar, devolve resposta parcial (não bloqueia o upload).
  let extra: CartaPorteExtraida
  try {
    extra = await extrairCartaPorte({ base64, contentType, nome })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha na extração.'
    await registarLog({ sucesso: false, erro: msg, json: null, duplicadoDe: null })
    const resp: RespostaExtracao = {
      ok: true, parcial: true, erro: msg, sugestao: sugestaoVazia(), confianca: {},
      extraido: { ...sugestaoVaziaExtraida() }, duplicado: null, sugestoesEp: [],
      avisos: ['Extração falhou — completar manualmente. O documento fica anexado.'],
    }
    return Response.json(resp)
  }

  // 5) Cruzamento com os dados da app.
  const [{ data: carriersRows }, { data: clientesRows }, { data: fornecedoresRows }] = await Promise.all([
    db.from('carriers').select('*').eq('ativo', true),
    db.from('clientes').select('id, nome, morada').limit(5000),
    db.from('fornecedores').select('id, nome, morada').limit(5000),
  ])
  const carriers = (carriersRows as Carrier[]) ?? []
  const clientes: EntidadeRef[] = ((clientesRows as { id: string; nome: string; morada: string | null }[]) ?? [])
    .map((c) => ({ id: c.id, nome: c.nome, morada: c.morada, tipo: 'cliente' as const }))
  const fornecedores: EntidadeRef[] = ((fornecedoresRows as { id: string; nome: string; morada: string | null }[]) ?? [])
    .map((f) => ({ id: f.id, nome: f.nome, morada: f.morada, tipo: 'fornecedor' as const }))

  const avisos: string[] = []

  // AWB / tipo de transporte.
  const awbInfo = analisarAwb(extra.awb)
  const tipo = awbInfo.valido || (extra.tipo_transporte === 'carga_aerea' && extra.awb)
    ? 'carga_aerea'
    : extra.tipo_transporte === 'outro'
      ? 'outro'
      : 'expresso'
  if (awbInfo.valido && awbInfo.controloOk === false) {
    avisos.push('O dígito de controlo da AWB não confere — verifica o número.')
  }

  // Transportadora.
  let carrier: Carrier | null = null
  if (tipo === 'carga_aerea') {
    carrier = detetarCompanhiaPorPrefixo(awbInfo.prefixo, carriers) ?? matchCarrier(extra.transportadora, carriers)
  } else {
    carrier = matchCarrier(extra.transportadora, carriers) ?? detetarTransportadoraExpresso(extra.tracking_number ?? '', carriers)
  }

  // Direção (nós remetente = envio; nós destinatário = receção).
  const direcaoDetetada = detetarDirecao(
    { nome: extra.remetente_nome, morada: extra.remetente_morada, pais: extra.remetente_pais },
    { nome: extra.destinatario_nome, morada: extra.destinatario_morada, pais: extra.destinatario_pais },
  )
  const direcao = direcaoDetetada ?? 'envio'
  if (!direcaoDetetada) avisos.push('Direção não determinada automaticamente — confirma se é envio ou receção.')

  // Entidade (a contraparte que não é a All4laser).
  const contraparte = direcao === 'rececao'
    ? { nome: extra.remetente_nome, morada: extra.remetente_morada }
    : { nome: extra.destinatario_nome, morada: extra.destinatario_morada }
  // Numa receção esperamos fornecedor; num envio, cliente — mas testamos ambos.
  const prefer = direcao === 'rececao' ? fornecedores : clientes
  const outra = direcao === 'rececao' ? clientes : fornecedores
  const match = matchEntidade(contraparte.nome, contraparte.morada, prefer)
    ?? matchEntidade(contraparte.nome, contraparte.morada, outra)

  // Sugestão de envio pré-preenchida.
  const notasPartes = [
    extra.servico ? `Serviço: ${extra.servico}` : null,
    extra.dimensoes ? `Dimensões: ${extra.dimensoes}` : null,
  ].filter(Boolean)
  const sugestao: SugestaoEnvio = {
    tracking_number: extra.tracking_number,
    awb: awbInfo.normalizado ?? extra.awb,
    awb_check_valido: awbInfo.valido ? awbInfo.controloOk : null,
    tipo_transporte: tipo,
    carrier_id: carrier?.id ?? null,
    carrier_nome: carrier?.nome ?? extra.transportadora,
    direcao,
    descricao_conteudo: null,
    entidade_tipo: match?.entidade.tipo ?? null,
    cliente_id: match?.entidade.tipo === 'cliente' ? match.entidade.id : null,
    supplier_id: match?.entidade.tipo === 'fornecedor' ? match.entidade.id : null,
    entidade_nome: match?.entidade.nome ?? contraparte.nome,
    estado: 'registado',
    data_expedicao: extra.data_expedicao,
    entrega_prevista: null,
    entrega_efetiva: null,
    notas: notasPartes.length ? notasPartes.join(' · ') : null,
    aeroporto_origem: null,
    aeroporto_destino: null,
    num_volumes: extra.num_volumes,
    peso_kg: extra.peso_kg,
  }

  // 6) Duplicados (mesmo tracking/AWB já registado).
  const chaves = [extra.tracking_number, awbInfo.normalizado ?? extra.awb]
    .map((k) => (k ?? '').trim().toLowerCase())
    .filter((k) => k.length > 0)
  let duplicado: RespostaExtracao['duplicado'] = null
  if (chaves.length) {
    const { data: dupRows } = await db
      .from('shipments_tracking')
      .select('id, descricao_conteudo, tracking_number, awb, carta_porte_caminho, carta_porte_url')
      .in('dedup_key', chaves)
      .limit(1)
    const d = (dupRows as { id: string; descricao_conteudo: string | null; tracking_number: string | null; awb: string | null; carta_porte_caminho: string | null; carta_porte_url: string | null }[] | null)?.[0]
    if (d) {
      duplicado = {
        id: d.id, descricao: d.descricao_conteudo, tracking_number: d.tracking_number, awb: d.awb,
        tem_anexo: Boolean(d.carta_porte_caminho || d.carta_porte_url),
      }
      avisos.push('Este tracking/AWB já está registado num envio.')
    }
  }

  // Ponto 10: EPs recentes da entidade correspondida, sem tracking associado.
  let sugestoesEp: RespostaExtracao['sugestoesEp'] = []
  if (match) {
    const col = match.entidade.tipo === 'cliente' ? 'cliente_id' : 'fornecedor_id'
    const desdeIso = new Date(Date.now() - 90 * 86400000).toISOString()
    const { data: eps } = await db
      .from('envios_pecas')
      .select('id, numero')
      .eq(col, match.entidade.id)
      .or('tracking_numero.is.null,tracking_numero.eq.')
      .or('awb_numero.is.null,awb_numero.eq.')
      .neq('estado', 'cancelado')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .limit(5)
    sugestoesEp = ((eps as { id: string; numero: string }[] | null) ?? []).map((e) => ({ id: e.id, numero: e.numero }))
  }

  // Extração parcial: sem qualquer identificador ou sem transportadora.
  const semIdentificador = !extra.tracking_number && !awbInfo.valido && !extra.awb
  const semTransportadora = !carrier && !extra.transportadora
  const parcial = semIdentificador || semTransportadora
  if (parcial) avisos.push('Extração parcial — confirma/completa os campos em falta.')

  await registarLog({ sucesso: true, erro: null, json: extra, duplicadoDe: duplicado?.id ?? null })

  const resp: RespostaExtracao = {
    ok: true, parcial, erro: null, sugestao, confianca: extra.confianca, extraido: extra, duplicado, sugestoesEp, avisos,
  }
  return Response.json(resp)
}

// Extração "vazia" (falha) — só para preencher o campo extraido da resposta.
function sugestaoVaziaExtraida(): CartaPorteExtraida {
  return {
    transportadora: null, tipo_transporte: null, tracking_number: null, awb: null,
    remetente_nome: null, remetente_morada: null, remetente_pais: null,
    destinatario_nome: null, destinatario_morada: null, destinatario_pais: null,
    num_volumes: null, peso_kg: null, dimensoes: null, data_expedicao: null, servico: null,
    confianca: {},
  }
}
