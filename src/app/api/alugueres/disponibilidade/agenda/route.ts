import { createClient } from '@supabase/supabase-js'
import { listarEventos } from '@/lib/googleCalendar'
import { ocupacaoPorGrupo, type MarcacaoAgenda } from '@/lib/agendaOcupacao'

// Ocupação da frota segundo as marcações nas agendas Google mapeadas em
// Alugueres → Agenda, para o intervalo pedido. A verificação de disponibilidade
// soma isto às reservas internas — sem esta leitura, um laser marcado
// diretamente no calendário aparecia como livre. Só staff.

const DIA_MS = 86_400_000

// Janela de consulta ao Google, folgada um dia para cada lado: o filtro exato
// (por dia, no fuso do próprio evento) é feito depois em ocupacaoPorGrupo.
function janela(inicio: string, fim: string): { timeMin: string; timeMax: string } {
  const i = new Date(`${inicio}T00:00:00Z`).getTime()
  const f = new Date(`${fim}T00:00:00Z`).getTime()
  return {
    timeMin: new Date(i - DIA_MS).toISOString(),
    timeMax: new Date(f + 2 * DIA_MS).toISOString(),
  }
}

const ehData = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado (chaves Supabase).' }, { status: 500 })
  }

  const params = new URL(req.url).searchParams
  const inicio = params.get('inicio')
  const fim = params.get('fim')
  if (!ehData(inicio) || !ehData(fim)) {
    return Response.json({ ok: false, erro: 'Indica inicio e fim no formato YYYY-MM-DD.' }, { status: 400 })
  }
  if (fim < inicio) {
    return Response.json({ ok: false, erro: 'A data de fim não pode ser anterior à de início.' }, { status: 400 })
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: u } = await anon.auth.getUser(jwt)
  if (!u?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await admin.from('profiles').select('id').eq('id', u.user.id).single()
  if (!perfil) return Response.json({ ok: false, erro: 'Apenas staff.' }, { status: 403 })

  const { data: cals } = await admin
    .from('calendarios_aluguer')
    .select('id, nome, modelo_grupo')
    .eq('ativo', true)
  if (!cals?.length) {
    // Sem mapeamento não há cruzamento possível, mas também não é uma falha:
    // `semCalendarios` distingue-o de não conseguir ler as agendas.
    return Response.json({ ok: true, semCalendarios: true, porGrupo: {}, marcacoes: [], erros: [] })
  }

  const { timeMin, timeMax } = janela(inicio, fim)
  const erros: string[] = []
  const entradas: { calendario: string; modelo_grupo: string; marcacoes: MarcacaoAgenda[] }[] = []

  await Promise.all((cals as { id: string; nome: string | null; modelo_grupo: string }[]).map(async (cal) => {
    const res = await listarEventos(cal.id, timeMin, timeMax)
    if (!res.ok) { erros.push(`${cal.nome ?? cal.id}: ${res.erro}`); return }
    entradas.push({ calendario: cal.nome ?? cal.id, modelo_grupo: cal.modelo_grupo, marcacoes: res.eventos ?? [] })
  }))

  const { porGrupo, marcacoes } = ocupacaoPorGrupo(entradas, inicio, fim)
  return Response.json({ ok: true, porGrupo, marcacoes, erros })
}
