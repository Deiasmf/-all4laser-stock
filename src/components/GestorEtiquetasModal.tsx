'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  listarEtiquetas, criarEtiqueta, atualizarEtiqueta, arquivarEtiqueta, type Etiqueta,
} from '@/lib/minhaArea'

// Gestão das etiquetas (todo o staff): renomear, mudar cor, arquivar e criar.
// "Apagar" arquiva (ativo=false) para não partir tarefas que a usem.
const CORES = ['#6366F1', '#16A34A', '#DC2626', '#CA8A04', '#2563EB', '#DB2777', '#7C3AED', '#EA580C', '#374151', '#0891B2']

export default function GestorEtiquetasModal({ onFechar }: { onFechar: () => void }) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [novaCor, setNovaCor] = useState(CORES[0])

  const carregar = useCallback(async () => { setEtiquetas(await listarEtiquetas()) }, [])
  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  async function renomear(e: Etiqueta, nome: string) {
    if (nome.trim() && nome !== e.nome) { await atualizarEtiqueta(e.id, { nome: nome.trim() }); await carregar() }
  }
  async function mudarCor(e: Etiqueta, cor: string) { await atualizarEtiqueta(e.id, { cor }); await carregar() }
  async function arquivar(e: Etiqueta) { await arquivarEtiqueta(e.id); await carregar() }
  async function criar() {
    const nome = novoNome.trim()
    if (!nome) return
    await criarEtiqueta(nome, novaCor)
    setNovoNome(''); await carregar()
  }

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.cab}>
          <h2 style={s.titulo}>Etiquetas</h2>
          <button onClick={onFechar} style={s.fechar} aria-label="Fechar">✕</button>
        </div>
        <p style={s.ajuda}>Usa etiquetas para agrupar por tema (ex.: Financeiro, Marketing, Legal). São partilhadas por toda a equipa.</p>

        <div style={s.lista}>
          {etiquetas.map((e) => (
            <div key={e.id} style={s.linha}>
              <input type="color" value={e.cor} onChange={(ev) => mudarCor(e, ev.target.value)} style={s.corInput} title="Cor" />
              <input defaultValue={e.nome} onBlur={(ev) => renomear(e, ev.target.value)} style={s.nomeInput} />
              <button style={s.arquivar} onClick={() => arquivar(e)} title="Arquivar etiqueta">Arquivar</button>
            </div>
          ))}
          {etiquetas.length === 0 && <p style={s.vazio}>Ainda não há etiquetas.</p>}
        </div>

        <div style={s.criarBloco}>
          <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nova etiqueta"
            style={s.nomeInput} onKeyDown={(e) => { if (e.key === 'Enter') criar() }} />
          <div style={s.cores}>
            {CORES.map((cor) => (
              <button key={cor} onClick={() => setNovaCor(cor)} aria-label={cor}
                style={{ ...s.corBtn, background: cor, outline: novaCor === cor ? '2px solid #111' : 'none' }} />
            ))}
          </div>
          <button style={s.criarBtn} disabled={!novoNome.trim()} onClick={criar}>+ Criar</button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 110 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460, margin: 'auto' },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  titulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  ajuda: { color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' },
  lista: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
  linha: { display: 'flex', gap: 8, alignItems: 'center' },
  corInput: { width: 34, height: 32, border: '1px solid var(--border)', borderRadius: 8, padding: 2, cursor: 'pointer', background: '#fff' },
  nomeInput: { flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 14, boxSizing: 'border-box' },
  arquivar: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', color: 'var(--muted)', whiteSpace: 'nowrap' },
  vazio: { color: 'var(--muted)', fontSize: 13.5 },
  criarBloco: { display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 14, flexWrap: 'wrap' },
  cores: { display: 'flex', gap: 5 },
  corBtn: { width: 20, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer' },
  criarBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
}
