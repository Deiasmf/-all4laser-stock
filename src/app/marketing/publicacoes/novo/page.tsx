'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { criarPost, listarCampanhas } from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import PostForm from '@/components/PostForm'
import type { PostInput, Campanha } from '@/types/marketing'

export default function NovaPublicacaoPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarCampanhas().then(setCampanhas) }, [])

  async function criar(input: PostInput) {
    if (!perfil) return
    setAGuardar(true); setErro(null)
    const { data, error } = await criarPost(input, { id: perfil.id, nome: perfil.nome })
    if (error || !data) { setAGuardar(false); setErro(mensagemErro(error, { entidade: 'publicação' })); return }
    router.push(`/marketing/publicacoes/${data.id}`)
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <Link href="/marketing/publicacoes" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Publicações</Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 18px' }}>Nova publicação</h1>
      {erro && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{erro}</p>}
      <div className="a4l-card" style={{ padding: 20 }}>
        <PostForm campanhas={campanhas} aGuardar={aGuardar} onSubmit={criar} onCancelar={() => router.push('/marketing/publicacoes')} />
      </div>
    </main>
  )
}
