'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { listarFaltasDoEquipamento, adicionarPecaFalta, type FaltaInput } from '@/lib/pecasFalta'
import PecaAutocomplete from '@/components/PecaAutocomplete'
import { ESTADO_FALTA_CONFIG, type PecaFalta } from '@/types/compras'

// Secção "Peças em Falta" para a ficha de um equipamento.
export default function EquipamentoPecasFalta({
  equipamentoId, equipamentoSn, equipamentoModelo,
}: {
  equipamentoId: string
  equipamentoSn: string | null
  equipamentoModelo: string | null
}) {
  const { session, perfil } = useAuth()
  const [lista, setLista] = useState<PecaFalta[]>([])
  const [modal, setModal] = useState(false)
  const [nome, setNome] = useState(''); const [pecaId, setPecaId] = useState<string | null>(null)
  const [qtd, setQtd] = useState('1'); const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)

  async function carregar() { setLista(await listarFaltasDoEquipamento(equipamentoId)) }
  useEffect(() => {
    // setState corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentoId])

  async function guardar() {
    if (!nome.trim()) return
    setAGuardar(true)
    const input: FaltaInput = {
      equipamento_id: equipamentoId, equipamento_sn: equipamentoSn, equipamento_modelo: equipamentoModelo,
      peca_id: pecaId, peca_nome: nome.trim(), quantidade_necessaria: Math.max(1, Number(qtd) || 1),
      notas: notas.trim() || null, criado_por: session?.user.id ?? null, criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
    }
    await adicionarPecaFalta(input)
    setAGuardar(false); setModal(false); setNome(''); setPecaId(null); setQtd('1'); setNotas('')
    carregar()
  }

  return (
    <div style={s.seccao}>
      <div style={s.topo}>
        <span style={s.titulo}>Peças em Falta {lista.length > 0 && `(${lista.length})`}</span>
        <button onClick={() => setModal(true)} style={s.btn}>+ Adicionar</button>
      </div>
      {lista.length === 0 ? (
        <p style={s.vazio}>Sem peças em falta registadas.</p>
      ) : (
        <div>
          {lista.map((p) => {
            const c = ESTADO_FALTA_CONFIG[p.estado]
            return (
              <div key={p.id} style={s.linha}>
                <span style={{ flex: 1 }}>{p.peca_nome}{p.quantidade_necessaria > 1 ? ` ×${p.quantidade_necessaria}` : ''}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, borderRadius: 999, padding: '2px 8px' }}>{c.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(false)} style={s.backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={s.painel}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)', marginBottom: 12 }}>Adicionar peça em falta</h3>
            <label style={s.lbl}>Peça</label>
            <PecaAutocomplete valor={nome} onTexto={(v) => { setNome(v); setPecaId(null) }} onEscolher={(p) => { setNome(p.nome); setPecaId(p.id) }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <div style={{ width: 90 }}>
                <label style={s.lbl}>Quantidade</label>
                <input value={qtd} onChange={(e) => setQtd(e.target.value)} type="number" min={1} style={s.input} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.lbl}>Notas</label>
                <input value={notas} onChange={(e) => setNotas(e.target.value)} style={s.input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setModal(false)} style={s.btnGhost}>Cancelar</button>
              <button onClick={guardar} disabled={aGuardar || !nome.trim()} style={s.btn}>{aGuardar ? 'A guardar...' : 'Adicionar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  vazio: { fontSize: 13, color: 'var(--muted)' },
  linha: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 14, color: 'var(--foreground)' },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnGhost: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  painel: { background: 'var(--surface)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 460 },
  lbl: { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit' },
}
