import { describe, it, expect } from 'vitest'
import { alocarFaturas, extrato, resumoEntidades, aging, type MovimentoCC } from './contasCorrentes'

function mov(p: Partial<MovimentoCC>): MovimentoCC {
  return {
    id: 'm', entidade_tipo: 'cliente', cliente_id: 'c1', fornecedor_id: null,
    entidade_nome: 'Clínica Exemplo', tipo_documento: 'fatura', documento_ref: 'FT1',
    data_documento: '2026-01-10', data_vencimento: null, valor_debito: 0, valor_credito: 0,
    valor_liquidado: 0, estado: 'pendente', notas: null, descricao: null, categoria: null,
    subcategoria_id: null, categoria_manual: false, categoria_auto: false,
    data_pagamento: null, metodo_pagamento: null, afeta_saldo: true,
    lembretes_auto: false, lembrete_ultimo: null, origem: 'keyinvoice', keyinvoice_doc_id: null,
    ficheiro_caminho: null, ficheiro_nome: null, criado_por: null, criado_por_nome: null,
    created_at: '2026-01-10T00:00:00Z', updated_at: '2026-01-10T00:00:00Z', ...p,
  }
}

describe('alocarFaturas', () => {
  it('distribui os créditos pelas faturas mais antigas', () => {
    const ms = [
      mov({ id: 'f1', valor_debito: 100, data_documento: '2026-01-01' }),
      mov({ id: 'f2', valor_debito: 100, data_documento: '2026-02-01' }),
      mov({ id: 'r1', tipo_documento: 'recibo', valor_credito: 150, data_documento: '2026-03-01' }),
    ]
    const a = alocarFaturas(ms)
    expect(a.get('f1')).toEqual({ liquidado: 100, porLiquidar: 0, estado: 'liquidado' })
    expect(a.get('f2')).toEqual({ liquidado: 50, porLiquidar: 50, estado: 'parcial' })
  })

  it('respeita o pagamento confirmado à mão na própria fatura', () => {
    const ms = [mov({ id: 'f1', valor_debito: 200, valor_liquidado: 200, estado: 'liquidado' })]
    expect(alocarFaturas(ms).get('f1')).toEqual({ liquidado: 200, porLiquidar: 0, estado: 'liquidado' })
  })

  it('não conta duas vezes o pagamento manual e o recibo', () => {
    const ms = [
      mov({ id: 'f1', valor_debito: 100, valor_liquidado: 60 }),
      mov({ id: 'f2', valor_debito: 100, data_documento: '2026-02-01' }),
      mov({ id: 'r1', tipo_documento: 'recibo', valor_credito: 100, data_documento: '2026-03-01' }),
    ]
    const a = alocarFaturas(ms)
    // O crédito cobre os 40 que faltavam na f1 e 60 da f2.
    expect(a.get('f1')?.porLiquidar).toBe(0)
    expect(a.get('f2')?.porLiquidar).toBe(40)
  })

  it('ignora pró-formas (não são dívida)', () => {
    const ms = [
      mov({ id: 'p1', tipo_documento: 'pro_forma', valor_debito: 500, afeta_saldo: false }),
      mov({ id: 'f1', valor_debito: 100, data_documento: '2026-02-01' }),
    ]
    const a = alocarFaturas(ms)
    expect(a.has('p1')).toBe(false)
    expect(a.get('f1')?.porLiquidar).toBe(100)
  })
})

describe('saldo e aging com pró-formas', () => {
  const ms = [
    mov({ id: 'p1', tipo_documento: 'pro_forma', valor_debito: 500, afeta_saldo: false, data_documento: '2026-01-05' }),
    mov({ id: 'f1', valor_debito: 100, data_vencimento: '2026-02-01' }),
  ]
  it('a pró-forma não entra no saldo nem no aging', () => {
    expect(resumoEntidades(ms, '2026-03-01')[0].saldo).toBe(100)
    expect(aging(ms, '2026-03-01').total).toBe(100)
  })
  it('a pró-forma aparece no extrato sem mexer no saldo acumulado', () => {
    const linhas = extrato(ms)
    expect(linhas.map((l) => l.saldoAcumulado)).toEqual([0, 100])
    expect(linhas[0].estadoCalc).toBe('pendente')
  })
})
