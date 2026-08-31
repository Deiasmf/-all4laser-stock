'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  obterProduto, guardarProduto, CONDICOES, DISPONIBILIDADES, disponibilidadeInfo,
  type EquipamentoProduto,
} from '@/lib/fichaProduto'

// Dados de produto do equipamento (condição, disponibilidade e especificações).
// Vive numa tabela à parte editável pela equipa (staff); mostra ver + editar.
const VAZIO: EquipamentoProduto = {
  equipamento_id: '', condicao: null, condicao_descricao: null, disponibilidade: 'disponivel',
  voltagem: null, frequencia: null, dimensoes: null, peso_kg: null, software_versao: null,
}

export default function DadosProdutoEquip({ equipamentoId, onChange }: { equipamentoId: string; onChange?: () => void }) {
  const { perfil } = useAuth()
  const podeEditar = !!perfil?.id
  const [prod, setProd] = useState<EquipamentoProduto>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [aEditar, setAEditar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [f, setF] = useState<EquipamentoProduto>(VAZIO)

  const carregar = useCallback(async () => {
    const p = await obterProduto(equipamentoId)
    setProd(p ?? { ...VAZIO, equipamento_id: equipamentoId })
    setCarregando(false)
  }, [equipamentoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  function abrirEdicao() { setF(prod); setErro(null); setAEditar(true) }

  async function guardar() {
    setAGuardar(true); setErro(null)
    const { error } = await guardarProduto(equipamentoId, {
      condicao: f.condicao || null,
      condicao_descricao: f.condicao_descricao?.trim() || null,
      disponibilidade: f.disponibilidade || 'disponivel',
      voltagem: f.voltagem?.trim() || null,
      frequencia: f.frequencia?.trim() || null,
      dimensoes: f.dimensoes?.trim() || null,
      peso_kg: f.peso_kg != null && !Number.isNaN(f.peso_kg) ? f.peso_kg : null,
      software_versao: f.software_versao?.trim() || null,
    })
    setAGuardar(false)
    if (error) { setErro('Erro a guardar: ' + error.message); return }
    setAEditar(false)
    await carregar(); onChange?.()
  }

  const disp = disponibilidadeInfo(prod.disponibilidade)

  return (
    <div style={s.seccao}>
      <div style={s.cab}>
        <span style={s.titulo}>Dados de produto</span>
        {podeEditar && !aEditar && <button style={s.btnSec} onClick={abrirEdicao}>✏️ Editar</button>}
      </div>

      {carregando ? <p style={s.muted}>A carregar…</p> : aEditar ? (
        <div style={s.form}>
          {erro && <div style={s.erro}>{erro}</div>}
          <div style={s.grelha}>
            <label style={s.campo}><span style={s.rot}>Condição</span>
              <select style={s.input} value={f.condicao ?? ''} onChange={(e) => setF({ ...f, condicao: e.target.value || null })}>
                <option value="">—</option>
                {CONDICOES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={s.campo}><span style={s.rot}>Disponibilidade</span>
              <select style={s.input} value={f.disponibilidade} onChange={(e) => setF({ ...f, disponibilidade: e.target.value })}>
                {DISPONIBILIDADES.map((d) => <option key={d.valor} value={d.valor}>{d.label}</option>)}
              </select>
            </label>
          </div>
          <label style={s.campo}><span style={s.rot}>Descrição do estado <span style={s.opc}>(para o cliente)</span></span>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }} value={f.condicao_descricao ?? ''} onChange={(e) => setF({ ...f, condicao_descricao: e.target.value })} />
          </label>
          <div style={s.grelha}>
            <label style={s.campo}><span style={s.rot}>Voltagem</span>
              <input style={s.input} value={f.voltagem ?? ''} onChange={(e) => setF({ ...f, voltagem: e.target.value })} placeholder="ex.: 230V" />
            </label>
            <label style={s.campo}><span style={s.rot}>Frequência</span>
              <input style={s.input} value={f.frequencia ?? ''} onChange={(e) => setF({ ...f, frequencia: e.target.value })} placeholder="ex.: 50/60 Hz" />
            </label>
            <label style={s.campo}><span style={s.rot}>Dimensões</span>
              <input style={s.input} value={f.dimensoes ?? ''} onChange={(e) => setF({ ...f, dimensoes: e.target.value })} placeholder="ex.: 120×60×100 cm" />
            </label>
            <label style={s.campo}><span style={s.rot}>Peso (kg)</span>
              <input type="number" step="0.1" style={s.input} value={f.peso_kg ?? ''} onChange={(e) => setF({ ...f, peso_kg: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <label style={s.campo}><span style={s.rot}>Software / versão</span>
              <input style={s.input} value={f.software_versao ?? ''} onChange={(e) => setF({ ...f, software_versao: e.target.value })} />
            </label>
          </div>
          <div style={s.acoes}>
            <button style={s.btnSec} onClick={() => setAEditar(false)}>Cancelar</button>
            <button style={s.btnPrim} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar…' : 'Guardar'}</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={s.badges}>
            <span style={{ ...s.badge, color: disp.cor, background: disp.bg }}>{disp.label}</span>
            {prod.condicao && <span style={s.badgeCond}>{prod.condicao}</span>}
          </div>
          {prod.condicao_descricao && <p style={s.descricao}>{prod.condicao_descricao}</p>}
          <div style={s.linhas}>
            <Campo r="Voltagem" v={prod.voltagem} />
            <Campo r="Frequência" v={prod.frequencia} />
            <Campo r="Dimensões" v={prod.dimensoes} />
            <Campo r="Peso" v={prod.peso_kg != null ? `${prod.peso_kg} kg` : null} />
            <Campo r="Software" v={prod.software_versao} />
          </div>
        </div>
      )}
    </div>
  )
}

function Campo({ r, v }: { r: string; v: string | null }) {
  return (
    <div style={s.linha}>
      <span style={s.linhaRot}>{r}</span>
      <span style={s.linhaVal}>{v ? v : <span style={s.emFalta}>em falta</span>}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  muted: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  badges: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  badge: { padding: '3px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700 },
  badgeCond: { padding: '3px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: '#1E40AF', background: '#DBEAFE' },
  descricao: { fontSize: 14, whiteSpace: 'pre-wrap', margin: '4px 0 10px' },
  linhas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 16px' },
  linha: { display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid var(--border)', padding: '5px 0', fontSize: 13.5 },
  linhaRot: { color: 'var(--muted)' },
  linhaVal: { fontWeight: 600, textAlign: 'right' },
  emFalta: { color: '#B45309', fontWeight: 400, fontStyle: 'italic' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
}
