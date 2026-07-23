'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Equipamento } from '@/types/equipamento'
import EquipamentoForm, { equipamentoParaForm, type FormState } from '@/components/EquipamentoForm'
import { limparRascunho } from '@/lib/useFormDraft'
import styles from '@/components/equipamentoForm.module.css'

export default function EditarEquipamento() {
  const params = useParams()
  const router = useRouter()
  const { session, perfil } = useAuth()
  const id = params.id as string

  const [inicial, setInicial] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  // Veio do botão "Registar saída"? (?saida=1) — lido do URL no arranque
  const [modoSaida] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('saida') === '1'
  )

  useEffect(() => {
    const saida = modoSaida

    supabase
      .from('equipamentos')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNaoEncontrado(true)
        } else {
          const form = equipamentoParaForm(data as Equipamento)
          // No registo de saída, pré-preenche a data de saída com hoje (se vazia)
          if (saida && !form.data_saida) {
            form.data_saida = new Date().toISOString().slice(0, 10)
          }
          setInicial(form)
        }
        setLoading(false)
      })
  }, [id, modoSaida])

  async function aoGuardar(payload: Record<string, string | number | null>) {
    const dados = { ...payload }
    // No registo de saída, guarda quem registou
    if (modoSaida) {
      dados.saida_por = session?.user.id ?? null
      dados.saida_por_nome = perfil?.nome ?? perfil?.email ?? null
    }
    const { error } = await supabase.from('equipamentos').update(dados).eq('id', id)
    if (error) return error.message
    limparRascunho(`equipamento:edit:${id}`)
    router.push(`/equipamentos/${id}`)
    return null
  }

  if (loading) return <main className={styles.page}><p className={styles.estado}>A carregar...</p></main>
  if (naoEncontrado || !inicial)
    return (
      <main className={styles.page}>
        <Link href="/" className={styles.voltar}>← Voltar</Link>
        <p className={styles.estado}>Equipamento não encontrado.</p>
      </main>
    )

  return (
    <main className={styles.page}>
      <Link href={`/equipamentos/${id}`} className={styles.voltar}>← Cancelar e voltar</Link>
      <EquipamentoForm
        titulo={modoSaida ? 'Registar saída do equipamento' : 'Editar equipamento'}
        textoBotao={modoSaida ? 'Guardar saída' : 'Guardar alterações'}
        valoresIniciais={inicial}
        urlCancelar={`/equipamentos/${id}`}
        aoGuardar={aoGuardar}
        rascunhoKey={`equipamento:edit:${id}`}
      />
    </main>
  )
}
