'use client'

import Link from 'next/link'

// Nome de cliente clicável → abre a página de Cliente 360º.
// Se não houver cliente_id (ligação por texto), mostra o nome sem link.
// stopPropagation para não disparar cliques da linha (ex.: abrir modal/extrato).
export default function LinkCliente({
  clienteId, nome, style,
}: {
  clienteId: string | null | undefined
  nome: string | null | undefined
  style?: React.CSSProperties
}) {
  const texto = nome || '—'
  if (!clienteId) return <span style={style}>{texto}</span>
  return (
    <Link
      href={`/comercial/clientes/${clienteId}`}
      onClick={(e) => e.stopPropagation()}
      style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 'inherit', ...style }}
      title="Ver ficha 360º do cliente"
    >
      {texto}
    </Link>
  )
}
