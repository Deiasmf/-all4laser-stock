'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ClienteForm from '@/components/ClienteForm'
import { criarClienteFicha } from '@/lib/clientes'
import type { ClienteInput } from '@/types/cliente'

export default function NovoClientePage() {
  const router = useRouter()
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(input: ClienteInput) {
    setAGuardar(true)
    setErro(null)
    const { data, error } = await criarClienteFicha(input)
    if (error || !data) {
      setAGuardar(false)
      setErro('Não foi possível criar o cliente: ' + (error?.message ?? 'erro desconhecido'))
      return
    }
    router.push(`/comercial/clientes/${data.id}`)
  }

  return (
    <main style={s.page}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={s.titulo}>Novo cliente</h1>
        <Link href="/comercial/clientes" style={s.voltar}>← Clientes</Link>
      </div>
      <ClienteForm aGuardar={aGuardar} erro={erro} submitLabel="Criar cliente" onSubmit={criar} />
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
}
