// Deteção partilhada de Zimmer (unidade de crioterapia). Num aluguer, cada
// conjunto é Laser + Zimmer (Cryo 6): o Zimmer é acessório, NÃO conta como
// entrega/recolha isolada nem tem valor próprio — o valor é do conjunto (laser).
// Centraliza a lógica que estava duplicada em vários ecrãs.

export const ZIMMER_PACK = 'Zimmer Cryo 6'

export function ehZimmer(input: {
  modelo?: string | null; marca?: string | null; nao_faturar?: boolean | null
}): boolean {
  if (input.nao_faturar === true) return true
  const s = `${input.modelo ?? ''} ${input.marca ?? ''}`.toLowerCase()
  return s.includes('zimmer') || s.includes('cryo')
}
