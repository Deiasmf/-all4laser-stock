'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import FornecedorForm from '@/components/FornecedorForm'
import { limparRascunho } from '@/lib/useFormDraft'
import {
  obterFornecedor, atualizarFornecedor, alternarAtivoFornecedor, eliminarFornecedor, moradaFornecedor,
} from '@/lib/fornecedores'
import type { Fornecedor, FornecedorInput } from '@/types/compras'

export default function FornecedorDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const { isAdmin } = useAuth()
  const id = params.id as string

  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [editar, setEditar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    obterFornecedor(id).then(({ data }) => {
      if (!activo) return
      if (!data) setNaoEncontrado(true)
      else setFornecedor(data as Fornecedor)
      setCarregando(false)
    })
    return () => { activo = false }
  }, [id])

  async function guardar(input: FornecedorInput) {
    setAGuardar(true)
    setErro(null)
    setMsg(null)
    const { data, error } = await atualizarFornecedor(id, input)
    setAGuardar(false)
    if (error || !data) { setErro('Erro ao guardar: ' + (error?.message ?? 'desconhecido')); return }
    setFornecedor(data as Fornecedor)
    setEditar(false)
    limparRascunho(`fornecedor:edit:${id}`)
    setMsg('Ficha guardada ✓')
  }

  async function toggleAtivo() {
    if (!fornecedor) return
    await alternarAtivoFornecedor(id, !fornecedor.ativo)
    setFornecedor({ ...fornecedor, ativo: !fornecedor.ativo })
  }

  async function eliminar() {
    if (!fornecedor) return
    if (!confirm(`Eliminar o fornecedor "${fornecedor.nome}"? Esta ação não pode ser anulada.`)) return
    const { error } = await eliminarFornecedor(id)
    if (error) { setErro('Erro ao eliminar: ' + error.message); return }
    router.push('/compras/fornecedores')
  }

  if (carregando) return <main style={s.page}><p style={s.estado}>A carregar...</p></main>
  if (naoEncontrado || !fornecedor)
    return (
      <main style={s.page}>
        <Link href="/compras/fornecedores" style={s.voltar}>← Fornecedores</Link>
        <p style={s.estado}>Fornecedor não encontrado.</p>
      </main>
    )

  if (editar) {
    return (
      <main style={s.page}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={s.titulo}>Editar {fornecedor.nome}</h1>
          <button onClick={() => setEditar(false)} style={s.voltarBtn}>← Cancelar edição</button>
        </div>
        <FornecedorForm
          inicial={fornecedor}
          aGuardar={aGuardar}
          erro={erro}
          submitLabel="Guardar alterações"
          onSubmit={guardar}
          rascunhoKey={`fornecedor:edit:${id}`}
        />
      </main>
    )
  }

  const morada = moradaFornecedor(fornecedor)

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={s.titulo}>{fornecedor.nome}</h1>
            {!fornecedor.ativo && <span style={s.inativo}>inativo</span>}
          </div>
          <Link href="/compras/fornecedores" style={s.voltar}>← Fornecedores</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setEditar(true)} style={s.btn}>Editar</button>
          <button onClick={toggleAtivo} style={s.btnGhost}>{fornecedor.ativo ? 'Desativar' : 'Ativar'}</button>
          {isAdmin && <button onClick={eliminar} style={s.btnEliminar}>Eliminar</button>}
        </div>
      </div>

      {msg && <div style={s.ok}>{msg}</div>}

      <div className="a4l-card" style={s.ficha}>
        <Info label="NIF / VAT" valor={fornecedor.nif} />
        <Info label="Pessoa de contacto" valor={fornecedor.pessoa_contacto} />
        <Info label="Morada" valor={morada || null} />
        <Info label="Telefone" valor={fornecedor.telefone} />
        <Info label="Telemóvel" valor={fornecedor.telemovel} />
        <Info label="Email geral" valor={fornecedor.email} />
        <Info label="Email de reparações" valor={fornecedor.email_reparacoes} />
        <Info label="IBAN" valor={fornecedor.iban} />
        <Info label="Notas" valor={fornecedor.notas} />
      </div>
    </main>
  )
}

function Info({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div style={s.infoLinha}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValor}>{valor && valor.trim() ? valor : '—'}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  inativo: { fontSize: 11, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  voltarBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 0 },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  ok: { background: '#e6f7f1', color: '#00795c', border: '1px solid #9fe0cb', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600, marginBottom: 12 },
  ficha: { display: 'flex', flexDirection: 'column', padding: 4 },
  infoLinha: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 12px', borderTop: '0.5px solid var(--border)', fontSize: 14 },
  infoLabel: { color: 'var(--muted)', fontWeight: 600, minWidth: 150 },
  infoValor: { color: 'var(--foreground)', textAlign: 'right', wordBreak: 'break-word' },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer' },
  btnEliminar: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer' },
}
