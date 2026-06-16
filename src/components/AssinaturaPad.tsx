'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  aGuardar?: boolean
  onConfirmar: (blob: Blob) => void
  onCancelar: () => void
}

// Pad de assinatura em canvas (suporta rato e touch via Pointer Events).
export default function AssinaturaPad({ aGuardar, onConfirmar, onCancelar }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const [temTraco, setTemTraco] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Ajusta a resolução ao ecrã (nitidez em ecrãs retina)
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * ratio
    canvas.height = canvas.clientHeight * ratio
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0D0B2B'
  }, [])

  function posicao(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current!.getContext('2d')!
    desenhando.current = true
    const { x, y } = posicao(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    canvasRef.current!.setPointerCapture(e.pointerId)
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = posicao(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!temTraco) setTemTraco(true)
  }

  function terminar() {
    desenhando.current = false
  }

  function limpar() {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setTemTraco(false)
  }

  function confirmar() {
    canvasRef.current!.toBlob((blob) => {
      if (blob) onConfirmar(blob)
    }, 'image/png')
  }

  return (
    <div style={s.wrap}>
      <canvas
        ref={canvasRef}
        style={s.canvas}
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
      />
      <div style={s.acoes}>
        <button type="button" onClick={limpar} style={s.btnLimpar}>Limpar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCancelar} style={s.btnCancelar}>Cancelar</button>
        <button type="button" onClick={confirmar} disabled={!temTraco || aGuardar} style={s.btnGuardar}>
          {aGuardar ? 'A guardar...' : 'Guardar assinatura'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  canvas: { width: '100%', height: 180, border: '1px dashed var(--border)', borderRadius: 10, background: '#fff', touchAction: 'none', cursor: 'crosshair' },
  acoes: { display: 'flex', gap: 8, alignItems: 'center' },
  btnLimpar: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  btnCancelar: { background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  btnGuardar: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' },
}
