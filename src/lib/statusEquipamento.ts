// Cor de cada status de equipamento, para a lista de Stock ficar mais legível.
// Os status são texto livre e variam (maiúsculas, grafias, casos pontuais),
// por isso o mapeamento é por PALAVRA-CHAVE e não por valor exato. O que não
// encaixa em nenhuma categoria recebe uma cor determinística (mesmo texto →
// sempre a mesma cor), para continuar a distinguir-se visualmente.

export type CorStatus = { fg: string; bg: string }

const PALETA = {
  verde:    { fg: '#0a7a4f', bg: '#e3f7ee' },
  azul:     { fg: '#1d4ed8', bg: '#e6efff' },
  roxo:     { fg: '#7c3aed', bg: '#f1e9ff' },
  ambar:    { fg: '#9a6700', bg: '#fff4d6' },
  vermelho: { fg: '#b42318', bg: '#fde7e4' },
  teal:     { fg: '#0e7490', bg: '#dff5fa' },
  rosa:     { fg: '#b83280', bg: '#fde7f3' },
  indigo:   { fg: '#4338ca', bg: '#e8e8fd' },
  cinza:    { fg: '#475467', bg: '#eef0f3' },
} satisfies Record<string, CorStatus>

// Cores usadas no fallback (para status sem categoria, ex.: transportadores).
const CICLO: CorStatus[] = [PALETA.teal, PALETA.rosa, PALETA.indigo, PALETA.ambar, PALETA.azul]

export function corStatus(status: string | null | undefined): CorStatus {
  const s = (status ?? '').toLowerCase().trim()
  if (!s) return PALETA.cinza

  // Avisos primeiro (têm de saltar à vista).
  if (s.includes('devolv') || s.includes('encontrado')) return PALETA.vermelho
  // Disponível.
  if (s.includes('stock') || s.includes('invent')) return PALETA.verde
  // Saiu / expedido.
  if (s.includes('enviado') || s.includes('envio')) return PALETA.azul
  // Aluguer.
  if (s.includes('aluguer')) return PALETA.roxo
  // Em processo técnico.
  if (s.includes('repara') || s.includes('tratamento') || s.includes('verificar') || s.includes('tec')) return PALETA.ambar
  // Consignação.
  if (s.includes('consigna')) return PALETA.teal
  // Peças.
  if (s.includes('peça') || s.includes('peca')) return PALETA.rosa

  // Sem categoria: cor estável a partir do texto.
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return CICLO[h % CICLO.length]
}
