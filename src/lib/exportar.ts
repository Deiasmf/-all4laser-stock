// Exportação de listas para ficheiro Excel (.xlsx nativo).
// Usa a biblioteca write-excel-file (gera o xlsx no browser e faz o download).

import writeXlsxFile from 'write-excel-file/browser'

export type ColunaExport<T> = {
  cabecalho: string
  valor: (item: T) => string | number | boolean | null | undefined
}

export async function exportarExcel<T>(nomeFicheiro: string, colunas: ColunaExport<T>[], linhas: T[]) {
  const columns = colunas.map((c) => ({
    header: { value: c.cabecalho, fontWeight: 'bold' },
    cell: (item: T) => {
      const v = c.valor(item)
      return { type: String, value: v === null || v === undefined || v === '' ? null : String(v) }
    },
    width: 22,
  }))
  const data = new Date().toISOString().slice(0, 10)
  // A tipagem por overload da lib é complexa; contornamos com um cast controlado.
  const escrever = writeXlsxFile as unknown as (
    linhas: unknown,
    opcoes: { columns: unknown }
  ) => { toFile: (fileName: string) => Promise<void> }
  await escrever(linhas, { columns }).toFile(`${nomeFicheiro}-${data}.xlsx`)
}
