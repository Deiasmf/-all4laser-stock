import { describe, it, expect } from 'vitest'
import { parseCsv } from './keyinvoiceSync'

// Export de Orçamentos do Keyinvoice (as "Fatura Proforma" da All4laser).
// Cabeçalho real fornecido pela Andreia. Testa que TODAS as linhas entram como
// pró-forma (mesmo com a referência a começar por "Fatura Proforma …", que o
// parser genérico leria como fatura), com o Valor Total como valor.
describe('parseCsv — export de Orçamentos (pró-formas)', () => {
  const csv = [
    'Data\tSérie\tNº\tRefª Docº\tCliente\tNIF\tValor s/IVA\tValor IVA\tValor Total\tFaturada?',
    '2026-01-15\t76\t1\tFatura Proforma 76/1\tClínica Exemplo Lda\t500100200\t1000,00\t230,00\t1230,00\tNão',
    '2026-02-20\t76\t2\tFatura Proforma 76/2\tDermaMed International LLP\t\t2000,00\t0,00\t2000,00\tSim',
    '2026-03-05\t76\t3\tFatura Proforma 76/3\tLaserix\tEM001\t1.250,00\t0,00\t1.250,00\tNão',
    '2026-04-10\t76\t4\tFatura Proforma 76/4\tClínica Sem Valor\t500999888\t\t\t\tNão',
  ].join('\n')

  const { docs, erros } = parseCsv(csv)

  it('não gera erros de parsing (valor vazio não é erro)', () => {
    expect(erros).toEqual([])
  })

  it('lê as 4 linhas todas como pró-forma', () => {
    expect(docs).toHaveLength(4)
    expect(docs.every((d) => d.tipo_documento === 'pro_forma')).toBe(true)
    expect(docs.every((d) => d.entidade_tipo === 'cliente')).toBe(true)
  })

  it('usa o Valor Total (c/IVA) e trata o separador de milhares', () => {
    expect(docs[0].valor).toBe(1230)
    expect(docs[2].valor).toBe(1250) // "1.250,00" → 1250
  })

  it('mantém a referência, o cliente, o NIF e a data', () => {
    expect(docs[0].numero).toBe('Fatura Proforma 76/1')
    expect(docs[0].nome).toBe('Clínica Exemplo Lda')
    expect(docs[0].nif).toBe('500100200')
    expect(docs[0].data_documento).toBe('2026-01-15')
    expect(docs[2].nome).toBe('Laserix')
    expect(docs[2].nif).toBe('EM001')
  })

  it('gera keyinvoice_doc_id estável por referência (idempotente)', () => {
    expect(docs[0].keyinvoice_doc_id).toBe('pro_forma|Fatura Proforma 76/1')
    expect(new Set(docs.map((d) => d.keyinvoice_doc_id)).size).toBe(4)
  })

  it('pró-forma sem NIF fica com nif null (associa por nome)', () => {
    expect(docs[1].nif).toBeNull()
    expect(docs[1].nome).toBe('DermaMed International LLP')
  })

  it('pró-forma sem valor entra na mesma com valor 0 (proposta em branco)', () => {
    expect(docs[3].valor).toBe(0)
    expect(docs[3].tipo_documento).toBe('pro_forma')
    expect(docs[3].numero).toBe('Fatura Proforma 76/4')
    expect(docs[3].nome).toBe('Clínica Sem Valor')
  })
})
