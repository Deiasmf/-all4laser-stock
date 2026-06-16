'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { criarFolha } from '@/lib/folhasObra'
import FolhaObraForm from '@/components/FolhaObraForm'
import type { FolhaInput } from '@/types/folhaObra'

export default function NovaFolhaPage() {
  const router = useRouter()
  const { session } = useAuth()
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar(input: FolhaInput) {
    setAGuardar(true)
    setErro(null)
    const { data, error } = await criarFolha(input, session?.user.id ?? null)
    setAGuardar(false)
    if (error) {
      setErro('Erro ao criar a folha: ' + error.message)
      return
    }
    router.push(`/tecnico/folhas-obra/${data!.id}`)
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>Nova folha de obra</h1>
        <Link href="/tecnico/folhas-obra" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>← Folhas de Obra</Link>
      </div>
      <FolhaObraForm submitLabel="Criar folha" aGuardar={aGuardar} erro={erro} onSubmit={guardar} />
    </main>
  )
}
