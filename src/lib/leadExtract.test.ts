import { describe, it, expect } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { falhaGlobalIA, normalizarLead } from './leadExtract'

const apiError = (status: number | undefined, mensagem: string) =>
  Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'invalid_request_error', message: mensagem } },
    undefined,
    new Headers(),
  )

describe('falhaGlobalIA', () => {
  it('sem créditos (400) para a corrida toda', () => {
    // A mensagem real da API quando o saldo acaba — o que fez falhar o cron.
    expect(falhaGlobalIA(apiError(400, 'Your credit balance is too low to access the Anthropic API.'))).toBe(true)
  })

  it('chave inválida, limite de pedidos e API em baixo param a corrida', () => {
    expect(falhaGlobalIA(apiError(401, 'invalid x-api-key'))).toBe(true)
    expect(falhaGlobalIA(apiError(429, 'rate limit'))).toBe(true)
    expect(falhaGlobalIA(apiError(529, 'overloaded'))).toBe(true)
  })

  it('falha de ligação (sem status) para a corrida toda', () => {
    expect(falhaGlobalIA(new Anthropic.APIConnectionError({ message: 'sem rede' }))).toBe(true)
  })

  it('falta de ANTHROPIC_API_KEY para a corrida toda', () => {
    expect(falhaGlobalIA(new Error('Falta ANTHROPIC_API_KEY.'))).toBe(true)
  })

  it('pedido inválido por causa do email não para os emails seguintes', () => {
    expect(falhaGlobalIA(apiError(400, 'prompt is too long'))).toBe(false)
    expect(falhaGlobalIA(apiError(404, 'model not found'))).toBe(false)
    expect(falhaGlobalIA(new Error('resposta sem tool_use'))).toBe(false)
  })
})

describe('normalizarLead', () => {
  it('limpa espaços e trata sentinelas como vazio', () => {
    expect(normalizarLead({
      nome: '  Ana Silva ', email: 'N/A', telefone: 'desconhecido',
      modelo_interesse: null, cidade: '', mensagem: 'Quer orçamento',
    })).toEqual({
      nome: 'Ana Silva', email: null, telefone: null,
      modelo_interesse: null, cidade: null, mensagem: 'Quer orçamento',
    })
  })

  it('campos em falta ficam a null', () => {
    expect(normalizarLead({})).toEqual({
      nome: null, email: null, telefone: null, modelo_interesse: null, cidade: null, mensagem: null,
    })
  })
})
