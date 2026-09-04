'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { criarCampanha } from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import CampanhaForm from '@/components/CampanhaForm'
import type { CampanhaInput } from '@/types/marketing'

export default function NovaCampanhaPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(input: CampanhaInput) {
    if (!perfil) return
    setAGuardar(true)
    setErro(null)
    const { data, error } = await criarCampanha(input, { id: perfil.id, nome: perfil.nome })
    if (error || !data) {
      setAGuardar(false)
      setErro(mensagemErro(error, { entidade: 'campanha' }))
      return
    }
    router.push(`/marketing/campanhas/${data.id}`)
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <Link href="/marketing/campanhas" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Campanhas</Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 18px' }}>Nova campanha</h1>
      {erro && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{erro}</p>}
      <div className="a4l-card" style={{ padding: 20 }}>
        <CampanhaForm aGuardar={aGuardar} onSubmit={criar} onCancelar={() => router.push('/marketing/campanhas')} />
      </div>
    </main>
  )
}
