'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  obterTabela, atualizarTabela, eliminarTabela,
  anexarFicheiroTabela, removerFicheiroTabela, urlAssinadoTabela,
  descarregarExcel, gerarBlobExcel, gerarBlobPdf, blobParaBase64, sanitizar,
} from '@/lib/tabelasFinanceiras'
import {
  novoIdColuna, type TabelaFinanceira, type ColunaTabela, type LinhaTabela,
} from '@/types/tabelaFinanceira'

export default function EditorTabelaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [nome, setNome] = useState('')
  const [colunas, setColunas] = useState<ColunaTabela[]>([])
  const [linhas, setLinhas] = useState<LinhaTabela[]>([])
  const [notas, setNotas] = useState('')
  const [anexoCaminho, setAnexoCaminho] = useState<string | null>(null)
  const [anexoNome, setAnexoNome] = useState<string | null>(null)

  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [sujo, setSujo] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Envio por email
  const [envioAberto, setEnvioAberto] = useState(false)
  const [emailPara, setEmailPara] = useState('')
  const [emailAssunto, setEmailAssunto] = useState('')
  const [emailMensagem, setEmailMensagem] = useState('')
  const [emailFormato, setEmailFormato] = useState<'excel' | 'pdf'>('excel')

  const recarregar = useCallback(async () => {
    const { data } = await obterTabela(id)
    const t = data as TabelaFinanceira | null
    if (t) {
      setNome(t.nome)
      setColunas(t.colunas ?? [])
      setLinhas(t.linhas ?? [])
      setNotas(t.notas ?? '')
      setAnexoCaminho(t.ficheiro_caminho)
      setAnexoNome(t.ficheiro_nome)
    }
    setCarregando(false)
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  // Objeto "tabela" a partir do estado atual (para exportar/enviar/anexar).
  function tabelaAtual(): TabelaFinanceira {
    return {
      id, nome, colunas, linhas, notas: notas || null,
      ficheiro_url: null, ficheiro_caminho: anexoCaminho, ficheiro_nome: anexoNome,
      criado_por: null, criado_por_nome: null, created_at: '', updated_at: '',
    }
  }

  // ── Edição da grelha ──
  function marcarSujo() { setSujo(true); setMsg(null) }

  function editarNomeColuna(colId: string, valor: string) {
    setColunas((cs) => cs.map((c) => (c.id === colId ? { ...c, nome: valor } : c)))
    marcarSujo()
  }
  function editarCelula(linhaIdx: number, colId: string, valor: string) {
    setLinhas((ls) => ls.map((l, i) => (i === linhaIdx ? { ...l, [colId]: valor } : l)))
    marcarSujo()
  }
  function adicionarColuna() {
    setColunas((cs) => [...cs, { id: novoIdColuna(cs), nome: `Coluna ${cs.length + 1}` }])
    marcarSujo()
  }
  function removerColuna(colId: string) {
    if (colunas.length <= 1) { setMsg('A tabela tem de ter pelo menos uma coluna.'); return }
    setColunas((cs) => cs.filter((c) => c.id !== colId))
    setLinhas((ls) => ls.map((l) => {
      const resto: LinhaTabela = {}
      for (const k of Object.keys(l)) if (k !== colId) resto[k] = l[k]
      return resto
    }))
    marcarSujo()
  }
  function adicionarLinha() {
    setLinhas((ls) => [...ls, {}])
    marcarSujo()
  }
  function removerLinha(idx: number) {
    setLinhas((ls) => ls.filter((_, i) => i !== idx))
    marcarSujo()
  }

  async function guardar() {
    setATrabalhar(true); setMsg(null)
    const { error } = await atualizarTabela(id, { nome: nome.trim() || 'Nova tabela', colunas, linhas, notas: notas.trim() || null })
    setATrabalhar(false)
    if (error) { setMsg('Não foi possível guardar: ' + error.message); return }
    setSujo(false)
    setMsg('✅ Guardado.')
  }

  async function apagar() {
    if (!confirm(`Apagar a tabela "${nome}"? Esta ação não pode ser revertida.`)) return
    setATrabalhar(true)
    const { error } = await eliminarTabela(id)
    if (error) { setMsg('Não foi possível apagar: ' + error.message); setATrabalhar(false); return }
    router.push('/financeiro/tabelas')
  }

  // ── Exportação ──
  async function exportarExcel() {
    setATrabalhar(true); setMsg(null)
    try { await descarregarExcel(tabelaAtual()) } catch { setMsg('Erro ao exportar Excel.') }
    setATrabalhar(false)
  }
  async function exportarPdf() {
    setATrabalhar(true); setMsg(null)
    try {
      const blob = await gerarBlobPdf(tabelaAtual())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${sanitizar(nome)}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { setMsg('Erro ao exportar PDF.') }
    setATrabalhar(false)
  }

  // ── Anexo ──
  async function anexar(file: File | undefined) {
    if (!file) return
    setATrabalhar(true); setMsg(null)
    const r = await anexarFicheiroTabela(id, file)
    if (!r.ok) setMsg('Erro ao anexar: ' + (r.motivo ?? ''))
    await recarregar()
    setATrabalhar(false)
  }
  async function verAnexo() {
    if (!anexoCaminho) return
    const url = await urlAssinadoTabela(anexoCaminho)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else setMsg('Não foi possível abrir o anexo.')
  }
  async function removerAnexo() {
    if (!anexoCaminho) return
    if (!confirm('Remover o anexo desta tabela?')) return
    setATrabalhar(true); setMsg(null)
    await removerFicheiroTabela(id, anexoCaminho)
    await recarregar()
    setATrabalhar(false)
  }

  // ── Envio por email ──
  async function enviarEmail() {
    if (!emailPara.trim()) { setMsg('Indica o email do destinatário.'); return }
    setATrabalhar(true); setMsg(null)
    try {
      const t = tabelaAtual()
      const blob = emailFormato === 'excel' ? await gerarBlobExcel(t) : await gerarBlobPdf(t)
      const contentBase64 = await blobParaBase64(blob)
      const ext = emailFormato === 'excel' ? 'xlsx' : 'pdf'
      const type = emailFormato === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf'
      const r = await fetch('/api/financeiro/tabelas/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para: emailPara.trim(),
          assunto: emailAssunto.trim() || `${nome} — All4laser`,
          mensagem: emailMensagem,
          filename: `${sanitizar(nome)}.${ext}`,
          contentBase64,
          type,
        }),
      })
      const j = await r.json()
      if (j.ok) { setMsg('✅ Tabela enviada por email.'); setEnvioAberto(false) }
      else setMsg('⚠️ ' + (j.erro ?? 'Não foi possível enviar.'))
    } catch {
      setMsg('⚠️ Erro ao preparar/enviar o email.')
    }
    setATrabalhar(false)
  }

  if (carregando) return <main style={c.page}><p style={c.muted}>A carregar...</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <input
          value={nome}
          onChange={(e) => { setNome(e.target.value); marcarSujo() }}
          placeholder="Nome da tabela"
          style={c.nomeInput}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={sujo ? c.btnPrimario : c.btnGuardado} onClick={guardar} disabled={aTrabalhar || !sujo}>
            {sujo ? 'Guardar' : 'Guardado ✓'}
          </button>
          <Link href="/financeiro/tabelas" style={c.voltar}>← Tabelas</Link>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      {/* Barra de ações */}
      <div style={c.acoes}>
        <button style={c.btnAcao} onClick={adicionarColuna} disabled={aTrabalhar}>+ Coluna</button>
        <button style={c.btnAcao} onClick={adicionarLinha} disabled={aTrabalhar}>+ Linha</button>
        <span style={{ flex: 1 }} />
        <button style={c.btnAcao} onClick={exportarExcel} disabled={aTrabalhar}>📊 Excel</button>
        <button style={c.btnAcao} onClick={exportarPdf} disabled={aTrabalhar}>📄 PDF</button>
        <button style={c.btnAcao} onClick={() => { setEnvioAberto((v) => !v); setMsg(null) }} disabled={aTrabalhar}>✉️ Enviar</button>
        <button style={c.btnApagar} onClick={apagar} disabled={aTrabalhar}>🗑 Apagar</button>
      </div>

      {/* Envio por email */}
      {envioAberto && (
        <section style={c.emailBox}>
          <div style={c.emailGrelha}>
            <label style={c.campo}>
              <span style={c.rotulo}>Para (email)</span>
              <input type="email" value={emailPara} onChange={(e) => setEmailPara(e.target.value)} placeholder="destinatario@exemplo.com" style={c.input} />
            </label>
            <label style={c.campo}>
              <span style={c.rotulo}>Assunto</span>
              <input value={emailAssunto} onChange={(e) => setEmailAssunto(e.target.value)} placeholder={`${nome} — All4laser`} style={c.input} />
            </label>
            <label style={c.campo}>
              <span style={c.rotulo}>Formato</span>
              <select value={emailFormato} onChange={(e) => setEmailFormato(e.target.value as 'excel' | 'pdf')} style={c.input}>
                <option value="excel">Excel (.xlsx)</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
          </div>
          <label style={{ ...c.campo, marginTop: 10 }}>
            <span style={c.rotulo}>Mensagem (opcional)</span>
            <textarea value={emailMensagem} onChange={(e) => setEmailMensagem(e.target.value)} style={{ ...c.input, minHeight: 60, resize: 'vertical' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button style={c.btnGhost} onClick={() => setEnvioAberto(false)} disabled={aTrabalhar}>Cancelar</button>
            <button style={c.btnPrimario} onClick={enviarEmail} disabled={aTrabalhar}>Enviar email</button>
          </div>
        </section>
      )}

      {/* Grelha editável */}
      <div style={c.tabelaWrap}>
        <table style={c.tabela}>
          <thead>
            <tr>
              <th style={c.thIdx}>#</th>
              {colunas.map((col) => (
                <th key={col.id} style={c.th}>
                  <div style={c.thConteudo}>
                    <input
                      value={col.nome}
                      onChange={(e) => editarNomeColuna(col.id, e.target.value)}
                      placeholder="Coluna"
                      style={c.thInput}
                    />
                    <button style={c.colX} onClick={() => removerColuna(col.id)} title="Remover coluna">✕</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, idx) => (
              <tr key={idx}>
                <td style={c.tdIdx}>
                  <div style={c.tdIdxConteudo}>
                    <span>{idx + 1}</span>
                    <button style={c.rowX} onClick={() => removerLinha(idx)} title="Remover linha">✕</button>
                  </div>
                </td>
                {colunas.map((col) => (
                  <td key={col.id} style={c.td}>
                    <input
                      value={linha[col.id] ?? ''}
                      onChange={(e) => editarCelula(idx, col.id, e.target.value)}
                      style={c.celula}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={colunas.length + 1} style={c.semLinhas}>Sem linhas — clica em “+ Linha”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Notas + anexo */}
      <section style={c.card}>
        <label style={c.campo}>
          <span style={c.rotulo}>Notas</span>
          <textarea
            value={notas}
            onChange={(e) => { setNotas(e.target.value); marcarSujo() }}
            placeholder="Notas sobre esta tabela"
            style={{ ...c.input, minHeight: 56, resize: 'vertical' }}
          />
        </label>

        <div style={{ marginTop: 12 }}>
          <span style={c.rotulo}>Anexo</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
            {anexoCaminho ? (
              <>
                <button style={c.btnAcao} onClick={verAnexo} disabled={aTrabalhar}>Ver {anexoNome ? `“${anexoNome}”` : 'anexo'} ↗</button>
                <button style={c.btnGhost} onClick={removerAnexo} disabled={aTrabalhar}>Remover anexo</button>
              </>
            ) : (
              <label style={c.uploadLabel}>
                Anexar ficheiro/imagem
                <input type="file" style={{ display: 'none' }} onChange={(e) => anexar(e.target.files?.[0])} disabled={aTrabalhar} />
              </label>
            )}
          </div>
        </div>
      </section>

      <p style={c.dica}>As alterações à grelha e notas guardam ao clicar em <strong>Guardar</strong>. Exportar/enviar usa o conteúdo atual.</p>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  nomeInput: { fontSize: 20, fontWeight: 700, color: 'var(--primary)', border: '1px solid transparent', borderRadius: 8, padding: '6px 8px', background: 'transparent', minWidth: 220, flex: 1 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  acoes: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  btnAcao: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13.5, whiteSpace: 'nowrap' },
  btnApagar: { background: 'transparent', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13.5, whiteSpace: 'nowrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnGuardado: { background: '#E5E7EB', color: '#374151', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'default' },
  btnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  emailBox: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 12 },
  emailGrelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, font: 'inherit', boxSizing: 'border-box', width: '100%' },
  tabelaWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: '#fff' },
  tabela: { borderCollapse: 'collapse', width: '100%', minWidth: 400 },
  thIdx: { width: 44, background: '#f7f7fb', borderBottom: '1px solid var(--border)', borderRight: '1px solid #eee', padding: 0 },
  th: { background: '#f7f7fb', borderBottom: '1px solid var(--border)', borderRight: '1px solid #eee', padding: 0, minWidth: 140 },
  thConteudo: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px' },
  thInput: { flex: 1, minWidth: 60, border: 'none', background: 'transparent', fontWeight: 700, fontSize: 13.5, color: 'var(--primary)', padding: 4 },
  colX: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, opacity: 0.6 },
  tdIdx: { width: 44, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5, borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', padding: 0 },
  tdIdxConteudo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' },
  rowX: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, opacity: 0.5 },
  td: { borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', padding: 0 },
  celula: { width: '100%', border: 'none', background: 'transparent', padding: '8px 8px', fontSize: 14, font: 'inherit', boxSizing: 'border-box' },
  semLinhas: { textAlign: 'center', color: 'var(--muted)', padding: 16, fontSize: 14 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 14 },
  uploadLabel: { display: 'inline-block', background: '#fff', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  muted: { color: 'var(--muted)', fontSize: 14 },
  dica: { color: 'var(--muted)', fontSize: 12.5, marginTop: 14, textAlign: 'center' },
}
