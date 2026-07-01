// Exportação de listas para ficheiro que o Excel abre diretamente.
// Gera CSV com BOM UTF-8 (acentos corretos) e separador ";" (regional PT),
// que o Excel abre em colunas ao fazer duplo clique — sem dependências extra.

export type ColunaExport<T> = {
  cabecalho: string
  valor: (item: T) => string | number | boolean | null | undefined
}

function celula(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Escapa aspas, separador e quebras de linha
  if (s.includes('"') || s.includes(';') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function exportarCSV<T>(nomeFicheiro: string, colunas: ColunaExport<T>[], linhas: T[]) {
  const cabecalho = colunas.map((c) => celula(c.cabecalho)).join(';')
  const corpo = linhas
    .map((linha) => colunas.map((c) => celula(c.valor(linha))).join(';'))
    .join('\r\n')
  const conteudo = '﻿' + cabecalho + '\r\n' + corpo // BOM para o Excel detetar UTF-8

  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const data = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `${nomeFicheiro}-${data}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
