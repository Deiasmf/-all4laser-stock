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
export type ResultadoRota = { ordem: { id: string; ordem: number }[]; km: number; metodo: 'ors' | 'aproximado'; erroORS?: string } | null

// Distância em km entre duas coordenadas (linha reta, fórmula de haversine).
function haversineKm(a: Coord, b: Coord): number {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Ordenação por vizinho-mais-próximo (fallback sem ORS). Km em linha reta.
function ordenarPorProximidade(partida: Coord | null, pontos: PontoRota[]): { ordem: { id: string; ordem: number }[]; km: number } {
  const restantes = [...pontos]
  const ordem: { id: string; ordem: number }[] = []
  let atual: Coord = partida ?? { lat: pontos[0].lat, lng: pontos[0].lng }
  let km = 0, n = 0
  while (restantes.length) {
    let melhor = 0, melhorD = Infinity
    for (let i = 0; i < restantes.length; i++) {
      const d = haversineKm(atual, restantes[i])
      if (d < melhorD) { melhorD = d; melhor = i }
    }
    const p = restantes.splice(melhor, 1)[0]
    km += melhorD; atual = { lat: p.lat, lng: p.lng }
    ordem.push({ id: p.id, ordem: ++n })
  }
  if (partida) km += haversineKm(atual, partida) // regresso
  return { ordem, km: Math.round(km * 10) / 10 }
}

// Otimiza a ordem das paragens. Tenta a otimização real da ORS (distâncias de
// estrada); se falhar, cai para ordenação por proximidade (km aproximados) para
// nunca ficar sem rota. Devolve também o método usado e o erro da ORS (se houve).
export async function otimizarRota(partida: Coord | null, pontos: PontoRota[]): Promise<ResultadoRota> {
  const key = apiKey()
  if (pontos.length === 0) return null
  if (pontos.length === 1) return { ordem: [{ id: pontos[0].id, ordem: 1 }], km: 0, metodo: 'aproximado' }
  if (!key) return { ...ordenarPorProximidade(partida, pontos), metodo: 'aproximado' }

  let erroORS: string | undefined
  try {
    const jobs = pontos.map((p, i) => ({ id: i + 1, location: [p.lng, p.lat] }))
    // A ORS exige um veículo com ponto de partida: usa a partida do motorista
    // ou, se não houver, a primeira paragem.
    const base = partida ?? { lat: pontos[0].lat, lng: pontos[0].lng }
    const vehicle = { id: 1, profile: 'driving-car', start: [base.lng, base.lat], end: [base.lng, base.lat] }
    const r = await fetch(`${BASE}/optimization`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      // options.g = true → a ORS calcula a geometria e devolve a DISTÂNCIA
      // (sem isto, route.distance vem 0).
      body: JSON.stringify({ jobs, vehicles: [vehicle], options: { g: true } }),
    })
    if (r.ok) {
      const j = await r.json()
      const rota = j?.routes?.[0]
      if (rota) {
        const ordem: { id: string; ordem: number }[] = []
        let n = 0
        for (const step of rota.steps ?? []) {
          if (step.type !== 'job') continue
          const p = pontos[(step.job as number) - 1]
          if (p) ordem.push({ id: p.id, ordem: ++n })
        }
        if (ordem.length) return { ordem, km: Math.round(((rota.distance ?? 0) / 1000) * 10) / 10, metodo: 'ors' }
      }
      erroORS = 'resposta sem rota'
    } else {
      const t = await r.text()
      erroORS = `HTTP ${r.status}: ${t.slice(0, 160)}`
    }
  } catch (e) {
    erroORS = e instanceof Error ? e.message : 'erro de rede'
  }
  // Fallback: proximidade.
  return { ...ordenarPorProximidade(partida, pontos), metodo: 'aproximado', erroORS }
}
