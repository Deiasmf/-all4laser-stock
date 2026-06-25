import { describe, it, expect } from 'vitest'
import { nomeModeloStock } from './modelos'

describe('nomeModeloStock', () => {
  it('separa Vbeam Perfecta pelos seriais 9914-0300 e 9914-0310', () => {
    expect(nomeModeloStock('VBeam', '9914-0300-0067')).toBe('Vbeam Perfecta')
    expect(nomeModeloStock('Vbeam', '9914-0300-0012')).toBe('Vbeam Perfecta')
    expect(nomeModeloStock('Vbeam', '9914-0310-3909')).toBe('Vbeam Perfecta')
  })

  it('trata os restantes Vbeam como "Vbeam"', () => {
    expect(nomeModeloStock('VBeam', '9914-0320-3072')).toBe('Vbeam')
    expect(nomeModeloStock('VBeam', '9914-0720-4279')).toBe('Vbeam')
    expect(nomeModeloStock('Vbeam', null)).toBe('Vbeam')
  })

  it('mapeia os prefixos de serial para os nomes canónicos', () => {
    expect(nomeModeloStock('Gente PRO', '9914-9015-1233')).toBe('Gentle Pro')
    expect(nomeModeloStock('Gentle PRO', '9914-9015-0003')).toBe('Gentle Pro')
    expect(nomeModeloStock('Gentle Pro-U', '9914-9030-15018')).toBe('Gentle Pro-U')
    expect(nomeModeloStock('Gentle MAXPRO', '9914-9035-0006')).toBe('GentleMax Pro')
    expect(nomeModeloStock('Gmaxpro Plus', '9914-9036-15046')).toBe('GentleMax Pro Plus')
  })

  it('o serial manda mesmo quando o modelo está mal classificado', () => {
    // 9914-9030 é sempre Gentle Pro-U, mesmo que o modelo diga "Gentle MAXPRO"
    expect(nomeModeloStock('Gentle MAXPRO', '9914-9030-0462')).toBe('Gentle Pro-U')
  })

  it('tolera seriais sem traço ou com espaços', () => {
    expect(nomeModeloStock('Gentle MAXPRO', '99149035-4934')).toBe('GentleMax Pro')
    expect(nomeModeloStock('Gentle PRO-U', '9914-9030- 16661')).toBe('Gentle Pro-U')
  })

  it('unifica variantes textuais de Gmax Pro quando não há regra de serial', () => {
    expect(nomeModeloStock('GentleMAXPRO', null)).toBe('GentleMax Pro')
    expect(nomeModeloStock('Gmax Pro', null)).toBe('GentleMax Pro')
    expect(nomeModeloStock('gmaxpro plus', null)).toBe('GentleMax Pro Plus')
  })

  it('NÃO confunde Gentle Yag Pro-U com Gmax Pro', () => {
    expect(nomeModeloStock('Gentle YAG PRO-U', '9914-9020-17452')).toBe('Gentle Yag Pro-U')
  })

  it('unifica Gentle Pro / Gentle Pro-U escritos por texto (sem serial 9015/9030)', () => {
    expect(nomeModeloStock('Gentle PRO', null)).toBe('Gentle Pro')
    expect(nomeModeloStock('Gentle PRO', '9914-0915-1276')).toBe('Gentle Pro')
    expect(nomeModeloStock('GentlePro', null)).toBe('Gentle Pro')
    expect(nomeModeloStock('Gentle PRO-U', '9914-9020-0641')).toBe('Gentle Pro-U')
    expect(nomeModeloStock('GentlePro-U', null)).toBe('Gentle Pro-U')
  })

  it('unifica Gentle Yag Pro-U e Harmony XL Pro (variantes de escrita)', () => {
    expect(nomeModeloStock('Gentle YAG PRO-U', '9914-9020-17452')).toBe('Gentle Yag Pro-U')
    expect(nomeModeloStock('Gentle Yag PRO-U', null)).toBe('Gentle Yag Pro-U')
    expect(nomeModeloStock('Harmony XL PRO', null)).toBe('Harmony XL Pro')
    expect(nomeModeloStock('Harmony Xl PRO', null)).toBe('Harmony XL Pro')
  })

  it('NÃO unifica os modelos vizinhos legítimos', () => {
    expect(nomeModeloStock('Gentle PRO LE', '9914-9040-3401')).toBe('Gentle PRO LE')
    expect(nomeModeloStock('Gentle Carcaçon PRO', '9914-0915-0343')).toBe('Gentle Carcaçon PRO')
    expect(nomeModeloStock('GentleLase PRO LE', '9914-9040-4399')).toBe('GentleLase PRO LE')
  })

  it('mantém os outros modelos como estão (só normaliza espaços)', () => {
    expect(nomeModeloStock('MGL Alex', '9914-0880-1008')).toBe('MGL Alex')
    expect(nomeModeloStock('Mini Gentle Yag ', '9914-0950-0125')).toBe('Mini Gentle Yag')
    expect(nomeModeloStock('Cryo 6', null)).toBe('Cryo 6')
  })

  it('devolve string vazia quando não há modelo nem regra de serial', () => {
    expect(nomeModeloStock(null, null)).toBe('')
    expect(nomeModeloStock('', '12345')).toBe('')
  })
})
