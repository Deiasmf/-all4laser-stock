import { describe, expect, it } from 'vitest'
import { tabelaVolumesEmail, tabelaVolumesEmailHtml } from './freight'

const linhas = [
  { ext_c: 120, ext_l: 80, ext_a: 60, quantidade: 2, peso_volume: 35 },
  { ext_c: 40, ext_l: 30, ext_a: 20, quantidade: 1, peso_volume: null },
]

describe('tabelaVolumesEmailHtml', () => {
  it('renders a real HTML table for freight quote emails', () => {
    const html = tabelaVolumesEmailHtml(linhas, 'pt')

    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('120 x 80 x 60')
    expect(html).toContain('Totais: 3 volumes')
    expect(html).toContain('1.176 m&sup3;')
  })

  it('keeps the text version as plain fixed-width fallback', () => {
    const texto = tabelaVolumesEmail(linhas, 'pt')

    expect(texto).toContain('120×80×60')
    expect(texto).toContain('Totais: 3 volumes')
  })
})
