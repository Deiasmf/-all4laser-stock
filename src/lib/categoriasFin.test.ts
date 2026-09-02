import { describe, it, expect } from 'vitest'
import {
  aplicarRegras, resolverValor, valorDe, opcoesPlanas, nomeCategoriaDe,
  mapaCategorias, mapaSubcategorias,
  type CategoriaFin, type Subcategoria, type RegraCat,
} from './categoriasFin'

const cat = (chave: string, label: string, id = chave): CategoriaFin => ({
  id, chave, label, icon: '🏷️', cor: '#000', bg: '#fff', ordem: 1, ativo: true, protegida: false, created_at: '',
})
const sub = (id: string, categoria_id: string, nome: string): Subcategoria => ({
  id, categoria_id, nome, ordem: 1, ativo: true, created_at: '',
})
const regra = (over: Partial<RegraCat>): RegraCat => ({
  id: 'r', ordem: 1, ativo: true, campo: 'descricao', operador: 'contem', valor: '',
  categoria_chave: 'aluguer', subcategoria_id: null, created_at: '', ...over,
})

const CATS = [cat('aluguer', 'Aluguer'), cat('venda', 'Venda')]
const SUBS = [sub('s1', 'aluguer', 'Mensal'), sub('s2', 'venda', 'Equipamento')]

describe('aplicarRegras', () => {
  it('aplica a regra que contém o termo (sem acentos, case-insensitive)', () => {
    const r = aplicarRegras([regra({ valor: 'Aluguer', categoria_chave: 'aluguer' })], { descricao: 'Renda / ALUGUÉR mensal' })
    expect(r).toEqual({ categoria_chave: 'aluguer', subcategoria_id: null })
  })
  it('respeita a ordem: a 1ª regra ativa que casa vence', () => {
    const regras = [
      regra({ id: 'a', ordem: 1, valor: 'x', categoria_chave: 'venda' }),
      regra({ id: 'b', ordem: 2, valor: 'x', categoria_chave: 'aluguer' }),
    ]
    expect(aplicarRegras(regras, { descricao: 'xpto' })?.categoria_chave).toBe('venda')
  })
  it('ignora regras inativas', () => {
    const r = aplicarRegras([regra({ ativo: false, valor: 'x', categoria_chave: 'venda' })], { descricao: 'x' })
    expect(r).toBeNull()
  })
  it('operador "comeca" e "igual"', () => {
    expect(aplicarRegras([regra({ campo: 'documento_ref', operador: 'comeca', valor: 'fat', categoria_chave: 'venda' })], { documento_ref: 'FAT2026/1' })?.categoria_chave).toBe('venda')
    expect(aplicarRegras([regra({ campo: 'documento_ref', operador: 'igual', valor: 'FT1', categoria_chave: 'venda' })], { documento_ref: 'FT1' })?.categoria_chave).toBe('venda')
  })
  it('devolve null quando nada casa', () => {
    expect(aplicarRegras([regra({ valor: 'zzz' })], { descricao: 'abc' })).toBeNull()
  })
})

describe('resolverValor', () => {
  it('cat:<chave> → categoria de topo', () => {
    expect(resolverValor('cat:venda', SUBS, CATS)).toEqual({ categoria_chave: 'venda', subcategoria_id: null })
  })
  it('sub:<id> → chave do pai + id da subcategoria', () => {
    expect(resolverValor('sub:s1', SUBS, CATS)).toEqual({ categoria_chave: 'aluguer', subcategoria_id: 's1' })
  })
  it('vazio → sem categoria', () => {
    expect(resolverValor('', SUBS, CATS)).toEqual({ categoria_chave: null, subcategoria_id: null })
  })
})

describe('valorDe', () => {
  it('subcategoria tem prioridade sobre a categoria', () => {
    expect(valorDe({ categoria: 'aluguer', subcategoria_id: 's1' })).toBe('sub:s1')
    expect(valorDe({ categoria: 'venda', subcategoria_id: null })).toBe('cat:venda')
    expect(valorDe({ categoria: null, subcategoria_id: null })).toBe('')
  })
})

describe('opcoesPlanas / nomeCategoriaDe', () => {
  it('lista categorias de topo com subcategorias indentadas', () => {
    const ops = opcoesPlanas(CATS, SUBS)
    expect(ops.map((o) => o.value)).toEqual(['cat:aluguer', 'sub:s1', 'cat:venda', 'sub:s2'])
  })
  it('nome legível "Categoria › Subcategoria"', () => {
    const cm = mapaCategorias(CATS), sm = mapaSubcategorias(SUBS)
    expect(nomeCategoriaDe({ categoria: 'aluguer', subcategoria_id: 's1' }, cm, sm)).toBe('Aluguer › Mensal')
    expect(nomeCategoriaDe({ categoria: 'venda', subcategoria_id: null }, cm, sm)).toBe('Venda')
    expect(nomeCategoriaDe({ categoria: null, subcategoria_id: null }, cm, sm)).toBe('')
  })
})
