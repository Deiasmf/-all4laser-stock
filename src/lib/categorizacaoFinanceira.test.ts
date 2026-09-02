import { describe, it, expect } from 'vitest'
import { categorizar, extrairDespesas, extrairMontante, parseMontantePt } from './categorizacaoFinanceira'

describe('categorizar', () => {
  it('classifica serviço técnico', () => {
    expect(categorizar('Assistência técnica ao equipamento')).toBe('servico_tecnico')
    expect(categorizar('Reparação de fonte + mão de obra')).toBe('servico_tecnico')
    expect(categorizar(null, 'FT2026/12', 'Manutenção preventiva')).toBe('servico_tecnico')
  })
  it('classifica aluguer e venda', () => {
    expect(categorizar('Aluguer mensal Motus AY')).toBe('aluguer')
    expect(categorizar('Venda de consumíveis')).toBe('venda')
  })
  it('serviço técnico ganha à venda quando ambos aparecem', () => {
    expect(categorizar('Instalação de equipamento novo')).toBe('servico_tecnico')
  })
  it('devolve null quando nada encaixa', () => {
    expect(categorizar('Acerto de conta 2025')).toBeNull()
    expect(categorizar('')).toBeNull()
    expect(categorizar(null, undefined)).toBeNull()
  })
})

describe('parseMontantePt', () => {
  it('lê formatos português e inglês', () => {
    expect(parseMontantePt('1.234,50')).toBe(1234.5)
    expect(parseMontantePt('120,00')).toBe(120)
    expect(parseMontantePt('85.5')).toBe(85.5)
    expect(parseMontantePt('1.500')).toBe(1500)
  })
})

describe('extrairMontante', () => {
  it('aceita números com moeda ou 2 decimais', () => {
    expect(extrairMontante('Deslocação 120,00')).toBe(120)
    expect(extrairMontante('Estadia 85 €')).toBe(85)
    expect(extrairMontante('Hotel € 92,40')).toBe(92.4)
  })
  it('ignora quantidades com unidade', () => {
    expect(extrairMontante('Deslocação 120 km')).toBeNull()
    expect(extrairMontante('Estadia 2 noites')).toBeNull()
  })
  it('com unidade e valor, fica o valor', () => {
    expect(extrairMontante('Deslocação 120 km — 60,00')).toBe(60)
  })
})

describe('extrairDespesas', () => {
  it('extrai as despesas com montante identificável', () => {
    const d = extrairDespesas('Reparação laser; Deslocação 120,00; Estadia 85,00 €; Alimentação 2 refeições')
    expect(d.map((x) => x.tipo)).toEqual(['deslocacao', 'estadia'])
    expect(d.map((x) => x.valor)).toEqual([120, 85])
  })
  it('sem descrição não inventa nada', () => {
    expect(extrairDespesas(null)).toEqual([])
    expect(extrairDespesas('Assistência técnica')).toEqual([])
  })
})
