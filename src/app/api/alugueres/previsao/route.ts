import { createClient } from '@supabase/supabase-js'
import { listarEventos } from '@/lib/googleCalendar'

// Previsão de receita a partir das marcações nos calendários mapeados.
// Lê os eventos (cliente = título, datas), valoriza por modelo + duração, e
// agrega por mês e por zona. Só staff.

function diasEntre(inicio: string, fim: string, diaInteiro: boolean): number {
  const ms = new Date(fim).getTime() - new Date(inicio).getTime()
  // Eventos de dia inteiro têm fim exclusivo → dias = diferença direta.
  return Math.max(1, diaInteiro ? Math.round(ms / 86_400_000) : Math.ceil(ms / 86_400_000))
}

// Duração → tipo de aluguer + valor (preços do modelo).
function tipoEValor(dias: number, precos: Record<string, number>): { tipo: string; valor: number } {
  if (dias <= 1) return { tipo: 'Diário', valor: precos['Diário'] ?? 0 }
  if (dias <= 3) return { tipo: '3 dias', valor: precos['3 dias'] ?? 0 }
  if (dias <= 7) return { tipo: 'Semanal', valor: precos['Semanal'] ?? 0 }
  const semanas = Math.ceil(dias / 7)
  return { tipo: `${semanas} semanas`, valor: (precos['Semanal'] ?? 0) * semanas }
}

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado (chaves Supabase).' }, { status: 500 })
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: u } = await anon.auth.getUser(jwt)
  if (!u?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await admin.from('profiles').select('id').eq('id', u.user.id).single()
  if (!perfil) return Response.json({ ok: false, erro: 'Apenas staff.' }, { status: 403 })

  // Calendários mapeados + preços
  const { data: cals } = await admin
    .from('calendarios_aluguer')
    .select('id, nome, modelo_grupo, modelo_label, regiao')
    .eq('ativo', true)
  if (!cals?.length) {
    return Response.json({ ok: true, total: 0, marcacoes: [], porMes: [], porZona: [], erros: ['Nenhum calendário mapeado.'] })
  }
  const { data: precos } = await admin
    .from('precos_aluguer')
    .select('modelo_grupo, tipo_aluguer, valor')
    .eq('mercado', 'nacional')
  const precoMap: Record<string, Record<string, number>> = {}
  for (const p of (precos ?? []) as { modelo_grupo: string; tipo_aluguer: string; valor: number }[]) {
    ;(precoMap[p.modelo_grupo] ??= {})[p.tipo_aluguer] = Number(p.valor)
  }

  // Intervalo: do 1º dia do mês atual até fim de 2026
  const agora = new Date()
  const timeMin = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
  const timeMax = new Date(2027, 0, 1).toISOString()

  type Cal = { id: string; nome: string; modelo_grupo: string; modelo_label: string; regiao: string | null }
  const erros: string[] = []
  const marcacoes: { cliente: string; calendario: string; modelo: string; zona: string; inicio: string; dias: number; tipo: string; valor: number; mes: string }[] = []

  await Promise.all((cals as Cal[]).map(async (cal) => {
    const res = await listarEventos(cal.id, timeMin, timeMax)
    if (!res.ok) { erros.push(`${cal.nome}: ${res.erro}`); return }
    for (const ev of res.eventos ?? []) {
      if (!ev.titulo) continue
      const dias = diasEntre(ev.inicio, ev.fim, ev.diaInteiro)
      const { tipo, valor } = tipoEValor(dias, precoMap[cal.modelo_grupo] ?? {})
      marcacoes.push({
        cliente: ev.titulo, calendario: cal.nome, modelo: cal.modelo_label,
        zona: cal.regiao ?? '—', inicio: ev.inicio.slice(0, 10), dias, tipo, valor,
        mes: ev.inicio.slice(0, 7),
      })
    }
  }))

  marcacoes.sort((a, b) => a.inicio.localeCompare(b.inicio))

  const mes: Record<string, number> = {}
  const zona: Record<string, number> = {}
  let total = 0
  for (const m of marcacoes) {
    mes[m.mes] = (mes[m.mes] ?? 0) + m.valor
    zona[m.zona] = (zona[m.zona] ?? 0) + m.valor
    total += m.valor
  }

  return Response.json({
    ok: true,
    total,
    nMarcacoes: marcacoes.length,
    marcacoes,
    porMes: Object.entries(mes).sort().map(([mes, valor]) => ({ mes, valor })),
    porZona: Object.entries(zona).sort().map(([zona, valor]) => ({ zona, valor })),
    erros,
  })
}
