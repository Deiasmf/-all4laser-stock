'use client'

// Aviso, ao gerar/enviar uma ficha, de que o MODELO ainda não tem descrição
// standard — com atalho para a criar (pré-preenchido).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { obterDescricaoModelo } from '@/lib/fichaProduto'

export default function AvisoDescricaoModelo({ marca, modelo }: { marca: string | null; modelo: string | null }) {
  const [falta, setFalta] = useState(false)

  useEffect(() => {
    let ativo = true
    if (!modelo || !modelo.trim()) { setFalta(false); return }
    obterDescricaoModelo(marca, modelo).then((d) => { if (ativo) setFalta(!d) })
    return () => { ativo = false }
  }, [marca, modelo])

  if (!falta) return null
  const q = new URLSearchParams({ marca: marca ?? '', modelo: modelo ?? '' }).toString()
  return (
    <div style={s.box}>
      ⚠️ Este modelo ainda não tem <b>descrição standard</b>.{' '}
      <Link href={`/definicoes/fichas/modelos?${q}`} target="_blank" style={s.link}>Criar agora ↗</Link>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  box: { background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#92400E', margin: '4px 0' },
  link: { color: '#7C3AED', fontWeight: 700, textDecoration: 'none' },
}
