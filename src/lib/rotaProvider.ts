// ─────────────────────────────────────────────────────────────────────────────
// Adaptador de rota — OpenRouteService (https://openrouteservice.org).
// ÚNICO ponto que conhece a ORS. Geocodificação (morada → coordenadas) +
// otimização da ordem das paragens (Vroom). Trocar de fornecedor = outro
// adaptador com a mesma interface.
//   Variável: ORS_API_KEY (chave gratuita da ORS).
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://api.openrouteservice.org'

function apiKey(): string | null {
  const k = process.env.ORS_API_KEY
  return k && k.trim() ? k.trim() : null
}
export function rotaProviderAtivo(): boolean {
  return apiKey() !== null
}

export type Coord = { lat: number; lng: number }

// Geocodifica uma morada (Portugal). Devolve null se não encontrar/erro.
export async function geocodificar(morada: string): Promise<Coord | null> {
  const key = apiKey()
  if (!key || !morada.trim()) return null
  try {
    const url = new URL(`${BASE}/geocode/search`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('text', morada.trim())
    url.searchParams.set('boundary.country', 'PT')
    url.searchParams.set('size', '1')
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const j = await r.json()
    const c = j?.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return null
    return { lat: Number(c[1]), lng: Number(c[0]) }
  } catch {
    return null
  }
}

export type PontoRota = { id: string; lat: number; lng: number }
export type ResultadoRota = { ordem: { id: string; ordem: number }[]; km: number } | null

// Otimiza a ordem das paragens (a partir do ponto de partida, se dado) usando a
// otimização da ORS. Devolve a ordem por id e a distância total (km).
export async function otimizarRota(partida: Coord | null, pontos: PontoRota[]): Promise<ResultadoRota> {
  const key = apiKey()
  if (!key || pontos.length === 0) return null
  try {
    const jobs = pontos.map((p, i) => ({ id: i + 1, location: [p.lng, p.lat] }))
    const vehicle: Record<string, unknown> = { id: 1, profile: 'driving-car' }
    if (partida) { vehicle.start = [partida.lng, partida.lat]; vehicle.end = [partida.lng, partida.lat] }
    const r = await fetch(`${BASE}/optimization`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jobs, vehicles: [vehicle] }),
    })
    if (!r.ok) return null
    const j = await r.json()
    const rota = j?.routes?.[0]
    if (!rota) return null
    const ordem: { id: string; ordem: number }[] = []
    let n = 0
    for (const step of rota.steps ?? []) {
      if (step.type !== 'job') continue
      const idx = (step.job as number) - 1
      const p = pontos[idx]
      if (p) ordem.push({ id: p.id, ordem: ++n })
    }
    const km = Math.round(((rota.distance ?? 0) / 1000) * 10) / 10
    return { ordem, km }
  } catch {
    return null
  }
}
