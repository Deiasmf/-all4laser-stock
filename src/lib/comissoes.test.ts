import { describe, it, expect } from 'vitest'
import { calcularComissao, resumoComissoes, type ComissaoCalc } from './comissoes'

describe('calcularComissao', () => {
  it('retira as despesas antes de aplicar a percentagem', () => {
    const r = calcularComissao(1000, [{ valor: 120 }, { valor: 85 }, { valor: 45 }], 10)
    expect(r.totalDespesas).toBe(250)
    expect(r.base).toBe(750)
    expect(r.valorComissao).toBe(75)
  })
  it('sem técnico atribuído (sem taxa) não inventa comissão', () => {
    const r = calcularComissao(1000, [{ valor: 100 }], null)
    expect(r.base).toBe(900)
    expect(r.valorComissao).toBe(0)
  })
  it('despesas acima do valor faturado não geram base negativa', () => {
    expect(calcularComissao(200, [{ valor: 350 }], 10)).toEqual({
      totalDespesas: 350, base: 0, valorComissao: 0,
    })
  })
  it('arredonda a dois decimais', () => {
    expect(calcularComissao(333.33, [], 7.5).valorComissao).toBe(25)
  })
})

function linha(p: Partial<ComissaoCalc>): ComissaoCalc {
  return {
    id: 'x', movimento_id: null, cliente_id: null, cliente_nome: null, documento_ref: null,
    data_documento: '2026-05-01', valor_documento: 0, descricao: null, tecnico_id: null,
    tecnico_nome: null, folha_obra_id: null, folha_numero: null, percentagem: null,
    estado: 'por_apurar', notas: null, origem_anulada: false, apurada_em: null,
    apurada_por_nome: null, paga_em: null, created_at: '', updated_at: '',
    despesas: [], totalDespesas: 0, base: 0, valorComissao: 0, ...p,
  }
}

describe('resumoComissoes', () => {
  it('soma faturado, despesas, base e comissões e isola o que falta pagar', () => {
    const r = resumoComissoes([
      linha({ valor_documento: 1000, totalDespesas: 200, base: 800, valorComissao: 80, estado: 'apurada' }),
      linha({ valor_documento: 500, totalDespesas: 0, base: 500, valorComissao: 50, estado: 'paga' }),
      linha({ valor_documento: 300, estado: 'por_apurar' }),
    ])
    expect(r).toEqual({
      n: 3, porApurar: 1, faturado: 1800, despesas: 200, base: 1300, comissoes: 130, porPagar: 80,
    })
  })
})
