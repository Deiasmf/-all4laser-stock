'use client'

import { useState } from 'react'
import ComentariosTarefa from './ComentariosTarefa'
import HistoricoTarefa from './HistoricoTarefa'
import AnexosTarefa from './AnexosTarefa'
import SeletorEstado from './SeletorEstado'
import SubtarefasTarefa from './SubtarefasTarefa'
import NotasTarefa from './NotasTarefa'
import EtiquetasTarefa from './EtiquetasTarefa'
import {
  atualizarTarefa, mudarMeuEstado, notificarConclusaoTarefa, estadoInfo, arquivarMinha,
  PRIORIDADES, type MinhaTarefa, type EstadoInfo, type Etiqueta, type Prioridade,
} from '@/lib/minhaArea'

// Detalhe completo de uma tarefa (abre ao clicar). Reúne edição dos campos,
// estado, etiquetas, subtarefas, notas, comentários, histórico e anexos.
// onMudou recarrega a lista do ecrã (para refletir estado/etiquetas/progresso).
export default function TarefaDetalheModal({
  tarefa, estados, etiquetasDisponiveis, autor, uid, onMudou, onFechar, onApagar,
}: {
  tarefa: MinhaTarefa
  estados: EstadoInfo[]
  etiquetasDisponiveis: Etiqueta[]
  autor: { id: string | null; nome: string | null }
  uid: string
  onMudou: () => void | Promise<void>
  onFechar: () => void
  onApagar: (t: MinhaTarefa) => void | Promise<void>
}) {
  const [titulo, setTitulo] = useState(tarefa.titulo)
  const [descricao, setDescricao] = useState(tarefa.descricao ?? '')
  const [seccao, setSeccao] = useState<'comentarios' | 'historico' | 'anexos' | null>(null)

  async function guardarTitulo() {
    const t = titulo.trim()
    if (t && t !== tarefa.titulo) { await atualizarTarefa(tarefa.id, { titulo: t }); await onMudou() }
  }
  async function guardarDescricao() {
    const d = descricao.trim() || null
    if (d !== (tarefa.descricao ?? null)) { await atualizarTarefa(tarefa.id, { descricao: d }); await onMudou() }
  }
  async function mudarPrioridade(p: Prioridade) { await atualizarTarefa(tarefa.id, { prioridade: p }); await onMudou() }
  async function mudarPrazo(d: string) { await atualizarTarefa(tarefa.id, { data_limite: d || null }); await onMudou() }
  async function mudarEstado(estado: string, aguarda: string | null) {
    const concluido = estadoInfo(estado, estados).is_concluido
    await mudarMeuEstado(tarefa.assigneeId, estado, concluido, aguarda)
    if (concluido) await notificarConclusaoTarefa(tarefa.id)
    await onMudou()
  }
  async function arquivar() {
    await arquivarMinha(tarefa.assigneeId, !tarefa.arquivadaEm)
    await onMudou(); onFechar()
  }

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.cab}>
          <input style={s.titulo} value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={guardarTitulo} placeholder="Título da tarefa" />
          <button onClick={onFechar} style={s.fechar} aria-label="Fechar">✕</button>
        </div>

        <div style={s.linhaCampos}>
          <label style={s.campo}><span style={s.rot}>Estado</span>
            <SeletorEstado estados={estados} valor={tarefa.meuEstado} aguardaOQue={tarefa.meuAguardaOQue} onMudar={mudarEstado} />
          </label>
          <label style={s.campo}><span style={s.rot}>Prioridade</span>
            <select style={s.input} value={tarefa.prioridade} onChange={(e) => mudarPrioridade(e.target.value as Prioridade)}>
              {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
            </select>
          </label>
          <label style={s.campo}><span style={s.rot}>Data limite</span>
            <input style={s.input} type="date" value={(tarefa.data_limite ?? '').slice(0, 10)} onChange={(e) => mudarPrazo(e.target.value)} />
          </label>
        </div>

        <div style={s.bloco}>
          <span style={s.rot}>Etiquetas</span>
          <EtiquetasTarefa taskId={tarefa.id} etiquetas={tarefa.etiquetas} disponiveis={etiquetasDisponiveis} onMudou={onMudou} />
        </div>

        <div style={s.bloco}>
          <span style={s.rot}>Descrição</span>
          <textarea style={{ ...s.input, minHeight: 56, resize: 'vertical' }} value={descricao}
            onChange={(e) => setDescricao(e.target.value)} onBlur={guardarDescricao} placeholder="Detalhes (opcional)" />
        </div>

        <div style={s.bloco}>
          <SubtarefasTarefa taskId={tarefa.id} autorId={uid} onMudou={onMudou} />
        </div>

        <div style={s.bloco}>
          <span style={s.rot}>Anotações</span>
          <NotasTarefa taskId={tarefa.id} inicial={tarefa.notas} onGuardado={onMudou} />
        </div>

        <div style={s.abas}>
          <button style={{ ...s.aba, ...(seccao === 'comentarios' ? s.abaAtiva : {}) }} onClick={() => setSeccao((v) => v === 'comentarios' ? null : 'comentarios')}>💬 Comentários</button>
          <button style={{ ...s.aba, ...(seccao === 'historico' ? s.abaAtiva : {}) }} onClick={() => setSeccao((v) => v === 'historico' ? null : 'historico')}>🕘 Histórico</button>
          <button style={{ ...s.aba, ...(seccao === 'anexos' ? s.abaAtiva : {}) }} onClick={() => setSeccao((v) => v === 'anexos' ? null : 'anexos')}>📎 Anexos</button>
        </div>
        {seccao === 'comentarios' && <ComentariosTarefa taskId={tarefa.id} autor={autor} />}
        {seccao === 'historico' && <HistoricoTarefa taskId={tarefa.id} />}
        {seccao === 'anexos' && <AnexosTarefa taskId={tarefa.id} autorId={uid} />}

        <div style={s.rodape}>
          <button style={s.btnGhost} onClick={arquivar}>
            {tarefa.arquivadaEm ? '↺ Restaurar' : '📥 Arquivar'}
          </button>
          <button style={s.btnApagar} onClick={() => onApagar(tarefa)}>🗑 Apagar</button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 640, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  cab: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  titulo: { flex: 1, fontSize: 18, fontWeight: 700, color: 'var(--foreground)', border: '1px solid transparent', borderRadius: 8, padding: '6px 8px', font: 'inherit', boxSizing: 'border-box' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  linhaCampos: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end' },
  campo: { display: 'flex', flexDirection: 'column', gap: 5 },
  bloco: { display: 'flex', flexDirection: 'column', gap: 6 },
  rot: { fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  abas: { display: 'flex', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 12, flexWrap: 'wrap' },
  aba: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  abaAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  rodape: { display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 },
  btnGhost: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  btnApagar: { background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
}
