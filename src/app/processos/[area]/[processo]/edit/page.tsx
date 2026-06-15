'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import ProcessoForm, { type ValoresProcesso } from '@/components/processos/ProcessoForm'
import { listarAreas, obterProcessoCompleto } from '@/lib/processos'
import type { Area } from '@/types/processo'

export default function EditarProcessoPage() {
  const params = useParams()
  const id = params.processo as string
  const { isAdmin, carregando: authCarregando } = useAuth()

  const [areas, setAreas] = useState<Area[]>([])
  const [inicial, setInicial] = useState<ValoresProcesso | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      const [as, p] = await Promise.all([listarAreas(), obterProcessoCompleto(id)])
      setAreas(as)
      if (p) {
        setInicial({
          areaId: p.area_id,
          nome: p.nome,
          descricao: p.descricao,
          responsavel: p.responsavel,
          status: p.status,
          notas: p.notas ?? '',
          steps: (p.steps ?? []).map((s) => s.acao),
          inputs: p.inputs ?? [],
          outputs: p.outputs ?? [],
          kpis: p.kpis ?? [],
          ferramentas: p.ferramentas ?? [],
        })
      }
      setCarregando(false)
    }
    carregar()
  }, [id])

  if (authCarregando || carregando) return <Wrap><p style={estado}>A carregar...</p></Wrap>
  if (!isAdmin) return <Wrap><p style={estado}>Sem permissão para editar.</p></Wrap>
  if (!inicial) return <Wrap><p style={estado}>Processo não encontrado.</p></Wrap>

  return (
    <Wrap>
      <div style={{ marginBottom: 14 }}>
        <Link href={`/processos/${params.area}/${id}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Cancelar</Link>
      </div>
      <h1 style={titulo}>Editar processo</h1>
      <ProcessoForm areas={areas} processoId={id} inicial={inicial} />
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>{children}</main>
}
const titulo: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 18 }
const estado: React.CSSProperties = { color: 'var(--muted)', padding: 8 }
