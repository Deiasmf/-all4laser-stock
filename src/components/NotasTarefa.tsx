'use client'

import { useEffect, useRef, useState } from 'react'
import { guardarNotas } from '@/lib/minhaArea'

// Anotações da tarefa: texto rico SIMPLES (parágrafos, negrito, bullets, links)
// com autosave. Guarda HTML no campo user_tasks.notas. O editor é "não
// controlado" (contentEditable): o HTML inicial é escrito uma vez e a gravação
// é feita com atraso (debounce) enquanto se escreve, e também ao sair do campo.
export default function NotasTarefa({ taskId, inicial, onGuardado }: { taskId: string; inicial: string | null; onGuardado?: () => void | Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [estado, setEstado] = useState<'idle' | 'a-guardar' | 'guardado'>('idle')
  const [linkAberto, setLinkAberto] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // HTML inicial escrito só uma vez (senão o cursor "salta" a cada tecla).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = inicial ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function gravarAgora() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const html = (ref.current?.innerHTML ?? '').trim()
    setEstado('a-guardar')
    await guardarNotas(taskId, html || null)
    setEstado('guardado')
  }
  // Ao sair do campo, grava e avisa o pai (para a lista refletir as notas).
  async function gravarESair() { await gravarAgora(); await onGuardado?.() }
  function agendar() {
    setEstado('a-guardar')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(gravarAgora, 800)
  }
  // Grava o que estiver pendente ao desmontar.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void gravarAgora() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function cmd(comando: string, valor?: string) {
    document.execCommand(comando, false, valor)
    ref.current?.focus()
    agendar()
  }
  function aplicarLink() {
    const url = linkUrl.trim()
    if (url) document.execCommand('createLink', false, /^https?:\/\//i.test(url) ? url : `https://${url}`)
    setLinkAberto(false); setLinkUrl(''); ref.current?.focus(); agendar()
  }

  return (
    <div>
      <div style={s.toolbar}>
        <button type="button" style={s.tbtn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')} title="Negrito"><b>B</b></button>
        <button type="button" style={{ ...s.tbtn, fontStyle: 'italic' }} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')} title="Itálico">I</button>
        <button type="button" style={s.tbtn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')} title="Lista">• Lista</button>
        <button type="button" style={s.tbtn} onMouseDown={(e) => e.preventDefault()} onClick={() => setLinkAberto((v) => !v)} title="Link">🔗 Link</button>
        <span style={s.estado}>{estado === 'a-guardar' ? 'A guardar…' : estado === 'guardado' ? '✓ Guardado' : ''}</span>
      </div>
      {linkAberto && (
        <div style={s.linkLinha}>
          <input
            value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…"
            style={s.linkInput} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') aplicarLink(); if (e.key === 'Escape') setLinkAberto(false) }}
          />
          <button type="button" style={s.linkOk} onClick={aplicarLink}>Aplicar</button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={agendar}
        onBlur={gravarESair}
        style={s.editor}
        data-placeholder="Escreve aqui as tuas anotações…"
      />
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  toolbar: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' },
  tbtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 },
  estado: { marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' },
  editor: { minHeight: 90, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 14, lineHeight: 1.5, background: '#fff', outline: 'none' },
  linkLinha: { display: 'flex', gap: 6, marginBottom: 6 },
  linkInput: { flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 13 },
  linkOk: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
}
