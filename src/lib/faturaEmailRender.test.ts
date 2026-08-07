import { describe, it, expect } from 'vitest'
import { render, periodoDoMes, nFaturaDoNome, formatarValor, criticosEmFalta } from './faturaEmailRender'

describe('render', () => {
  it('substitui {{chave}} pelos valores; em falta fica vazio', () => {
    expect(render('Olá {{nome_contacto}}, fatura {{n_fatura}}', { nome_contacto: 'Ana', n_fatura: 'FT-1' }))
      .toBe('Olá Ana, fatura FT-1')
    expect(render('valor {{valor}} €', {})).toBe('valor  €')
  })
})

describe('periodoDoMes', () => {
  it('converte YYYY-MM para mês por extenso', () => {
    expect(periodoDoMes('2026-06')).toBe('Junho 2026')
    expect(periodoDoMes('2026-01')).toBe('Janeiro 2026')
  })
  it('devolve o original se não reconhecer', () => {
    expect(periodoDoMes('abc')).toBe('abc')
  })
})

describe('nFaturaDoNome', () => {
  it('tira a extensão do nome do ficheiro', () => {
    expect(nFaturaDoNome('FT2026-06.pdf')).toBe('FT2026-06')
    expect(nFaturaDoNome('fatura_123.PDF')).toBe('fatura_123')
    expect(nFaturaDoNome(null)).toBe('')
  })
})

describe('formatarValor', () => {
  it('formata com 2 casas decimais e vírgula', () => {
    expect(formatarValor(50)).toBe('50,00')
    expect(formatarValor(99.9)).toBe('99,90')
    expect(formatarValor(null)).toBe('')
  })
})

describe('criticosEmFalta', () => {
  it('lista os placeholders críticos vazios', () => {
    expect(criticosEmFalta({ n_fatura: 'FT-1', periodo: 'Junho 2026', valor: '50,00', equipamento: 'Gmax', nome_contacto: 'Ana' })).toEqual([])
    expect(criticosEmFalta({ n_fatura: '', valor: '50,00' })).toContain('n_fatura')
    expect(criticosEmFalta({})).toEqual(['n_fatura', 'periodo', 'valor', 'equipamento', 'nome_contacto'])
  })
})
