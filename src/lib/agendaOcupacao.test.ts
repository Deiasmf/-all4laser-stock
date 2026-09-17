import { describe, it, expect } from 'vitest'
import { diasDaMarcacao, marcacaoOcupa, ocupacaoPorGrupo, type MarcacaoAgenda } from './agendaOcupacao'
import { grupoPreco, GRUPOS_PRECO } from './alugueres'

const diaInteiro = (inicio: string, fim: string, titulo = 'Cliente'): MarcacaoAgenda =>
  ({ titulo, inicio, fim, diaInteiro: true })
const comHora = (inicio: string, fim: string, titulo = 'Cliente'): MarcacaoAgenda =>
  ({ titulo, inicio, fim, diaInteiro: false })

describe('diasDaMarcacao', () => {
  it('converte o fim exclusivo dos eventos de dia inteiro no último dia ocupado', () => {
    expect(diasDaMarcacao(diaInteiro('2026-09-10', '2026-09-13'))).toEqual({ inicio: '2026-09-10', fim: '2026-09-12' })
  })

  it('um evento de um só dia ocupa esse dia', () => {
    expect(diasDaMarcacao(diaInteiro('2026-09-10', '2026-09-11'))).toEqual({ inicio: '2026-09-10', fim: '2026-09-10' })
  })

  it('não deixa o fim cair antes do início em eventos mal formados', () => {
    expect(diasDaMarcacao(diaInteiro('2026-09-10', '2026-09-10'))).toEqual({ inicio: '2026-09-10', fim: '2026-09-10' })
  })

  it('atravessa a mudança de mês', () => {
    expect(diasDaMarcacao(diaInteiro('2026-08-31', '2026-09-02'))).toEqual({ inicio: '2026-08-31', fim: '2026-09-01' })
  })

  it('nos eventos com hora usa a data tal como vem (fuso do evento), fim inclusive', () => {
    expect(diasDaMarcacao(comHora('2026-09-10T09:00:00+01:00', '2026-09-12T18:30:00+01:00')))
      .toEqual({ inicio: '2026-09-10', fim: '2026-09-12' })
  })
})

describe('marcacaoOcupa', () => {
  const m = diaInteiro('2026-09-10', '2026-09-13') // ocupa 10, 11 e 12

  it('conta a sobreposição total, parcial e nos limites', () => {
    expect(marcacaoOcupa(m, '2026-09-10', '2026-09-12')).toBe(true)
    expect(marcacaoOcupa(m, '2026-09-01', '2026-09-30')).toBe(true)
    expect(marcacaoOcupa(m, '2026-09-12', '2026-09-20')).toBe(true) // último dia ocupado
    expect(marcacaoOcupa(m, '2026-09-01', '2026-09-10')).toBe(true) // primeiro dia ocupado
  })

  it('não conta quando não há sobreposição — incluindo o dia do fim exclusivo', () => {
    expect(marcacaoOcupa(m, '2026-09-13', '2026-09-20')).toBe(false)
    expect(marcacaoOcupa(m, '2026-09-01', '2026-09-09')).toBe(false)
  })
})

describe('ocupacaoPorGrupo', () => {
  it('soma as marcações por grupo e devolve-as ordenadas por data', () => {
    const r = ocupacaoPorGrupo(
      [
        { calendario: 'Laser 1', modelo_grupo: 'gentlemaxpro', marcacoes: [diaInteiro('2026-09-14', '2026-09-16', 'Clínica B')] },
        { calendario: 'Laser 2', modelo_grupo: 'gentlemaxpro', marcacoes: [diaInteiro('2026-09-10', '2026-09-20', 'Clínica A')] },
        { calendario: 'Soprano 1', modelo_grupo: 'sopranoice', marcacoes: [diaInteiro('2026-09-15', '2026-09-16', '')] },
      ],
      '2026-09-15',
      '2026-09-15',
    )
    expect(r.porGrupo).toEqual({ gentlemaxpro: 2, sopranoice: 1 })
    expect(r.marcacoes.map((m) => m.inicio)).toEqual(['2026-09-10', '2026-09-14', '2026-09-15'])
    expect(r.marcacoes[2].titulo).toBe('(sem título)')
  })

  it('ignora as marcações fora do intervalo e grupos sem ocupação', () => {
    const r = ocupacaoPorGrupo(
      [{ calendario: 'Laser 1', modelo_grupo: 'gentlepro', marcacoes: [diaInteiro('2026-09-01', '2026-09-03')] }],
      '2026-09-10',
      '2026-09-12',
    )
    expect(r.porGrupo).toEqual({})
    expect(r.marcacoes).toEqual([])
  })

  it('duas marcações sobrepostas no mesmo calendário contam duas unidades', () => {
    const r = ocupacaoPorGrupo(
      [{
        calendario: 'Laser 1',
        modelo_grupo: 'gentlepro',
        marcacoes: [diaInteiro('2026-09-10', '2026-09-12'), diaInteiro('2026-09-11', '2026-09-13')],
      }],
      '2026-09-11',
      '2026-09-11',
    )
    expect(r.porGrupo).toEqual({ gentlepro: 2 })
  })
})

describe('grupoPreco (cruzamento catálogo ↔ agendas)', () => {
  it('reconhece os nomes do catálogo de aluguer', () => {
    expect(grupoPreco('GentleMax Pro')).toBe('gentlemaxpro')
    expect(grupoPreco('GentleMax Pro Plus')).toBe('gentlemaxproplus')
    expect(grupoPreco('Gentle Pro')).toBe('gentlepro')
    expect(grupoPreco('Soprano ICE')).toBe('sopranoice')
    expect(grupoPreco('Soprano Platinum')).toBe('sopranoplatinum')
  })

  it('exclui o Pro-U e o que não é modelo de aluguer', () => {
    expect(grupoPreco('Gentle Pro-U')).toBe(null)
    expect(grupoPreco('Zimmer Cryo 6')).toBe(null)
    expect(grupoPreco('')).toBe(null)
  })

  it('todos os grupos oferecidos na Agenda/Preços são alcançáveis pelos nomes do catálogo', () => {
    const alcancados = new Set(
      ['Gentle Pro', 'GentleMax Pro', 'GentleMax Pro Plus', 'Soprano ICE', 'Soprano Platinum'].map((n) => grupoPreco(n)),
    )
    for (const g of GRUPOS_PRECO) expect(alcancados.has(g.grupo)).toBe(true)
  })
})
