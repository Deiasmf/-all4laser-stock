// Tipos e construtor de documento da Packing List. O construtor devolve a
// especificação (DocumentoPdf) que o motor partilhado (fichaPdf) transforma em
// PDF com a identidade All4laser. Sem dependências do jsPDF nem do Supabase.
import type { DocumentoPdf } from '@/lib/fichaPdf'
import { DADOS_EMPRESA } from '@/lib/docTemplate'

export type IdiomaPacking = 'pt' | 'en'

export type PackingList = {
  id: string
  numero: string | null
  request_id: string | null
  idioma: IdiomaPacking
  destinatario_nome: string | null
  destinatario_morada: string | null
  referencia: string | null
  tracking_awb: string | null
  observacoes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PackingListLinha = {
  id: string
  packing_list_id: string
  ordem: number
  descricao: string | null
  ext_c: number | null; ext_l: number | null; ext_a: number | null
  peso_liquido: number | null
  peso_bruto: number | null
  quantidade: number
}

export type PackingListPdf = {
  id: string
  packing_list_id: string
  versao: number
  pdf_path: string
  created_at: string
}

export type LinhaPackingInput = {
  descricao: string | null
  ext_c: number | null; ext_l: number | null; ext_a: number | null
  peso_liquido: number | null
  peso_bruto: number | null
  quantidade: number
}

function n2(n: number) { return Math.round(n * 100) / 100 }
function n3(n: number) { return Math.round(n * 1000) / 1000 }
function dim(n: number | null): string { return n == null ? '' : String(Number.isInteger(n) ? n : n2(n)) }

export type TotaisPacking = { volumes: number; pesoLiquido: number; pesoBruto: number; volumeM3: number }
export function totaisPacking(
  linhas: Pick<PackingListLinha, 'ext_c' | 'ext_l' | 'ext_a' | 'peso_liquido' | 'peso_bruto' | 'quantidade'>[],
): TotaisPacking {
  let volumes = 0, pl = 0, pb = 0, m3 = 0
  for (const l of linhas) {
    const q = Number(l.quantidade) || 0
    volumes += q
    if (l.peso_liquido != null) pl += q * Number(l.peso_liquido)
    if (l.peso_bruto != null) pb += q * Number(l.peso_bruto)
    if (l.ext_c != null && l.ext_l != null && l.ext_a != null) {
      m3 += q * (Number(l.ext_c) / 100) * (Number(l.ext_l) / 100) * (Number(l.ext_a) / 100)
    }
  }
  return { volumes, pesoLiquido: n2(pl), pesoBruto: n2(pb), volumeM3: n3(m3) }
}

type LinhaDoc = Pick<PackingListLinha, 'descricao' | 'ext_c' | 'ext_l' | 'ext_a' | 'peso_liquido' | 'peso_bruto' | 'quantidade'>

// Constrói a especificação do PDF (cabeçalho/rodapé All4laser são automáticos).
export function documentoPackingList(pl: PackingList, linhas: LinhaDoc[], versao: number): DocumentoPdf {
  const en = pl.idioma === 'en'
  const t = totaisPacking(linhas)
  const dataStr = new Date().toLocaleDateString(en ? 'en-GB' : 'pt-PT')

  const colunas = en
    ? ['Vol', 'Description of contents', 'Ext. dim. (L×W×H cm)', 'Net wt (kg)', 'Gross wt (kg)', 'Qty']
    : ['Vol', 'Descrição do conteúdo', 'Dim. ext. (C×L×A cm)', 'Peso líq. (kg)', 'Peso bruto (kg)', 'Qtd']

  const tabelaLinhas = linhas.map((l, i) => [
    i + 1,
    l.descricao || '—',
    [l.ext_c, l.ext_l, l.ext_a].every((x) => x == null) ? '—' : `${dim(l.ext_c)}×${dim(l.ext_l)}×${dim(l.ext_a)}`,
    l.peso_liquido != null ? String(n2(l.peso_liquido)) : '—',
    l.peso_bruto != null ? String(n2(l.peso_bruto)) : '—',
    l.quantidade,
  ])

  return {
    titulo: en ? 'Packing List' : 'Lista de Embalagem',
    subtitulo: `${pl.numero ?? ''}  ·  ${dataStr}  ·  ${en ? 'Version' : 'Versão'} ${versao}`,
    seccoes: [
      { titulo: en ? 'Shipper' : 'Expedidor', linhas: [
        { rotulo: en ? 'Company' : 'Empresa', valor: DADOS_EMPRESA.nome },
        { rotulo: en ? 'Address' : 'Morada', valor: DADOS_EMPRESA.morada ?? '' },
        { rotulo: en ? 'VAT' : 'NIF', valor: DADOS_EMPRESA.nif ?? '' },
      ] },
      { titulo: en ? 'Consignee' : 'Destinatário', linhas: [
        { rotulo: en ? 'Name' : 'Nome', valor: pl.destinatario_nome ?? '' },
        { rotulo: en ? 'Address' : 'Morada', valor: pl.destinatario_morada ?? '' },
      ] },
      { titulo: en ? 'References' : 'Referências', linhas: [
        { rotulo: en ? 'Order / EP' : 'Encomenda / EP', valor: pl.referencia ?? '' },
        { rotulo: 'Tracking / AWB', valor: pl.tracking_awb ?? '' },
      ] },
      { titulo: en ? 'Totals' : 'Totais', linhas: [
        { rotulo: en ? 'Packages' : 'Volumes', valor: t.volumes },
        { rotulo: en ? 'Net weight' : 'Peso líquido', valor: `${t.pesoLiquido} kg` },
        { rotulo: en ? 'Gross weight' : 'Peso bruto', valor: `${t.pesoBruto} kg` },
        { rotulo: 'Volume', valor: `${t.volumeM3} m³` },
      ] },
    ],
    tabelas: [{ colunas, larguras: [0.5, 2.4, 1.5, 1, 1, 0.6], linhas: tabelaLinhas }],
    nota: pl.observacoes ?? undefined,
  }
}
