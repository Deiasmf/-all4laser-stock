'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { obterFolha, atualizarFolha, eliminarFolha } from '@/lib/folhasObra'
import FolhaObraForm from '@/components/FolhaObraForm'
import AssinaturasFolha from '@/components/AssinaturasFolha'
import { ESTADO_FOLHA_CONFIG, type FolhaObra, type FolhaInput } from '@/types/folhaObra'

export default function EditarFolhaPage() {
  const params = useParams()
  const router = useRouter()
  const { isAdmin } = useAuth()
  const id = params.id as string

  const [folha, setFolha] = useState<FolhaObra | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [naoEncontrada, setNaoEncontrada] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    obterFolha(id).then(({ data }) => {
      if (!activo) return
      if (!data) setNaoEncontrada(true)
      else setFolha(data as FolhaObra)
      setCarregando(false)
    })
    return () => { activo = false }
  }, [id])

  async function guardar(input: FolhaInput) {
    setAGuardar(true)
    setErro(null)
    setMsg(null)
    const { data, error } = await atualizarFolha(id, input)
    setAGuardar(false)
    if (error) { setErro('Erro ao guardar: ' + error.message); return }
    if (data) setFolha(data as FolhaObra)
    setMsg('Guardado ✓')
  }

  async function eliminar() {
    if (!confirm(`Eliminar a folha ${folha?.numero}? Esta ação não pode ser anulada.`)) return
    const { error } = await eliminarFolha(id)
    if (error) { setErro('Erro ao eliminar: ' + error.message); return }
    router.push('/tecnico/folhas-obra')
  }

  if (carregando) return <main style={s.page}><p style={s.estado}>A carregar...</p></main>
  if (naoEncontrada || !folha)
    return (
      <main style={s.page}>
        <Link href="/tecnico/folhas-obra" style={s.voltar}>← Folhas de Obra</Link>
        <p style={s.estado}>Folha de obra não encontrada.</p>
      </main>
    )

  const cfg = ESTADO_FOLHA_CONFIG[folha.estado]

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={s.titulo}>{folha.numero}</h1>
            <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 999, padding: '2px 10px' }}>{cfg.label}</span>
          </div>
          <Link href="/tecnico/folhas-obra" style={s.voltar}>← Folhas de Obra</Link>
        </div>
        {isAdmin && (
          <button onClick={eliminar} style={s.btnEliminar}>Eliminar</button>
        )}
      </div>

      {msg && <div style={s.ok}>{msg}</div>}

      <FolhaObraForm inicial={folha} submitLabel="Guardar alterações" aGuardar={aGuardar} erro={erro} onSubmit={guardar} />

      <AssinaturasFolha folha={folha} onAtualizada={setFolha} />
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  ok: { background: '#e6f7f1', color: '#00875f', border: '1px solid #00A87A', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 14 },
  btnEliminar: { background: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
}
