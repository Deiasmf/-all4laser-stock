import { describe, it, expect } from 'vitest'
import {
  CAMPOS_OBRIGATORIOS,
  ROTULO_OBRIGATORIO,
  camposEmFalta,
  type Equipamento,
} from './equipamento'

// Cria um equipamento completo (todos os campos obrigatórios preenchidos).
// Os testes alteram só o campo que querem verificar.
function criarEquipamento(overrides: Partial<Equipamento> = {}): Equipamento {
  return {
    id: '1',
    modelo: 'Gmax Pro Plus',
    marca: 'Candela',
    serial_number: 'SN-12345',
    ano: '2023',
    origem: 'Portugal',
    destino: null,
    data_entrada: '2023-01-15',
    data_saida: null,
    status: 'Em stock',
    original_upgraded: null,
    valor_compra: 10000,
    preco_venda: null,
    fatura_compra: null,
    fatura_compra_url: null,
    fatura_compra_caminho: null,
    fatura_saida: null,
    awb_dau: null,
    awb_dau_caminho: null,
    nota_encomenda: null,
    nota_encomenda_caminho: null,
    rentabilizacao: null,
    hp: null,
    acessorios: null,
    relatorio_tecnico: null,
    relatorio_tecnico_caminho: null,
    observacoes: null,
    criado_por: null,
    criado_por_nome: null,
    saida_por: null,
    saida_por_nome: null,
    created_at: '2023-01-15T00:00:00Z',
    updated_at: '2023-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('CAMPOS_OBRIGATORIOS', () => {
  it('contém os cinco campos obrigatórios', () => {
    expect(CAMPOS_OBRIGATORIOS).toEqual([
      'modelo',
      'serial_number',
      'ano',
      'data_entrada',
      'status',
    ])
  })

  it('tem um rótulo legível para cada campo obrigatório', () => {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      expect(ROTULO_OBRIGATORIO[campo]).toBeTruthy()
    }
  })
})

describe('camposEmFalta', () => {
  it('devolve lista vazia quando todos os campos obrigatórios estão preenchidos', () => {
    expect(camposEmFalta(criarEquipamento())).toEqual([])
  })

  it('deteta um campo obrigatório a null', () => {
    const e = criarEquipamento({ serial_number: null })
    expect(camposEmFalta(e)).toEqual(['serial_number'])
  })

  it('deteta um campo obrigatório como string vazia', () => {
    const e = criarEquipamento({ modelo: '' })
    expect(camposEmFalta(e)).toEqual(['modelo'])
  })

  it('deteta vários campos em falta e mantém a ordem de CAMPOS_OBRIGATORIOS', () => {
    const e = criarEquipamento({
      modelo: null,
      ano: '',
      status: null,
    })
    expect(camposEmFalta(e)).toEqual(['modelo', 'ano', 'status'])
  })

  it('devolve todos os campos quando o equipamento está vazio', () => {
    const e = criarEquipamento({
      modelo: null,
      serial_number: null,
      ano: null,
      data_entrada: null,
      status: null,
    })
    expect(camposEmFalta(e)).toEqual(CAMPOS_OBRIGATORIOS)
  })

  it('não considera em falta campos não obrigatórios que estejam a null', () => {
    // observacoes, preco_venda, etc. são null mas não são obrigatórios
    expect(camposEmFalta(criarEquipamento())).toEqual([])
  })

  it('não trata o número 0 como valor em falta', () => {
    // valor_compra = 0 é um valor válido; além disso não é campo obrigatório,
    // mas garantimos que 0 nunca é confundido com "em falta"
    const e = criarEquipamento({ valor_compra: 0 })
    expect(camposEmFalta(e)).toEqual([])
  })
})
