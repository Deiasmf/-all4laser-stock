import { supabase } from './supabase'
import type { Fornecedor, FornecedorInput } from '@/types/compras'

// Ficha de fornecedor vazia (defaults úteis).
export function fornecedorVazio(): FornecedorInput {
  return {
    nome: '', nif: null, morada: null, codigo_postal: null, localidade: null, pais: 'Portugal',
    telefone: null, telemovel: null, email: null, email_reparacoes: null,
    pessoa_contacto: null, iban: null, notas: null, ativo: true,
  }
}

// Converte uma ficha da BD para o formulário de edição.
export function fornecedorParaInput(f: Fornecedor): FornecedorInput {
  return {
    nome: f.nome, nif: f.nif, morada: f.morada, codigo_postal: f.codigo_postal,
    localidade: f.localidade, pais: f.pais ?? 'Portugal', telefone: f.telefone, telemovel: f.telemovel,
    email: f.email, email_reparacoes: f.email_reparacoes, pessoa_contacto: f.pessoa_contacto,
    iban: f.iban, notas: f.notas, ativo: f.ativo,
  }
}

export async function listarFornecedores(soAtivos = false): Promise<Fornecedor[]> {
  let q = supabase.from('fornecedores').select('*').order('nome')
  if (soAtivos) q = q.eq('ativo', true)
  const { data } = await q
  return (data as Fornecedor[]) ?? []
}

export async function obterFornecedor(id: string) {
  return supabase.from('fornecedores').select('*').eq('id', id).single()
}

// Pesquisa por nome ou NIF (para a listagem).
export async function pesquisarFornecedores(termo: string): Promise<Fornecedor[]> {
  const t = termo.trim()
  let q = supabase.from('fornecedores').select('*').order('nome')
  if (t) q = q.or(`nome.ilike.%${t}%,nif.ilike.%${t}%`)
  const { data } = await q
  return (data as Fornecedor[]) ?? []
}

function limpar(input: FornecedorInput) {
  const t = (v: string | null) => (v && v.trim() !== '' ? v.trim() : null)
  return {
    nome: input.nome.trim(),
    nif: t(input.nif), morada: t(input.morada), codigo_postal: t(input.codigo_postal),
    localidade: t(input.localidade), pais: t(input.pais), telefone: t(input.telefone),
    telemovel: t(input.telemovel), email: t(input.email), email_reparacoes: t(input.email_reparacoes),
    pessoa_contacto: t(input.pessoa_contacto), iban: t(input.iban), notas: t(input.notas),
    ativo: input.ativo,
  }
}

export async function criarFornecedor(input: FornecedorInput) {
  return supabase.from('fornecedores').insert(limpar(input)).select().single()
}

export async function atualizarFornecedor(id: string, input: FornecedorInput) {
  return supabase.from('fornecedores').update(limpar(input)).eq('id', id).select().single()
}

export async function alternarAtivoFornecedor(id: string, ativo: boolean) {
  return supabase.from('fornecedores').update({ ativo }).eq('id', id)
}

export async function eliminarFornecedor(id: string) {
  return supabase.from('fornecedores').delete().eq('id', id)
}

// Morada de uma só linha, para pré-preencher a carta de porte.
export function moradaFornecedor(f: Fornecedor): string {
  return [f.morada, f.codigo_postal, f.localidade, f.pais].filter(Boolean).join(', ')
}
