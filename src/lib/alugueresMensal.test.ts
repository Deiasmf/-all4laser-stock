import { describe, expect, it } from 'vitest'
import { mesMais, mesesDoAluguer, mesesEntre } from './alugueresMensal'

const sel = mesesEntre('2026-08', '2027-08')

describe('mesMais / mesesEntre', () => {
  it('soma meses com viragem de ano', () => {
    expect(mesMais('2026-11', 1)).toBe('2026-12')
    expect(mesMais('2026-11', 2)).toBe('2027-01')
    expect(mesMais('2026-01', -1)).toBe('2025-12')
  })
  it('lista meses inclusive', () => {
    expect(mesesEntre('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(mesesEntre('2026-11', '2026-11')).toEqual(['2026-11'])
    expect(mesesEntre('2026-12', '2026-11')).toEqual([])
  })
})

describe('mesesDoAluguer', () => {
  it('aluguer normal só aparece no mês da entrega', () => {
    expect(mesesDoAluguer({ mensal: false, data_entrega: '2026-10-21', data_recolha: '2026-10-31' }, sel)).toEqual(['2026-10'])
  })
  it('mensal com data de fim aparece todos os meses até ao fim', () => {
    expect(mesesDoAluguer({ mensal: true, data_entrega: '2026-11-01', data_fim_prevista: '2027-06-30' }, sel))
      .toEqual(mesesEntre('2026-11', '2027-06'))
  })
  it('mensal aberto aparece 12 meses', () => {
    expect(mesesDoAluguer({ mensal: true, data_entrega: '2026-09-16' }, sel)).toEqual(mesesEntre('2026-09', '2027-08'))
  })
  it('recolha antes do fim previsto encurta a projeção', () => {
    expect(mesesDoAluguer({ mensal: true, data_entrega: '2026-08-10', data_fim_prevista: '2027-06-30', data_recolha: '2026-10-31' }, sel))
      .toEqual(['2026-08', '2026-09', '2026-10'])
  })
  it('recolha anterior à entrega (erro de registo) é ignorada', () => {
    // Era o caso dos mensais criados à mão com data_recolha = 2026-07-23 e
    // entrega no dia 1 de cada mês: desapareciam da lista.
    expect(mesesDoAluguer({ mensal: true, data_entrega: '2026-11-01', data_fim_prevista: '2027-06-30', data_recolha: '2026-07-23' }, sel))
      .toEqual(mesesEntre('2026-11', '2027-06'))
  })
  it('fim previsto anterior à entrega mostra pelo menos o mês da entrega', () => {
    expect(mesesDoAluguer({ mensal: true, data_entrega: '2026-11-10', data_fim_prevista: '2026-10-31' }, sel)).toEqual(['2026-11'])
  })
  it('sem data de entrega não aparece', () => {
    expect(mesesDoAluguer({ mensal: true, data_entrega: null }, sel)).toEqual([])
  })
})
