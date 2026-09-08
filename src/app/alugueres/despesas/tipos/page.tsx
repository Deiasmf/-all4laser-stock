'use client'

// Gestão dos tipos de despesa (admin/financeiro): aprovar os criados pelos
// colaboradores, renomear e fundir duplicados (ex.: "Gasóleo" → "Combustível").
import { useCallback, useEffect, useState } from 'react'
import GuardaFinanceiro from '@/components/despesas/GuardaFinanceiro'
import NavGestao from '@/components/despesas/NavGestao'
import { listarTiposGestao, aprovarTipo, renomearTipo, fundirTipo } from '@/lib/despesas'
import type { DespesaTipo } from '@/types/despesa'

export default function TiposPage() {
  return <GuardaFinanceiro><Conteudo /></GuardaFinanceiro>
}

function Conteudo() {
  const [tipos, setTipos] = useState<DespesaTipo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editar, setEditar] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [fundir, setFundir] = useState<DespesaTipo | null>(null)
  const [destino, setDestino] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setTipos(await listarTiposGestao()); setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function aprovar(id: string) { await aprovarTipo(id); await carregar() }

  async function guardarNome(id: string) {
    if (!nomeEdit.trim()) return
    const { error } = await renomearTipo(id, nomeEdit)
    if (error) { setErro('Erro ao renomear: ' + error.message); return }
    setEditar(null); setNomeEdit(''); await carregar()
  }

  async function confirmarFundir() {
    if (!fundir || !destino) return
    const { error } = await fundirTipo(fundir.id, destino)
    if (error) { setErro('Erro ao fundir: ' + error.message); return }
    setFundir(null); setDestino(''); await carregar()
  }

  const aprovados = tipos.filter((t) => t.estado === 'aprovado')

  return (
    <main style={c.page}>
      <NavGestao />
      <h1 style={c.titulo}>Tipos de despesa</h1>
      <p style={c.muted}>Aprova os tipos criados pelos colaboradores, renomeia ou funde duplicados.</p>
      {erro && <div style={c.erroBar}>{erro}</div>}

      {carregando ? <p style={c.muted}>A carregar…</p> : (
        <div style={c.lista}>
          {tipos.map((t) => (
            <div key={t.id} style={c.linha}>
              {editar === t.id ? (
                <>
                  <input style={c.input} value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardarNome(t.id) }} autoFocus />
                  <button style={c.btnMini} onClick={() => guardarNome(t.id)}>Guardar</button>
                  <button style={c.btnMini} onClick={() => setEditar(null)}>Cancelar</button>
                </>
              ) : (
                <>
                  <span style={c.nome}>{t.nome}</span>
                  {t.estado === 'pendente'
                    ? <span style={{ ...c.tag, ...c.tagPend }}>por aprovar{t.criado_por_nome ? ` · ${t.criado_por_nome}` : ''}</span>
                    : <span style={{ ...c.tag, ...c.tagOk }}>aprovado</span>}
                  <div style={c.acoes}>
                    {t.estado === 'pendente' && <button style={c.btnMini} onClick={() => aprovar(t.id)}>Aprovar</button>}
                    <button style={c.btnMini} onClick={() => { setEditar(t.id); setNomeEdit(t.nome) }}>Renomear</button>
                    <button style={c.btnMini} onClick={() => { setFundir(t); setDestino('') }}>Fundir</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {fundir && (
        <div style={c.overlay} onClick={() => setFundir(null)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={c.modalTopo}><strong>Fundir «{fundir.nome}»</strong>
              <button style={c.fechar} onClick={() => setFundir(null)} aria-label="Fechar">×</button></div>
            <p style={c.muted}>As despesas de «{fundir.nome}» passam a contar no tipo escolhido. Os meses já fechados mantêm o histórico.</p>
            <select style={c.input} value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">— escolher tipo de destino —</option>
              {aprovados.filter((t) => t.id !== fundir.id).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <div style={c.acoesModal}>
              <button style={c.btnSec} onClick={() => setFundir(null)}>Cancelar</button>
              <button style={c.btnPri} onClick={confirmarFundir} disabled={!destino}>Fundir</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 700, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '0 0 4px' },
  muted: { color: 'var(--muted)', fontSize: 14, marginBottom: 12 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  linha: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', flexWrap: 'wrap' },
  nome: { fontWeight: 700, fontSize: 14.5 },
  tag: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 9px' },
  tagPend: { color: '#92400E', background: '#FEF3C7' },
  tagOk: { color: '#065F46', background: '#D1FAE5' },
  acoes: { display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' },
  input: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', flex: 1, minWidth: 160 },
  btnMini: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, zIndex: 80 },
  modal: { background: '#fff', borderRadius: 14, padding: 16, width: 'min(460px, 100%)', marginTop: 40, display: 'flex', flexDirection: 'column', gap: 10 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fechar: { background: 'transparent', border: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  acoesModal: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  erroBar: { background: '#FEF2F2', color: '#B91C1C', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 },
}
