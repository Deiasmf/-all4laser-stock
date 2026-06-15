'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import ProcessoDetalhe from '@/components/processos/ProcessoDetalhe'
import { obterProcessoCompleto } from '@/lib/processos'
import type { ProcessoCompleto } from '@/types/processo'

export default function ProcessoPage() {
  const params = useParams()
  const id = params.processo as string
  const areaSlug = params.area as string
  const { isAdmin } = useAuth()

  const [processo, setProcesso] = useState<ProcessoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    obterProcessoCompleto(id).then((p) => {
      setProcesso(p)
      setCarregando(false)
    })
  }, [id])

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div className="no-print" style={{ marginBottom: 14 }}>
        <Link href={`/processos/${areaSlug}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          ← {processo?.area_nome ?? 'Voltar'}
        </Link>
      </div>

      {carregando ? (
        <p style={{ color: 'var(--muted)', padding: 8 }}>A carregar...</p>
      ) : !processo ? (
        <p style={{ color: 'var(--muted)', padding: 8 }}>Processo não encontrado.</p>
      ) : (
        <ProcessoDetalhe processo={processo} isAdmin={isAdmin} />
      )}
    </main>
  )
}
