'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { criarArea } from '@/lib/processos'

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function NovaAreaPage() {
  const router = useRouter()
  const { isAdmin, carregando } = useAuth()
  const [nome, setNome] = useState('')
  const [icone, setIcone] = useState('📁')
  const [cor, setCor] = useState('644DE3')
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) return setErro('O nome é obrigatório.')
    setAGravar(true)
    const { error } = await criarArea({
      slug: slugify(nome),
      nome: nome.trim(),
      icone: icone.trim() || '📁',
      cor_accent: cor.replace('#', '').trim() || '644DE3',
      ordem: 99,
    })
    if (error) { setAGravar(false); return setErro('Erro ao criar área: ' + error.message) }
    router.push('/processos')
  }

  if (carregando) return <Wrap><p style={estado}>A carregar...</p></Wrap>
  if (!isAdmin) return <Wrap><p style={estado}>Sem permissão para criar áreas.</p></Wrap>

  return (
    <Wrap>
      <div style={{ marginBottom: 14 }}>
        <Link href="/processos" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Processos</Link>
      </div>
      <h1 style={titulo}>Nova área</h1>
      <form onSubmit={gravar}>
        {erro && <div style={msgErro}>{erro}</div>}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Nome da área</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} style={input} placeholder="Ex.: Recursos Humanos" />
          {nome && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Endereço: /processos/{slugify(nome)}</p>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 18 }}>
          <div>
            <label style={lbl}>Ícone (emoji)</label>
            <input value={icone} onChange={(e) => setIcone(e.target.value)} style={input} maxLength={4} />
          </div>
          <div>
            <label style={lbl}>Cor (hex)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={cor} onChange={(e) => setCor(e.target.value)} style={{ ...input, flex: 1 }} placeholder="644DE3" />
              <span style={{ width: 34, height: 34, borderRadius: 8, background: `#${cor.replace('#', '')}`, border: '1px solid var(--border)', flexShrink: 0 }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={aGravar} style={btnPrimario}>{aGravar ? 'A gravar...' : 'Criar área'}</button>
          <button type="button" onClick={() => router.back()} style={btnSecundario}>Cancelar</button>
        </div>
      </form>
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 620, margin: '0 auto', padding: 20 }}>{children}</main>
}
const titulo: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 18 }
const estado: React.CSSProperties = { color: 'var(--muted)', padding: 8 }
const lbl: React.CSSProperties = { display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
  borderRadius: 8, background: '#fff', color: 'var(--foreground)',
}
const msgErro: React.CSSProperties = {
  background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8,
  padding: '10px 14px', marginBottom: 16, fontSize: 14, fontWeight: 600,
}
const btnPrimario: React.CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 20px', fontWeight: 700, cursor: 'pointer',
}
const btnSecundario: React.CSSProperties = {
  background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: 'pointer',
}
