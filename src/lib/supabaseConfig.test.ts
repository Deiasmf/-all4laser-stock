import { describe, expect, it } from 'vitest'
import { validateSupabaseConfig as validate } from './supabaseConfig'
const staging = 'https://wvdmhohijzyymadsfiaz.supabase.co'
const production = 'https://lykfbclxsyazerffcpta.supabase.co'
describe('isolamento Supabase', () => {
  it('exige configuração explícita', () => {
    expect(() => validate(undefined, undefined, undefined)).toThrow()
    expect(() => validate(staging, '', 'preview')).toThrow()
  })
  it('recusa produção em preview e desenvolvimento', () => {
    for (const env of [undefined, 'preview', 'development']) expect(() => validate(production, 'sb_publishable_test', env)).toThrow()
  })
  it('aceita staging e Supabase local', () => {
    expect(validate(staging, 'sb_publishable_test', 'preview').url).toBe(staging)
    expect(validate('http://127.0.0.1:54321', 'sb_publishable_test', undefined).url).toContain('127.0.0.1')
  })
  it('permite produção apenas no deployment explícito de produção', () => {
    expect(validate(production, 'sb_publishable_test', 'production').url).toBe(production)
  })
  it('recusa segredos e JWT de outro projeto', () => {
    expect(() => validate(staging, 'sb_secret_test', 'preview')).toThrow()
    for (const payload of [{ role: 'service_role' }, { role: 'anon', ref: 'lykfbclxsyazerffcpta' }]) {
      const jwt = `e30.${btoa(JSON.stringify(payload))}.test`
      expect(() => validate(staging, jwt, 'preview')).toThrow()
    }
  })
  it('recusa HTTP remoto e URLs com credenciais', () => {
    expect(() => validate(staging.replace('https:', 'http:'), 'key', 'preview')).toThrow()
    expect(() => validate(staging.replace('https://', 'https://user:pass@'), 'key', 'preview')).toThrow()
  })
})
