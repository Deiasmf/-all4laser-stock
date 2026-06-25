// Normalização do nome de cliente (campo `destino`) para a vista de Stock.
//
// Display-only — NÃO altera a base de dados. Os nomes de cliente são texto livre
// escrito à mão, sem chave fiável, por isso a unificação é feita por uma lista de
// grupos confirmados pela equipa (não há regra automática). Tudo o que não estiver
// na lista fica como está (apenas com espaços normalizados).

// Grupos de variantes confirmadas → nome canónico a mostrar.
const GRUPOS: { canonico: string; aliases: string[] }[] = [
  { canonico: 'Medika Bazaar', aliases: ['Medika Bazaar', 'Medica Bazaar', 'Medical Bazzar'] },
  { canonico: 'Hossam', aliases: ['Hossam', 'Hossan'] },
  { canonico: 'Fahmy', aliases: ['Fahmy', 'Fhamy', 'FAMY'] },
  { canonico: 'Younan', aliases: ['Younan', 'Yonan'] },
  { canonico: 'Laserix', aliases: ['Laserix', 'Laserlix'] },
  { canonico: 'Therapie', aliases: ['Therapie', 'Therapue'] },
  { canonico: 'X-Med', aliases: ['X-Med', 'X- MED', 'Xmed'] },
  { canonico: 'Keijje', aliases: ['Keijje', 'Kejje'] },
  // Variantes de apóstrofo (reto vs acento agudo)
  { canonico: "LA'Skin", aliases: ["LA'Skin", 'La´Skin'] },
  { canonico: 'David Calero', aliases: ['David Calero', 'Davis Calero'] },
  { canonico: 'Mrs. Paige', aliases: ['Mrs. Paige', 'MRs Paige', 'Paige'] },
  { canonico: 'Guluzar Murat', aliases: ['Guluzar Murat', 'Guluzar- Murat'] },
  { canonico: 'Glam Medispa Monte Carlo', aliases: ['Glam Medispa Monte Carlo', 'Glam Medispa - Monte carlo'] },
  { canonico: 'Infinity Kuwait', aliases: ['Infinity Kuwait', 'Infinyty kuwait'] },
  { canonico: 'Lumier', aliases: ['Lumier', 'Lumiere'] },
  // Grupos ambíguos aprovados pela equipa
  { canonico: 'Elvin Musayev', aliases: ['Elvin Musayev', 'Elvin Musayev, Georgia'] },
  { canonico: 'Maria Nieves', aliases: ['Maria Nieves', 'Mari Nieves'] },
  { canonico: 'Ultimate Laser', aliases: ['Ultimate Laser', 'Ultimate Laser Telheiras', 'Ultimatelaser Telheiras'] },
]

// Chave de comparação: minúsculas, sem espaços a mais.
function chave(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

// Mapa alias→canónico (construído uma vez).
const MAPA = new Map<string, string>()
for (const g of GRUPOS) {
  for (const a of g.aliases) MAPA.set(chave(a), g.canonico)
}

// Nome canónico do cliente para mostrar/filtrar no Stock.
export function nomeClienteStock(destino: string | null): string {
  const base = (destino ?? '').replace(/\s+/g, ' ').trim()
  if (!base) return ''
  return MAPA.get(base.toLowerCase()) ?? base
}
