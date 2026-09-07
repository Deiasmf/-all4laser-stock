import { describe, it, expect } from 'vitest'
import { mapearPromocao } from './marketing'

// PROMOTION_TYPE: ORGANIC / CANDIDATE_PAID → estrategia_promocao, ignorando
// maiúsculas/minúsculas e espaços; aviso quando o valor não é reconhecido.
describe('mapearPromocao (PROMOTION_TYPE)', () => {
  it('reconhece ORGANIC', () => {
    expect(mapearPromocao('ORGANIC')).toEqual({ estrategia: 'organica', aviso: null })
  })
  it('reconhece CANDIDATE_PAID', () => {
    expect(mapearPromocao('CANDIDATE_PAID')).toEqual({ estrategia: 'candidata_paga', aviso: null })
  })
  it('ignora maiúsculas/minúsculas e espaços', () => {
    expect(mapearPromocao('  organic  ').estrategia).toBe('organica')
    expect(mapearPromocao(' Candidate_Paid ').estrategia).toBe('candidata_paga')
  })
  it('aceita sinónimos PT/paid', () => {
    expect(mapearPromocao('Pago').estrategia).toBe('candidata_paga')
    expect(mapearPromocao('Orgânica').estrategia).toBe('organica')
    expect(mapearPromocao('PAID').estrategia).toBe('candidata_paga')
  })
  it('vazio → orgânica sem aviso', () => {
    expect(mapearPromocao('')).toEqual({ estrategia: 'organica', aviso: null })
  })
  it('valor desconhecido → orgânica com aviso', () => {
    const r = mapearPromocao('QUALQUER_COISA')
    expect(r.estrategia).toBe('organica')
    expect(r.aviso).toBeTruthy()
  })
})
