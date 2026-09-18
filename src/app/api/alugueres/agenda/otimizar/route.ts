import { createClient } from '@supabase/supabase-js'
import { dbService } from '@/lib/transportesSync'
import { geocodificar, otimizarRota, rotaProviderAtivo, type PontoRota, type Coord } from '@/lib/rotaProvider'

// Otimiza a rota de um motorista num dia (OpenRouteService). Sessão de staff.
// Geocodifica as moradas em falta, otimiza a ordem e grava ordem + km do dia.

export const runtime = 'nodejs'
export const maxDuration = 120

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = dbService()
  if (!url || !anonKey || !sb) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: u } = await anon.auth.getUser(jwt)
  if (!u?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await sb.from('profiles').select('id').eq('id', u.user.id).single()
  if (!perfil) return Response.json({ ok: false, erro: 'Apenas staff.' }, { status: 403 })

  if (!rotaProviderAtivo()) return Response.json({ ok: false, erro: 'ORS_API_KEY não configurada em produção.' }, { status: 400 })

  let body: { data?: string; driverId?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const { data, driverId } = body
  if (!data || !driverId) return Response.json({ ok: false, erro: 'Faltam data/driverId.' }, { status: 400 })

  // Paragens do motorista nesse dia (com morada).
  const { data: rows } = await sb.from('transport_stops')
    .select('id, morada, lat, lng, estado')
    .eq('data', data).eq('motorista_id', driverId).neq('estado', 'cancelada')
  const stops = (rows as { id: string; morada: string | null; lat: number | null; lng: number | null }[]) ?? []
  if (stops.length === 0) return Response.json({ ok: false, erro: 'Sem paragens para este motorista neste dia.' }, { status: 400 })

  // Geocodificar as que faltam.
  let geocodificados = 0, semCoords = 0
  for (const s of stops) {
    if (s.lat != null && s.lng != null) continue
    if (!s.morada) { await sb.from('transport_stops').update({ geocode_status: 'falhou' }).eq('id', s.id); semCoords++; continue }
    const c = await geocodificar(s.morada)
    if (c) { s.lat = c.lat; s.lng = c.lng; await sb.from('transport_stops').update({ lat: c.lat, lng: c.lng, geocode_status: 'ok' }).eq('id', s.id); geocodificados++ }
    else { await sb.from('transport_stops').update({ geocode_status: 'falhou' }).eq('id', s.id); semCoords++ }
    await sleep(300) // respeitar rate limit da ORS
  }

  // Ponto de partida do motorista (geocodifica se preciso).
  const { data: drv } = await sb.from('transport_drivers').select('partida_morada, partida_lat, partida_lng').eq('id', driverId).single()
  const d = drv as { partida_morada: string | null; partida_lat: number | null; partida_lng: number | null } | null
  let partida: Coord | null = d?.partida_lat != null && d?.partida_lng != null ? { lat: d.partida_lat, lng: d.partida_lng } : null
  if (!partida && d?.partida_morada) {
    const c = await geocodificar(d.partida_morada)
    if (c) { partida = c; await sb.from('transport_drivers').update({ partida_lat: c.lat, partida_lng: c.lng }).eq('id', driverId) }
  }

  const pontos: PontoRota[] = stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ id: s.id, lat: s.lat as number, lng: s.lng as number }))
  if (pontos.length === 0) return Response.json({ ok: false, erro: 'Nenhuma morada foi geocodificada — verifica as moradas.', geocodificados, semCoords })

  const res = await otimizarRota(partida, pontos)
  if (!res) return Response.json({ ok: false, erro: 'Sem paragens com morada para otimizar.', geocodificados, semCoords }, { status: 400 })

  // Gravar ordem nas paragens + km no dia.
  for (const o of res.ordem) await sb.from('transport_stops').update({ ordem: o.ordem }).eq('id', o.id)
  await sb.from('transport_driver_days').upsert({ data, driver_id: driverId, km_total: res.km }, { onConflict: 'data,driver_id' })

  return Response.json({ ok: true, km: res.km, paragens: pontos.length, geocodificados, semCoords, metodo: res.metodo, erroORS: res.erroORS })
}
