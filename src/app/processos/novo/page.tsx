'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import ProcessoForm, { type ValoresProcesso } from '@/components/processos/ProcessoForm'
import { listarAreas } from '@/lib/processos'
import type { Area } from '@/types/processo'

const VAZIO: ValoresProcesso = {
  areaId: '',
  nome: '',
  descricao: '',
  responsavel: '',
  status: 'ativo',
  notas: '',
  steps: [''],
  inputs: [''],
  outputs: [''],
  kpis: [''],
  ferramentas: [''],
}

export default function NovoProcessoPage() {
  const { isAdmin, carregando: authCarregando } = useAuth()
  const [areas, setAreas] = useState<Area[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    listarAreas().then((as) => {
      setAreas(as)
      setCarregando(false)
    })
  }, [])

  if (authCarregando || carregando) return <Wrap><p style={estado}>A carregar...</p></Wrap>
  if (!isAdmin) return <Wrap><p style={estado}>Sem permissão para criar processos.</p></Wrap>

  return (
    <Wrap>
      <div style={{ marginBottom: 14 }}>
        <Link href="/processos" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Processos</Link>
      </div>
      <h1 style={titulo}>Novo processo</h1>
      <ProcessoForm areas={areas} inicial={VAZIO} />
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>{children}</main>
}
const titulo: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 18 }
const estado: React.CSSProperties = { color: 'var(--muted)', padding: 8 }
