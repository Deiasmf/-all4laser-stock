// Caixas standard usadas no encaixotamento. Ao escolher uma, o formulário
// preenche automaticamente as medidas (interior/exterior, em cm). A "Caixa
// Personalizada" deixa os campos em branco para preenchimento manual.

export type Medidas = { c: number; l: number; a: number }

export type CaixaStandard = {
  nome: string
  interior?: Medidas
  exterior?: Medidas
  custom?: boolean
}

export const CAIXAS_STANDARD: CaixaStandard[] = [
  { nome: 'Caixa Manipulos', exterior: { c: 50, l: 41, a: 15 } },
  { nome: 'Caixa Candela', exterior: { c: 105, l: 68, a: 126 } },
  { nome: 'Caixa Gpro/MGL/Elite Individual (ANTALVES)', interior: { c: 100, l: 61, a: 120 }, exterior: { c: 108, l: 70, a: 136 } },
  { nome: 'Caixa Gpro/MGL/Elite DUO (ANTALVES)', interior: { c: 100, l: 125, a: 120 }, exterior: { c: 133, l: 107, a: 137 } },
  { nome: 'Caixa Zimmer (ANTALVES)', interior: { c: 75, l: 59, a: 94 }, exterior: { c: 83, l: 67, a: 112 } },
  { nome: 'Caixa MGL x4 (ANTALVES)', interior: { c: 162, l: 104, a: 91 }, exterior: { c: 204, l: 132, a: 136 } },
  { nome: 'Caixa Gpro x3 (ANTALVES)', interior: { c: 185, l: 105, a: 120 }, exterior: { c: 194, l: 112, a: 140 } },
  { nome: 'Caixa Gpro x4 (ANTALVES)', interior: { c: 197, l: 125, a: 120 }, exterior: { c: 204, l: 133, a: 136 } },
  { nome: 'Caixa Personalizada', custom: true },
]
