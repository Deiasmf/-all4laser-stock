'use client'

// Editor controlado do pedido de cotação: campos do pedido + linhas de carga
// com totais automáticos. Usado no ecrã "Novo pedido" e no detalhe.

import { useMemo } from 'react'
import type { PedidoInput, LinhaInput } from '@/lib/freight'
import type { StandardBox } from '@/types/freight'
import { TIPOS_TRANSPORTE, totaisCarga } from '@/types/freight'

export type EstadoEditor = { pedido: PedidoInput; linhas: LinhaInput[] }

export function linhaVazia(): LinhaInput {
  return { box_id: null, descricao: null, ext_c: 0, ext_l: 0, ext_a: 0, quantidade: 1, peso_volume: null }
}

export default function PedidoEditor({
  value, onChange, boxes,
}: {
  value: EstadoEditor
  onChange: (v: EstadoEditor) => void
  boxes: StandardBox[]
}) {
  const { pedido, linhas } = value
  const setPedido = (patch: Partial<PedidoInput>) => onChange({ ...value, pedido: { ...pedido, ...patch } })
  const setLinhas = (ls: LinhaInput[]) => onChange({ ...value, linhas: ls })

  const totais = useMemo(() => totaisCarga(linhas), [linhas])

  function alterarLinha(i: number, patch: Partial<LinhaInput>) {
    setLinhas(linhas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function escolherBox(i: number, boxId: string) {
    if (!boxId) { alterarLinha(i, { box_id: null }); return }
    const b = boxes.find((x) => x.id === boxId)
    if (!b) return
    alterarLinha(i, {
      box_id: b.id, descricao: b.nome,
      ext_c: b.ext_c, ext_l: b.ext_l, ext_a: b.ext_a,
      peso_volume: b.peso_tipico ?? linhas[i].peso_volume,
    })
  }
  const nBox = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <div style={s.wrap}>
      {/* ── Transporte + idioma ─────────────────────────────────────────── */}
      <div style={s.grelha}>
        <label style={s.campo}><span style={s.rot}>Tipo de transporte</span>
          <select style={s.input} value={pedido.tipo_transporte} onChange={(e) => setPedido({ tipo_transporte: e.target.value as PedidoInput['tipo_transporte'] })}>
            {TIPOS_TRANSPORTE.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        </label>
        <label style={s.campo}><span style={s.rot}>Idioma do email</span>
          <select style={s.input} value={pedido.idioma} onChange={(e) => setPedido({ idioma: e.target.value as PedidoInput['idioma'] })}>
            <option value="pt">Português</option>
            <option value="en">Inglês</option>
          </select>
        </label>
      </div>

      {/* ── Origem ──────────────────────────────────────────────────────── */}
      <fieldset style={s.bloco}>
        <legend style={s.legend}>Origem (recolha)</legend>
        <div style={s.grelha}>
          <label style={s.campo}><span style={s.rot}>Nome</span>
            <input style={s.input} value={pedido.origem_nome ?? ''} onChange={(e) => setPedido({ origem_nome: e.target.value || null })} />
          </label>
          <label style={s.campo}><span style={s.rot}>Morada</span>
            <input style={s.input} value={pedido.origem_morada ?? ''} onChange={(e) => setPedido({ origem_morada: e.target.value || null })} />
          </label>
          <label style={s.campo}><span style={s.rot}>Código postal</span>
            <input style={s.input} value={pedido.origem_cp ?? ''} onChange={(e) => setPedido({ origem_cp: e.target.value || null })} />
          </label>
          <label style={s.campo}><span style={s.rot}>Localidade</span>
            <input style={s.input} value={pedido.origem_localidade ?? ''} onChange={(e) => setPedido({ origem_localidade: e.target.value || null })} />
          </label>
          <label style={s.campo}><span style={s.rot}>País</span>
            <input style={s.input} value={pedido.origem_pais ?? ''} onChange={(e) => setPedido({ origem_pais: e.target.value || null })} />
          </label>
        </div>
      </fieldset>

      {/* ── Destino ─────────────────────────────────────────────────────── */}
      <fieldset style={s.bloco}>
        <legend style={s.legend}>Destino</legend>
        <div style={s.grelha}>
          <label style={s.campo}><span style={s.rot}>País *</span>
            <input style={s.input} value={pedido.destino_pais ?? ''} placeholder="Ex.: França" onChange={(e) => setPedido({ destino_pais: e.target.value || null })} />
          </label>
          <label style={s.campo}><span style={s.rot}>Cidade / código postal</span>
            <input style={s.input} value={pedido.destino_cidade_cp ?? ''} onChange={(e) => setPedido({ destino_cidade_cp: e.target.value || null })} />
          </label>
          <label style={{ ...s.campo, gridColumn: '1 / -1' }}><span style={s.rot}>Morada (opcional)</span>
            <input style={s.input} value={pedido.destino_morada ?? ''} onChange={(e) => setPedido({ destino_morada: e.target.value || null })} />
          </label>
        </div>
      </fieldset>

      {/* ── Carga ───────────────────────────────────────────────────────── */}
      <fieldset style={s.bloco}>
        <legend style={s.legend}>Carga</legend>
        <div style={s.tabelaWrap}>
          <table style={s.tabela}>
            <thead>
              <tr>
                <th style={s.th}>Caixa do catálogo</th>
                <th style={s.th}>Descrição</th>
                <th style={s.th}>C (cm)</th>
                <th style={s.th}>L (cm)</th>
                <th style={s.th}>A (cm)</th>
                <th style={s.th}>Qtd</th>
                <th style={s.th}>Peso/vol (kg)</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  <td style={s.td}>
                    <select style={s.inputMini} value={l.box_id ?? ''} onChange={(e) => escolherBox(i, e.target.value)}>
                      <option value="">— manual —</option>
                      {boxes.map((b) => <option key={b.id} value={b.id}>{b.nome} ({b.ext_c}×{b.ext_l}×{b.ext_a})</option>)}
                    </select>
                  </td>
                  <td style={s.td}><input style={s.inputMini} value={l.descricao ?? ''} onChange={(e) => alterarLinha(i, { descricao: e.target.value || null })} /></td>
                  <td style={s.td}><input style={s.inputNum} type="number" value={l.ext_c || ''} onChange={(e) => alterarLinha(i, { ext_c: nBox(e.target.value), box_id: null })} /></td>
                  <td style={s.td}><input style={s.inputNum} type="number" value={l.ext_l || ''} onChange={(e) => alterarLinha(i, { ext_l: nBox(e.target.value), box_id: null })} /></td>
                  <td style={s.td}><input style={s.inputNum} type="number" value={l.ext_a || ''} onChange={(e) => alterarLinha(i, { ext_a: nBox(e.target.value), box_id: null })} /></td>
                  <td style={s.td}><input style={s.inputNum} type="number" min={1} value={l.quantidade || ''} onChange={(e) => alterarLinha(i, { quantidade: Math.max(1, Math.floor(nBox(e.target.value))) })} /></td>
                  <td style={s.td}><input style={s.inputNum} type="number" value={l.peso_volume ?? ''} onChange={(e) => alterarLinha(i, { peso_volume: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                  <td style={s.td}><button type="button" style={s.btnMini} title="Remover" onClick={() => setLinhas(linhas.filter((_, idx) => idx !== i))}>🗑️</button></td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr><td style={s.tdVazio} colSpan={8}>Sem linhas de carga.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button type="button" style={s.btnAdd} onClick={() => setLinhas([...linhas, linhaVazia()])}>+ Adicionar linha</button>

        <div style={s.totais}>
          <span style={s.pill}>Volumes: <strong>{totais.volumes}</strong></span>
          <span style={s.pill}>Peso total: <strong>{totais.pesoTotal} kg</strong>{totais.pesoIncompleto ? ' ⚠️' : ''}</span>
          <span style={s.pill}>Volume total: <strong>{totais.volumeM3} m³</strong></span>
          {totais.pesoIncompleto && <span style={s.aviso}>⚠️ Há volumes sem peso preenchido.</span>}
        </div>
      </fieldset>

      {/* ── Datas ───────────────────────────────────────────────────────── */}
      <fieldset style={s.bloco}>
        <legend style={s.legend}>Datas</legend>
        <div style={s.grelha}>
          <label style={s.campo}><span style={s.rot}>Data pretendida de recolha</span>
            <input style={s.input} type="date" value={pedido.data_recolha ?? ''} onChange={(e) => setPedido({ data_recolha: e.target.value || null })} />
          </label>
          <label style={s.campo}><span style={s.rot}>Flexibilidade</span>
            <input style={s.input} value={pedido.flexibilidade ?? ''} placeholder="Ex.: flexível +/- 2 dias" onChange={(e) => setPedido({ flexibilidade: e.target.value || null })} />
          </label>
        </div>
      </fieldset>

      {/* ── Extras ──────────────────────────────────────────────────────── */}
      <fieldset style={s.bloco}>
        <legend style={s.legend}>Extras</legend>
        <div style={s.checks}>
          <label style={s.check}><input type="checkbox" checked={pedido.extra_paletizar} onChange={(e) => setPedido({ extra_paletizar: e.target.checked })} /> Mercadoria a paletizar</label>
          <label style={s.check}><input type="checkbox" checked={pedido.extra_seguro} onChange={(e) => setPedido({ extra_seguro: e.target.checked })} /> Seguro</label>
          <label style={s.check}><input type="checkbox" checked={pedido.extra_plataforma} onChange={(e) => setPedido({ extra_plataforma: e.target.checked })} /> Entrega com plataforma elevatória</label>
          <label style={s.check}><input type="checkbox" checked={pedido.extra_urgente} onChange={(e) => setPedido({ extra_urgente: e.target.checked })} /> Urgente</label>
        </div>
      </fieldset>

      <label style={s.campo}><span style={s.rot}>Observações</span>
        <textarea style={{ ...s.input, minHeight: 60 }} value={pedido.observacoes ?? ''} onChange={(e) => setPedido({ observacoes: e.target.value || null })} />
      </label>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  bloco: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, margin: 0 },
  legend: { fontSize: 12, fontWeight: 700, color: 'var(--muted)', padding: '0 6px' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  inputMini: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', width: '100%', minWidth: 120 },
  inputNum: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', width: 72 },
  tabelaWrap: { overflowX: 'auto' },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px', borderBottom: '1px solid #eee', color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' },
  td: { padding: '4px 6px', verticalAlign: 'top' },
  tdVazio: { padding: 12, textAlign: 'center', color: 'var(--muted)' },
  btnMini: { border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', padding: '4px 8px' },
  btnAdd: { alignSelf: 'flex-start', marginTop: 8, padding: '6px 12px', border: '1px dashed #9ca3af', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600 },
  totais: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' },
  pill: { fontSize: 13, background: '#F3F4F6', color: '#374151', borderRadius: 999, padding: '4px 12px' },
  aviso: { fontSize: 12, color: '#B45309', fontWeight: 600 },
  checks: { display: 'flex', flexDirection: 'column', gap: 8 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
}
