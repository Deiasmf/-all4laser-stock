'use client'

import { type AnexoComUrl } from '@/lib/minhaArea'

// Mostra um anexo: miniatura se for imagem, senão um "chip" de ficheiro.
// Ambos abrem o URL assinado num novo separador. onRemover, se dado, mostra o ✕.
function tamanhoHumano(n: number | null): string {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function AnexoVista({ anexo, onRemover }: { anexo: AnexoComUrl; onRemover?: () => void }) {
  const img = (anexo.mime ?? '').startsWith('image/')
  return (
    <div style={s.item}>
      {anexo.url ? (
        img ? (
          <a href={anexo.url} target="_blank" rel="noreferrer" style={s.thumbLink} title={anexo.nome}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={anexo.url} alt={anexo.nome} style={s.thumb} />
          </a>
        ) : (
          <a href={anexo.url} target="_blank" rel="noreferrer" style={s.chip} title={anexo.nome}>
            📄 <span style={s.nome}>{anexo.nome}</span>
            {anexo.tamanho ? <span style={s.tam}>{tamanhoHumano(anexo.tamanho)}</span> : null}
          </a>
        )
      ) : (
        <span style={s.chip}>📄 {anexo.nome} <span style={s.tam}>(indisponível)</span></span>
      )}
      {onRemover && <button style={s.x} onClick={onRemover} title="Remover anexo" aria-label="Remover anexo">✕</button>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  item: { position: 'relative', display: 'inline-flex' },
  thumbLink: { display: 'block', lineHeight: 0 },
  thumb: { width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' },
  chip: { display: 'inline-flex', gap: 6, alignItems: 'center', background: '#f4f5f7', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, color: 'var(--foreground)', textDecoration: 'none', maxWidth: 220 },
  nome: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tam: { color: 'var(--muted)', flexShrink: 0 },
  x: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: '1px solid var(--border)', background: '#fff', color: '#B91C1C', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
}
