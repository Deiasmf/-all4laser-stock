import { describe, it, expect } from 'vitest'
import { calcularValorUltraformer, resumoCalculo, type Tarifario } from './ultraformerCalculo'

// Tarifário atual (igual ao seed da migration C).
const TAR: Tarifario = {
  id: 'tar-teste',
  vigente_desde: '2026-10-15',
  minimo_dia1: 150,
  minimo_dia_seguinte: 100,
  escaloes: [
    { ordem: 1, dia_min: 1, dia_max: 2, preco_rosto: 0.44, preco_corpo: 0.22 },
    { ordem: 2, dia_min: 3, dia_max: 3, preco_rosto: 0.4, preco_corpo: 0.2 },
    { ordem: 3, dia_min: 4, dia_max: null, preco_rosto: 0.34, preco_corpo: 0.17 },
  ],
}

describe('calcularValorUltraformer', () => {
  it('recolha no mesmo dia: 540 rosto + 200 corpo no dia 1 do mês → 281,60 € (acima do mínimo)', () => {
    const r = calcularValorUltraformer(
      { pulsosRosto: 540, pulsosCorpo: 200, diasAluguer: 1, diasMesAntes: 0 },
      TAR,
    )
    expect(r.valorConsumo).toBe(281.6) // 540×0,44 + 200×0,22 = 237,60 + 44,00
    expect(r.valorTotal).toBe(281.6)
    expect(r.diasComMinimo).toBe(0)
  })

  it('consumo abaixo do mínimo no 1.º dia → fatura o mínimo (150 €)', () => {
    const r = calcularValorUltraformer(
      { pulsosRosto: 100, pulsosCorpo: 0, diasAluguer: 1, diasMesAntes: 0 }, // 100×0,44 = 44 €
      TAR,
    )
    expect(r.valorConsumo).toBe(44)
    expect(r.valorTotal).toBe(150)
    expect(r.diasComMinimo).toBe(1)
    expect(r.dias[0].minimoAplicado).toBe(true)
  })

  it('escalão degressivo pelo mês: 2.ª reserva de 2 dias com 2 dias já feitos no mês → dias 3 e 4', () => {
    // 1000 rosto, 2 dias → 500/dia. Dia do mês 3 (0,40) e 4 (0,34).
    const r = calcularValorUltraformer(
      { pulsosRosto: 1000, pulsosCorpo: 0, diasAluguer: 2, diasMesAntes: 2 },
      TAR,
    )
    // dia 1 (reserva) = dia 3 do mês: 500×0,40 = 200 €; mínimo 150 → 200
    // dia 2 (reserva) = dia 4 do mês: 500×0,34 = 170 €; mínimo 100 → 170
    expect(r.dias[0].diaMes).toBe(3)
    expect(r.dias[0].escalaoOrdem).toBe(2)
    expect(r.dias[0].faturado).toBe(200)
    expect(r.dias[1].diaMes).toBe(4)
    expect(r.dias[1].escalaoOrdem).toBe(3)
    expect(r.dias[1].faturado).toBe(170)
    expect(r.valorTotal).toBe(370)
    expect(r.diasComMinimo).toBe(0)
  })

  it('multi-dia com mínimo a prevalecer nos dias consecutivos', () => {
    // 1 dia só com pouco consumo: rosto 300 em 2 dias → 150/dia.
    // dia 1 (mês 1, 0,44): 150×0,44 = 66 € < 150 → 150
    // dia 2 (mês 2, 0,44): 150×0,44 = 66 € < 100 → 100
    const r = calcularValorUltraformer(
      { pulsosRosto: 300, pulsosCorpo: 0, diasAluguer: 2, diasMesAntes: 0 },
      TAR,
    )
    expect(r.dias[0].faturado).toBe(150)
    expect(r.dias[1].faturado).toBe(100)
    expect(r.valorTotal).toBe(250)
    expect(r.diasComMinimo).toBe(2)
  })

  it('pulsos a zero → fatura o mínimo do 1.º dia', () => {
    const r = calcularValorUltraformer(
      { pulsosRosto: 0, pulsosCorpo: 0, diasAluguer: 1, diasMesAntes: 0 },
      TAR,
    )
    expect(r.valorTotal).toBe(150)
  })

  it('resumoCalculo devolve o texto esperado', () => {
    const r = calcularValorUltraformer(
      { pulsosRosto: 540, pulsosCorpo: 200, diasAluguer: 1, diasMesAntes: 0 },
      TAR,
    )
    expect(resumoCalculo(r)).toBe('540 pulsos rosto + 200 corpo = 281.60 €; TOTAL A FATURAR = 281.60 €')
  })
})
