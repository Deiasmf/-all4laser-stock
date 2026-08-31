'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'
import PedidoEditor, { type EstadoEditor } from '@/components/freight/PedidoEditor'
import {
  pedidoVazio, criarPedido, guardarLinhas, listarBoxes, listarTemplates,
} from '@/lib/freight'
import type { StandardBox, FreightEmailTemplate } from '@/types/freight'
import { render, varsAssunto } from '@/types/freight'

const RASCUNHO = 'freight-pedido:novo'

function estadoVazio(): EstadoEditor {
  return { pedido: pedidoVazio(), linhas: [] }
}

export default function NovoPedidoPage() {
  const { perfil, isAdministrativo, perfilCarregado } = useAuth()
  const router = useRouter()

  const [estado, setEstado] = useState<EstadoEditor>(estadoVazio)
  const [assunto, setAssunto] = useState('')
  const [assuntoManual, setAssuntoManual] = useState(false)
  const [boxes, setBoxes] = useState<StandardBox[]>([])
  const [templates, setTemplates] = useState<FreightEmailTemplate[]>([])
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { rascunhoRecuperado, descartar, limpar } = useFormDraft<{ estado: EstadoEditor; assunto: string }>(
    RASCUNHO,
    { estado, assunto },
    (d) => { setEstado(d.estado); setAssunto(d.assunto); if (d.assunto) setAssuntoManual(true) },
    { emptyState: { estado: estadoVazio(), assunto: '' } },
  )

  useEffect(() => {
    listarBoxes(true).then(setBoxes)
    listarTemplates().then(setTemplates)
  }, [])

  // Assunto gerado automaticamente (enquanto o utilizador não o editar à mão).
  useEffect(() => {
    if (assuntoManual) return
    const tpl = templates.find((t) => t.idioma === estado.pedido.idioma)
    if (!tpl) return
    setAssunto(render(tpl.assunto_template, varsAssunto(estado.pedido)))
  }, [templates, estado.pedido, assuntoManual])

  const criar = useCallback(async () => {
    setErro(null)
    if (!estado.pedido.destino_pais) { setErro('Indica o país de destino.'); return }
    setAGravar(true)
    const { data, error } = await criarPedido({ ...estado.pedido, assunto_email: assunto.trim() || null }, perfil?.id ?? null)
    if (error || !data) { setAGravar(false); setErro('Erro ao criar: ' + (error?.message ?? '')); return }
    const id = (data as { id: string }).id
    if (estado.linhas.length > 0) {
      const { error: erroL } = await guardarLinhas(id, estado.linhas)
      if (erroL) { setAGravar(false); setErro('Pedido criado mas falhou gravar a carga: ' + erroL.message); return }
    }
    limpar()
    router.push(`/admin-dept/cotacoes-transporte/${id}`)
  }, [estado, assunto, perfil, limpar, router])

  if (perfilCarregado && !isAdministrativo) {
    return <main style={c.page}><p style={c.muted}>Sem acesso à Área Administrativa.</p></main>
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <Link href="/admin-dept/cotacoes-transporte" style={c.voltar}>← Cotações de transporte</Link>
        <h1 style={c.titulo}>Novo pedido de cotação</h1>
      </div>

      {rascunhoRecuperado && <RascunhoAviso onDescartar={() => { descartar(); setAssuntoManual(false) }} />}

      <PedidoEditor value={estado} onChange={setEstado} boxes={boxes} />

      <label style={c.campo}><span style={c.rot}>Assunto do email</span>
        <input style={c.input} value={assunto} onChange={(e) => { setAssunto(e.target.value); setAssuntoManual(true) }} />
        <span style={c.dica}>Gerado automaticamente. Podes editar antes de enviar.</span>
      </label>

      {erro && <p style={c.erro}>{erro}</p>}

      <div style={c.acoes}>
        <Link href="/admin-dept/cotacoes-transporte" style={c.btnSecundario}>Cancelar</Link>
        <button style={c.btnPrimario} onClick={criar} disabled={aGravar}>{aGravar ? 'A criar…' : 'Criar pedido'}</button>
      </div>
      <p style={c.dica}>Depois de criar, escolhes o grupo de transitários, revês a pré-visualização e envias.</p>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', flexDirection: 'column', gap: 4 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  dica: { fontSize: 12, color: 'var(--muted)' },
  erro: { color: '#B91C1C', fontSize: 14, fontWeight: 600 },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  btnPrimario: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSecundario: { padding: '9px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit', textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
}
