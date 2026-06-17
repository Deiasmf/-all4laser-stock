'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  criarNota, guardarMateriais, marcarEquipamentoEmPreparacao, notificarNovaNota,
} from '@/lib/notasEncomenda'
import NotaEncomendaForm from '@/components/NotaEncomendaForm'
import type { NotaInput, MaterialEscolhido, NotaEncomenda } from '@/types/notaEncomenda'

export default function NovaNotaPage() {
  const router = useRouter()
  const { session, perfil } = useAuth()
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar(input: NotaInput, materiais: MaterialEscolhido[], emitir: boolean) {
    setAGuardar(true)
    setErro(null)
    const nome = perfil?.nome ?? perfil?.email ?? null
    const { data, error } = await criarNota(input, session?.user.id ?? null, nome)
    if (error || !data) {
      setAGuardar(false)
      setErro('Erro ao criar a nota: ' + (error?.message ?? 'desconhecido'))
      return
    }
    const nota = data as NotaEncomenda

    // Material que acompanha (melhor esforço)
    await guardarMateriais(nota.id, materiais)

    // Ao emitir: equipamento → Prep-Logística + comunicados para técnico/logística
    if (emitir && nota.equipamento_id) {
      await marcarEquipamentoEmPreparacao(nota.equipamento_id)
      await notificarNovaNota(nota)
    }

    setAGuardar(false)
    router.push(`/comercial/notas-encomenda/${nota.id}`)
  }

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>Nova Nota de Encomenda</h1>
        <Link href="/comercial/notas-encomenda" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>← Notas de Encomenda</Link>
      </div>
      <NotaEncomendaForm
        acoes={[
          { label: 'Guardar rascunho', emitir: false },
          { label: 'Emitir Nota de Encomenda', emitir: true, destaque: true },
        ]}
        aGuardar={aGuardar}
        erro={erro}
        onSubmit={guardar}
      />
    </main>
  )
}
