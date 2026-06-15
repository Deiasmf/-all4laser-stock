'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { contarGapsCriticos } from '@/lib/processos'

// Link "Processos" na topbar global, com badge de gaps críticos.
export default function ProcessosTopLink() {
  const { session } = useAuth()
  const [criticos, setCriticos] = useState(0)

  useEffect(() => {
    if (!session) return
    let ativo = true
    contarGapsCriticos().then((n) => { if (ativo) setCriticos(n) })
    return () => { ativo = false }
  }, [session])

  return (
    <Link href="/processos" className="topbar-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      📋 Processos
      {criticos > 0 && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: 'var(--danger)',
            borderRadius: 999,
            padding: '1px 7px',
            lineHeight: 1.6,
          }}
        >
          {criticos}
        </span>
      )}
    </Link>
  )
}
