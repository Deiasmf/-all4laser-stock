import { describe, it, expect } from 'vitest'
import { gerarPdfFichaProduto, type FichaProdutoDados } from './fichaProdutoPdf'

// Smoke test do gerador de PDF da ficha de produto: garante que a montagem
// (secções, tabela de handpieces, acessórios, especificações, quebras de
// página e os 4 idiomas) corre sem exceções e produz um PDF. Sem fotos, para
// correr em Node (as fotos usam APIs de browser).
const base: Omit<FichaProdutoDados, 'idioma'> = {
  marca: 'Candela', modelo: 'GentleMax Pro', ano: '2019',
  serialCompleto: 'GMP123456789', incluirSnCompleto: false,
  condicao: 'Usado em bom estado',
  condicaoDescricao: 'Equipamento revisto, sem marcas relevantes. '.repeat(20),
  voltagem: '230V', frequencia: '50/60 Hz', dimensoes: '120×60×110 cm', pesoKg: 92, softwareVersao: 'v4.2',
  handpieces: Array.from({ length: 12 }, (_, i) => ({ nome: `Handpiece ${i + 1}`, contador_pulsos: 100000 + i * 1234, data_leitura: '2026-02-15' })),
  acessorios: ['Pedal', 'Cabo de alimentação', 'Óculos de proteção (3)', 'Manípulo IPL', 'Carrinho'],
  preco: 39500,
  fotos: [],
}

describe('gerarPdfFichaProduto', () => {
  for (const idioma of ['pt', 'en', 'es', 'fr'] as const) {
    it(`gera um PDF em ${idioma}`, async () => {
      const blob = await gerarPdfFichaProduto({ ...base, idioma })
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBeGreaterThan(1000)
    })
  }

  it('funciona com dados mínimos (sem handpieces/acessórios/preço/specs)', async () => {
    const blob = await gerarPdfFichaProduto({
      idioma: 'pt', marca: null, modelo: 'X', ano: null,
      serialCompleto: null, incluirSnCompleto: false,
      condicao: null, condicaoDescricao: null,
      voltagem: null, frequencia: null, dimensoes: null, pesoKg: null, softwareVersao: null,
      handpieces: [], acessorios: [], preco: null, fotos: [],
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(500)
  })

  it('mostra o S/N parcial por default e completo quando pedido', async () => {
    // (não conseguimos ler o conteúdo do PDF facilmente, mas garantimos que
    // ambos os caminhos correm sem erro)
    const parcial = await gerarPdfFichaProduto({ ...base, idioma: 'pt', incluirSnCompleto: false })
    const completo = await gerarPdfFichaProduto({ ...base, idioma: 'pt', incluirSnCompleto: true })
    expect(parcial.size).toBeGreaterThan(1000)
    expect(completo.size).toBeGreaterThan(1000)
  })
})
