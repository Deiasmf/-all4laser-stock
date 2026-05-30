'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import EquipamentoForm, { formVazio } from '@/components/EquipamentoForm'
import styles from '@/components/equipamentoForm.module.css'

export default function NovoEquipamento() {
  const router = useRouter()
  const { session, perfil } = useAuth()

  async function aoGuardar(payload: Record<string, string | number | null>) {
    // Regista quem deu entrada
    const comAutor = {
      ...payload,
      criado_por: session?.user.id ?? null,
      criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
    }
    const { data, error } = await supabase
      .from('equipamentos')
      .insert(comAutor)
      .select('id')
      .single()
    if (error) return error.message
    // Vai para o detalhe do equipamento recém-criado
    router.push(`/equipamentos/${data!.id}`)
    return null
  }

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.voltar}>← Cancelar e voltar à lista</Link>
      <EquipamentoForm
        titulo="Adicionar equipamento"
        textoBotao="Adicionar equipamento"
        valoresIniciais={formVazio()}
        urlCancelar="/"
        aoGuardar={aoGuardar}
      />
    </main>
  )
}
