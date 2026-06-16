import type { FolhaObra } from '@/types/folhaObra'
import { ESTADO_FOLHA_CONFIG } from '@/types/folhaObra'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function formatarDataHora(d: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleString('pt-PT')
}

function formatarEuro(v: number | null) {
  if (v === null || v === undefined) return null
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// Carrega um URL de imagem como data URL (evita canvas "tainted" por CORS).
async function urlParaDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader()
      fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Gera o PDF de uma folha de obra e devolve um Blob.
export async function gerarPdfFolha(folha: FolhaObra): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const M = 40 // margem
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const larguraConteudo = larguraPagina - M * 2
  const NAVY: [number, number, number] = [13, 11, 43]
  const CINZA: [number, number, number] = [110, 116, 128]
  let y = M

  function garantirEspaco(h: number) {
    if (y + h > alturaPagina - M) {
      doc.addPage()
      y = M
    }
  }

  function titulo() {
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('All4laser', M, y)
    doc.setFontSize(13)
    doc.setTextColor(...CINZA)
    doc.text('Folha de Obra', larguraPagina - M, y, { align: 'right' })
    y += 18
    doc.setTextColor(...NAVY)
    doc.setFontSize(15)
    doc.text(folha.numero, M, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...CINZA)
    doc.text(ESTADO_FOLHA_CONFIG[folha.estado].label, larguraPagina - M, y, { align: 'right' })
    y += 12
    doc.setDrawColor(220, 222, 226)
    doc.line(M, y, larguraPagina - M, y)
    y += 18
  }

  function seccao(nome: string) {
    garantirEspaco(28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...NAVY)
    doc.text(nome.toUpperCase(), M, y)
    y += 14
  }

  function linha(rotulo: string, valor: string | null) {
    if (valor === null || valor === undefined || valor === '') return
    const rotuloLarg = 130
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const linhas = doc.splitTextToSize(valor, larguraConteudo - rotuloLarg)
    garantirEspaco(linhas.length * 13 + 2)
    doc.setTextColor(...CINZA)
    doc.text(rotulo, M, y)
    doc.setTextColor(...NAVY)
    doc.text(linhas, M + rotuloLarg, y)
    y += linhas.length * 13 + 3
  }

  function blocoTexto(rotulo: string, valor: string | null) {
    if (!valor) return
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const linhas = doc.splitTextToSize(valor, larguraConteudo)
    garantirEspaco(13 + linhas.length * 13 + 6)
    doc.setTextColor(...CINZA)
    doc.text(rotulo, M, y)
    y += 13
    doc.setTextColor(...NAVY)
    doc.text(linhas, M, y)
    y += linhas.length * 13 + 6
  }

  // ── Conteúdo ──
  titulo()

  seccao('Identificação')
  linha('Data da intervenção', formatarData(folha.data_intervencao))
  linha('Tipo de serviço', folha.tipo_servico)
  linha('Técnico', folha.tecnico_nome)

  seccao('Cliente')
  linha('Nome', folha.cliente_nome)
  linha('País', folha.cliente_pais)

  seccao('Equipamento')
  linha('Modelo', folha.equipamento_modelo)
  linha('Serial number', folha.equipamento_sn)
  linha('Ano', folha.equipamento_ano)

  seccao('Intervenção')
  linha('Códigos de erro', folha.codigos_erro)
  blocoTexto('Problema observado', folha.problema_observado)
  blocoTexto('Trabalho realizado', folha.trabalho_realizado)

  if (folha.valor_cabeca_alex != null || folha.valor_transmissao_alex != null) {
    seccao('Valores Candela Alex/Yag')
    linha('Valor da cabeça', formatarEuro(folha.valor_cabeca_alex))
    linha('Valor da transmissão', formatarEuro(folha.valor_transmissao_alex))
  }

  if (folha.material_utilizado || folha.observacoes) {
    seccao('Material e observações')
    blocoTexto('Material utilizado', folha.material_utilizado)
    blocoTexto('Observações', folha.observacoes)
  }

  // ── Assinaturas ──
  const sigTecnico = folha.assinatura_tecnico_url ? await urlParaDataUrl(folha.assinatura_tecnico_url) : null
  const sigCliente = folha.assinatura_cliente_url ? await urlParaDataUrl(folha.assinatura_cliente_url) : null

  seccao('Assinaturas')
  const caixaLarg = (larguraConteudo - 20) / 2
  const caixaAlt = 90
  garantirEspaco(caixaAlt + 28)
  const topo = y
  const colunas = [
    { x: M, url: sigTecnico, rotulo: 'Técnico', nome: folha.tecnico_nome, at: folha.assinatura_tecnico_at },
    { x: M + caixaLarg + 20, url: sigCliente, rotulo: 'Cliente', nome: folha.cliente_nome, at: folha.assinatura_cliente_at },
  ]
  for (const col of colunas) {
    doc.setDrawColor(220, 222, 226)
    doc.rect(col.x, topo, caixaLarg, caixaAlt)
    if (col.url) {
      try {
        doc.addImage(col.url, 'PNG', col.x + 6, topo + 6, caixaLarg - 12, caixaAlt - 12)
      } catch {
        // imagem inválida — deixa a caixa vazia
      }
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...NAVY)
    doc.text(`${col.rotulo}${col.nome ? ` — ${col.nome}` : ''}`, col.x, topo + caixaAlt + 14)
    if (col.at) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...CINZA)
      doc.text(`Assinado em ${formatarDataHora(col.at)}`, col.x, topo + caixaAlt + 26)
    }
  }
  y = topo + caixaAlt + 36

  // ── Rodapé ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-PT')} · All4laser`,
    M,
    alturaPagina - 24
  )

  return doc.output('blob')
}
