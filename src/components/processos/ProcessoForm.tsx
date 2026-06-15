'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ListaEditavel from './ListaEditavel'
import {
  criarProcesso,
  atualizarProcesso,
  gravarSubItens,
  eliminarProcesso,
} from '@/lib/processos'
import { STATUS_CONFIG, STATUS_OPCOES, type Area, type StatusProcesso } from '@/types/processo'

export type ValoresProcesso = {
  areaId: string
  nome: string
  descricao: string
  responsavel: string
  status: StatusProcesso
  notas: string
  steps: string[]
  inputs: string[]
  outputs: string[]
  kpis: string[]
  ferramentas: string[]
}

export default function ProcessoForm({
  areas,
  processoId,
  inicial,
}: {
  areas: Area[]
  processoId?: string
  inicial: ValoresProcesso
}) {
  const router = useRouter()
  const [v, setV] = useState<ValoresProcesso>(inicial)
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const set = <K extends keyof ValoresProcesso>(k: K, val: ValoresProcesso[K]) =>
    setV((prev) => ({ ...prev, [k]: val }))

  async function gravar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!v.areaId) return setErro('Escolhe uma área.')
    if (!v.nome.trim()) return setErro('O nome é obrigatório.')
    if (!v.descricao.trim()) return setErro('A descrição é obrigatória.')
    if (!v.responsavel.trim()) return setErro('O responsável é obrigatório.')

    setAGravar(true)
    const campos = {
      area_id: v.areaId,
      nome: v.nome.trim(),
      descricao: v.descricao.trim(),
      responsavel: v.responsavel.trim(),
      status: v.status,
      notas: v.notas.trim() || null,
    }

    let id = processoId
    if (id) {
      const { error } = await atualizarProcesso(id, campos)
      if (error) { setAGravar(false); return setErro('Erro ao gravar: ' + error.message) }
    } else {
      const { data, error } = await criarProcesso({ ...campos, ordem: 999 })
      if (error || !data) { setAGravar(false); return setErro('Erro ao criar: ' + (error?.message ?? '')) }
      id = (data as { id: string }).id
    }

    await gravarSubItens(id!, {
      steps: v.steps.map((acao, i) => ({ ordem: i + 1, acao })),
      inputs: v.inputs,
      outputs: v.outputs,
      kpis: v.kpis,
      ferramentas: v.ferramentas,
    })

    const areaSlug = areas.find((a) => a.id === v.areaId)?.slug
    router.push(`/processos/${areaSlug}/${id}`)
  }

  async function eliminar() {
    if (!processoId) return
    if (!confirm('Eliminar este processo? Esta ação não pode ser anulada.')) return
    setAGravar(true)
    const { error } = await eliminarProcesso(processoId)
    if (error) { setAGravar(false); return setErro('Erro ao eliminar: ' + error.message) }
    const areaSlug = areas.find((a) => a.id === v.areaId)?.slug
    router.push(`/processos/${areaSlug ?? ''}`)
  }

  return (
    <form onSubmit={gravar}>
      {erro && <div style={msgErro}>{erro}</div>}

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Área</label>
        <select value={v.areaId} onChange={(e) => set('areaId', e.target.value)} style={input}>
          <option value="">— Escolher área —</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.icone} {a.nome}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Nome do processo</label>
        <input value={v.nome} onChange={(e) => set('nome', e.target.value)} style={input} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Descrição</label>
        <textarea value={v.descricao} onChange={(e) => set('descricao', e.target.value)} style={{ ...input, minHeight: 70, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div>
          <label style={lbl}>Responsável</label>
          <input value={v.responsavel} onChange={(e) => set('responsavel', e.target.value)} style={input} />
        </div>
        <div>
          <label style={lbl}>Estado</label>
          <select value={v.status} onChange={(e) => set('status', e.target.value as StatusProcesso)} style={input}>
            {STATUS_OPCOES.map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      <hr style={hr} />
      <ListaEditavel titulo="Fluxo do processo (passos)" itens={v.steps} onChange={(n) => set('steps', n)} placeholder="Descrição do passo" numerada />
      <ListaEditavel titulo="Inputs" itens={v.inputs} onChange={(n) => set('inputs', n)} placeholder="Input" />
      <ListaEditavel titulo="Outputs" itens={v.outputs} onChange={(n) => set('outputs', n)} placeholder="Output" />
      <ListaEditavel titulo="KPIs" itens={v.kpis} onChange={(n) => set('kpis', n)} placeholder="KPI" />
      <ListaEditavel titulo="Ferramentas" itens={v.ferramentas} onChange={(n) => set('ferramentas', n)} placeholder="Ferramenta" />

      <div style={{ marginBottom: 18 }}>
        <label style={lbl}>Nota (opcional)</label>
        <textarea value={v.notas} onChange={(e) => set('notas', e.target.value)} style={{ ...input, minHeight: 60, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" disabled={aGravar} style={btnPrimario}>
          {aGravar ? 'A gravar...' : 'Gravar'}
        </button>
        <button type="button" onClick={() => router.back()} style={btnSecundario}>Cancelar</button>
        {processoId && (
          <button type="button" onClick={eliminar} disabled={aGravar} style={btnEliminar}>Eliminar</button>
        )}
      </div>
    </form>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
  borderRadius: 8, background: '#fff', color: 'var(--foreground)',
}
const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 18px' }
const msgErro: React.CSSProperties = {
  background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8,
  padding: '10px 14px', marginBottom: 16, fontSize: 14, fontWeight: 600,
}
const btnPrimario: React.CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 20px', fontWeight: 700, cursor: 'pointer',
}
const btnSecundario: React.CSSProperties = {
  background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: 'pointer',
}
const btnEliminar: React.CSSProperties = {
  marginLeft: 'auto', background: 'var(--surface)', color: 'var(--danger)',
  border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: 'pointer',
}
