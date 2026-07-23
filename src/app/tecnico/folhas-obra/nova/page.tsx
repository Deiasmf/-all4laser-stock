'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { criarFolha } from '@/lib/folhasObra'
import { obterNota } from '@/lib/notasEncomenda'
import { limparRascunho } from '@/lib/useFormDraft'
import FolhaObraForm from '@/components/FolhaObraForm'

const RASCUNHO = 'folha-obra:novo'
import type { FolhaInput, FolhaObra } from '@/types/folhaObra'
import type { NotaEncomenda } from '@/types/notaEncomenda'

export default function NovaFolhaPage() {
  const router = useRouter()
  const { session } = useAuth()
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Quando vem de uma nota de encomenda (?nota=<id>), pré-preenche e liga.
  // Lido no effect (após mount) para não causar mismatch de hidratação.
  const [notaId, setNotaId] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<FolhaObra | null>(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('nota')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotaId(id)
    if (!id) {
      setPronto(true)
      return
    }
    let activo = true
    obterNota(id).then(({ data }) => {
      if (!activo) return
      const n = data as NotaEncomenda | null
      if (n) {
        setPrefill({
          cliente_id: n.cliente_id,
          cliente_nome: n.cliente_nome,
          cliente_pais: n.pais_destino,
          equipamento_id: n.equipamento_id,
          equipamento_modelo: n.equipamento_modelo,
          equipamento_sn: n.equipamento_sn,
          equipamento_ano: n.equipamento_ano,
          tipo_servico: 'Preparação para saída',
        } as FolhaObra)
      }
      setPronto(true)
    })
    return () => { activo = false }
  }, [])

  async function guardar(input: FolhaInput) {
    setAGuardar(true)
    setErro(null)
    const { data, error } = await criarFolha(input, session?.user.id ?? null, notaId)
    setAGuardar(false)
    if (error) {
      setErro('Erro ao criar a folha: ' + error.message)
      return
    }
    limparRascunho(RASCUNHO)
    router.push(`/tecnico/folhas-obra/${data!.id}`)
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>Nova folha de obra</h1>
        <Link href={notaId ? '/tecnico/preparacao' : '/tecnico/folhas-obra'} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>
          ← {notaId ? 'Preparação Técnica' : 'Folhas de Obra'}
        </Link>
      </div>
      {!pronto ? (
        <p style={{ color: 'var(--muted)' }}>A carregar...</p>
      ) : (
        <FolhaObraForm inicial={prefill} submitLabel="Criar folha" aGuardar={aGuardar} erro={erro} onSubmit={guardar} rascunhoKey={notaId ? undefined : RASCUNHO} />
      )}
    </main>
  )
}
