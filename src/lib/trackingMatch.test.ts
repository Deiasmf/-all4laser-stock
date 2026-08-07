import { describe, it, expect } from 'vitest'
import { matchCarrier, detetarDirecao, ehAll4laser, matchEntidade, normalizar } from './trackingMatch'
import type { Carrier } from '@/types/tracking'

const carrier = (over: Partial<Carrier>): Carrier => ({
  id: over.id ?? crypto.randomUUID(),
  nome: over.nome ?? '',
  tipo: over.tipo ?? 'expresso',
  codigo: over.codigo ?? null,
  prefixo_awb: over.prefixo_awb ?? null,
  url_template: over.url_template ?? null,
  deteta_regex: over.deteta_regex ?? null,
  carrier_code_api: over.carrier_code_api ?? null,
  ativo: over.ativo ?? true,
})

const CARRIERS: Carrier[] = [
  carrier({ nome: 'UPS', codigo: 'UPS' }),
  carrier({ nome: 'FedEx', codigo: 'FEDEX' }),
  carrier({ nome: 'DHL', codigo: 'DHL' }),
  carrier({ nome: 'Nacex', codigo: 'NACEX' }),
  carrier({ nome: 'CTT', codigo: 'CTT' }),
  carrier({ nome: 'TAP Air Portugal', tipo: 'companhia_aerea', prefixo_awb: '047' }),
]

describe('matchCarrier', () => {
  it('resolve alcunhas comuns para o carrier certo', () => {
    expect(matchCarrier('DHL Express', CARRIERS)?.codigo).toBe('DHL')
    expect(matchCarrier('United Parcel Service', CARRIERS)?.codigo).toBe('UPS')
    expect(matchCarrier('Federal Express', CARRIERS)?.codigo).toBe('FEDEX')
  })

  it('casa por igualdade de nome/código (case e acentos ignorados)', () => {
    expect(matchCarrier('ups', CARRIERS)?.codigo).toBe('UPS')
    expect(matchCarrier('Nacex', CARRIERS)?.codigo).toBe('NACEX')
  })

  it('casa por contenção (companhia aérea)', () => {
    expect(matchCarrier('TAP Air Cargo', CARRIERS)?.nome).toBe('TAP Air Portugal')
  })

  it('devolve null quando não reconhece nem tem vazio', () => {
    expect(matchCarrier('Transportadora Desconhecida XYZ', CARRIERS)).toBeNull()
    expect(matchCarrier(null, CARRIERS)).toBeNull()
    expect(matchCarrier('', CARRIERS)).toBeNull()
  })
})

describe('ehAll4laser / detetarDirecao', () => {
  it('reconhece a morada da All4laser', () => {
    expect(ehAll4laser('All4laser', 'Rua dos Caniços 31/33', 'Portugal')).toBe(true)
    expect(ehAll4laser('Clínica X', 'Av. da Liberdade', 'Portugal')).toBe(false)
    expect(ehAll4laser(null, 'Rua dos Canicos 31, Vialonga', null)).toBe(true)
  })

  it('nós como remetente → envio', () => {
    const dir = detetarDirecao(
      { nome: 'All4laser', morada: 'Rua dos Caniços 31/33, Vialonga', pais: 'Portugal' },
      { nome: 'Clínica Estética Lda', morada: 'Madrid', pais: 'Espanha' },
    )
    expect(dir).toBe('envio')
  })

  it('nós como destinatário → rececao', () => {
    const dir = detetarDirecao(
      { nome: 'Fornecedor GmbH', morada: 'Berlin', pais: 'Alemanha' },
      { nome: 'All4laser', morada: 'Vialonga', pais: 'Portugal' },
    )
    expect(dir).toBe('rececao')
  })

  it('indeterminado quando ambos ou nenhum casam', () => {
    expect(detetarDirecao({ nome: 'A' }, { nome: 'B' })).toBeNull()
    expect(
      detetarDirecao({ morada: 'Vialonga' }, { morada: 'Caniços' }),
    ).toBeNull()
  })
})

describe('matchEntidade', () => {
  const ENT = [
    { id: '1', nome: 'Clínica Estética Lisboa', morada: 'Av. da Liberdade 10', tipo: 'cliente' as const },
    { id: '2', nome: 'Zimmer MedizinSysteme GmbH', morada: null, tipo: 'fornecedor' as const },
  ]

  it('casa por nome exato (acentos/caixa ignorados)', () => {
    expect(matchEntidade('clinica estetica lisboa', null, ENT)?.entidade.id).toBe('1')
  })

  it('casa por contenção parcial de nome', () => {
    expect(matchEntidade('Zimmer MedizinSysteme', null, ENT)?.entidade.id).toBe('2')
  })

  it('não casa em nomes demasiado curtos ou desconhecidos', () => {
    expect(matchEntidade('AB', null, ENT)).toBeNull()
    expect(matchEntidade('Empresa Totalmente Diferente', null, ENT)).toBeNull()
  })
})

describe('normalizar', () => {
  it('remove acentos, pontuação e colapsa espaços', () => {
    expect(normalizar('  São  Paulo, Lda. ')).toBe('sao paulo lda')
  })
})
