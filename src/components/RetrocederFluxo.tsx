'use client'

// Botão + modal para RETROCEDER o fluxo de uma Nota de Encomenda a uma fase
// anterior (correção). Mostra só as fases que existem e que vêm antes da atual.
import { useState } from 'react'
import { retrocederFase, obterFluxo, FASE_CONFIG, ORDEM_FASES, type Fase } from '@/lib/neFluxo'
import type { NotaEncomenda } from '@/types/notaEncomenda'

export default function RetrocederFluxo({
  nota, faseAtual, autor, onConcluido, variante = 'botao',
}: {
  nota: NotaEncomenda
  faseAtual: Fase
  autor: { id: string | null; nome: string | null }
  onConcluido: () => void
  variante?: 'botao' | 'mini'
}) {
  const [aberto, setAberto] = useState(false)
  const [fases, setFases] = useState<Fase[]>([])
  const [destino, setDestino] = useState<Fase | ''>('')
  const [motivo, setMotivo] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setErro(null); setMotivo('')
    const fluxo = await obterFluxo(nota.id)
    const idxAtual = ORDEM_FASES.indexOf(faseAtual)
    const anteriores = fluxo.map((f) => f.fase).filter((f) => ORDEM_FASES.indexOf(f) < idxAtual)
    setFases(anteriores)
    setDestino(anteriores[anteriores.length - 1] ?? '')   // por defeito, a fase imediatamente anterior
    setAberto(true)
  }

  async function confirmar() {
    if (!destino) return
    setAGuardar(true)
    const { error } = await retrocederFase(nota, destino, autor, motivo.trim() || null)
    setAGuardar(false)
    if (error) { setErro(error.message); return }
    setAberto(false)
    onConcluido()
  }

  return (
    <>
      <button style={variante === 'mini' ? s.btnMini : s.btn} onClick={(e) => { e.stopPropagation(); abrir() }}>
        ↩ Corrigir
      </button>

      {aberto && (
        <div style={s.backdrop} onClick={(e) => { e.stopPropagation(); setAberto(false) }}>
          <div style={s.painel} onClick={(e) => e.stopPropagation()}>
            <div style={s.topo}>
              <strong>Voltar atrás para corrigir — {nota.numero ?? ''}</strong>
              <button onClick={() => setAberto(false)} style={s.fechar} aria-label="Fechar">×</button>
            </div>

            {fases.length === 0 ? (
              <p style={s.ajuda}>Esta é a primeira fase — não há fase anterior para onde voltar.</p>
            ) : (
              <>
                <p style={s.ajuda}>
                  Escolhe a fase para onde a NE deve voltar. Essa fase fica de novo em curso e as
                  seguintes voltam a ficar por fazer.
                </p>
                <div style={s.opcoes}>
                  {fases.map((f) => (
                    <label key={f} style={s.opcao}>
                      <input type="radio" name="fase-destino" checked={destino === f} onChange={() => setDestino(f)} />
                      <span>{FASE_CONFIG[f].label}</span>
                    </label>
                  ))}
                </div>
                <label style={s.campo}>
                  <span style={s.rot}>Motivo (opcional)</span>
                  <textarea style={s.textarea} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="O que há a corrigir? (fica no comunicado à equipa)" />
                </label>
                {erro && <div style={s.erro}>{erro}</div>}
                <div style={s.acoes}>
                  <button style={s.btnSec} onClick={() => setAberto(false)} disabled={aGuardar}>Cancelar</button>
                  <button style={s.btnPri} onClick={confirmar} disabled={aGuardar || !destino}>
                    {aGuardar ? 'A processar…' : 'Voltar a esta fase'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  btn: { background: '#fff', color: '#92400E', border: '1px solid #F59E0B', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnMini: { background: '#FFFBEB', color: '#92400E', border: '1px solid #F59E0B', borderRadius: 8, padding: '6px 10px', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 70 },
  painel: { background: 'var(--surface, #fff)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '90vh', overflowY: 'auto' },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  ajuda: { fontSize: 13.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 },
  opcoes: { display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: 10 },
  opcao: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' },
  textarea: { width: '100%', minHeight: 60, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  erro: { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
