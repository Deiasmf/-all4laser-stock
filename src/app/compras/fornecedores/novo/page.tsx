'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import FornecedorForm from '@/components/FornecedorForm'
import { criarFornecedor } from '@/lib/fornecedores'
import { limparRascunho } from '@/lib/useFormDraft'
import { mensagemErro } from '@/lib/erros'
import type { FornecedorInput } from '@/types/compras'

const RASCUNHO = 'fornecedor:novo'

export default function NovoFornecedorPage() {
  const router = useRouter()
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(input: FornecedorInput) {
    setAGuardar(true)
    setErro(null)
    const { data, error } = await criarFornecedor(input)
    if (error || !data) {
      setAGuardar(false)
      setErro(mensagemErro(error, { entidade: 'fornecedor' }))
      return
    }
    limparRascunho(RASCUNHO)
    router.push(`/compras/fornecedores/${data.id}`)
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>Novo fornecedor</h1>
        <Link href="/compras/fornecedores" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>← Fornecedores</Link>
      </div>
      <FornecedorForm aGuardar={aGuardar} erro={erro} submitLabel="Criar fornecedor" onSubmit={criar} rascunhoKey={RASCUNHO} />
    </main>
  )
}
