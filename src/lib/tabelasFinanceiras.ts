import writeXlsxFile from 'write-excel-file/browser'
import { supabase } from './supabase'
import { gerarPdfDocumento } from './fichaPdf'
import type { TabelaFinanceira, ColunaTabela, LinhaTabela } from '@/types/tabelaFinanceira'
import { estruturaInicial } from '@/types/tabelaFinanceira'

export const BUCKET_TABELAS = 'financeiro-tabelas-docs'

export type UserRef = { id: string | null; nome: string | null }

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listarTabelas(): Promise<TabelaFinanceira[]> {
  const { data } = await supabase
    .from('financeiro_tabelas')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data as TabelaFinanceira[]) ?? []
}

export async function obterTabela(id: string) {
  return supabase.from('financeiro_tabelas').select('*').eq('id', id).single()
}

export async function criarTabela(nome: string, criadoPor: UserRef) {
  const { colunas, linhas } = estruturaInicial()
  return supabase
    .from('financeiro_tabelas')
    .insert({
      nome: nome.trim() || 'Nova tabela',
      colunas,
      linhas,
      criado_por: criadoPor.id,
      criado_por_nome: criadoPor.nome,
    })
    .select()
    .single()
}

export async function atualizarTabela(id: string, patch: Partial<TabelaFinanceira>) {
  return supabase.from('financeiro_tabelas').update(patch).eq('id', id).select().single()
}

export async function eliminarTabela(id: string) {
  return supabase.from('financeiro_tabelas').delete().eq('id', id)
}

// ─── Anexo (bucket privado → signed URL) ──────────────────────────────────────

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

export async function anexarFicheiroTabela(
  id: string,
  ficheiro: File
): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${id}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_TABELAS).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }
  const { error: erroBd } = await supabase
    .from('financeiro_tabelas')
    .update({ ficheiro_caminho: caminho, ficheiro_nome: ficheiro.name, ficheiro_url: null })
    .eq('id', id)
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}

export async function removerFicheiroTabela(id: string, caminho: string | null) {
  if (caminho) await supabase.storage.from(BUCKET_TABELAS).remove([caminho])
  return supabase
    .from('financeiro_tabelas')
    .update({ ficheiro_caminho: null, ficheiro_nome: null, ficheiro_url: null })
    .eq('id', id)
}

export async function urlAssinadoTabela(caminho: string, segundos = 120): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_TABELAS).createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}

// ─── Exportação ───────────────────────────────────────────────────────────────

// Constrói as colunas para write-excel-file a partir das colunas da tabela.
function colunasExcel(colunas: ColunaTabela[]) {
  return colunas.map((col) => ({
    header: { value: col.nome || col.id, fontWeight: 'bold' as const },
    cell: (linha: LinhaTabela) => ({ type: String, value: linha[col.id] ?? null }),
    width: 24,
  }))
}

// Gera o Blob .xlsx da tabela (usado no download e no envio por email).
export async function gerarBlobExcel(tabela: TabelaFinanceira): Promise<Blob> {
  const escrever = writeXlsxFile as unknown as (
    linhas: unknown,
    opcoes: { columns: unknown }
  ) => { toBlob: () => Promise<Blob>; toFile: (nome: string) => Promise<void> }
  return escrever(tabela.linhas, { columns: colunasExcel(tabela.colunas) }).toBlob()
}

export async function descarregarExcel(tabela: TabelaFinanceira) {
  const escrever = writeXlsxFile as unknown as (
    linhas: unknown,
    opcoes: { columns: unknown }
  ) => { toBlob: () => Promise<Blob>; toFile: (nome: string) => Promise<void> }
  const data = new Date().toISOString().slice(0, 10)
  await escrever(tabela.linhas, { columns: colunasExcel(tabela.colunas) })
    .toFile(`${sanitizar(tabela.nome)}-${data}.xlsx`)
}

// Gera o Blob PDF da tabela reutilizando o gerador de documentos.
export async function gerarBlobPdf(tabela: TabelaFinanceira): Promise<Blob> {
  return gerarPdfDocumento({
    titulo: tabela.nome || 'Tabela',
    tabelas: [
      {
        colunas: tabela.colunas.map((c) => c.nome || c.id),
        linhas: tabela.linhas.map((l) => tabela.colunas.map((c) => l[c.id] ?? '')),
      },
    ],
  })
}

export function sanitizar(nome: string): string {
  return (nome || 'tabela').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'tabela'
}

export async function blobParaBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
