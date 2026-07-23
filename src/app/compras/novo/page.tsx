'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { criarPedido, enviarParaCompras, listarFornecedores, type ItemInput } from '@/lib/compras'
import PecaAutocomplete from '@/components/PecaAutocomplete'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'
import type { Fornecedor } from '@/types/compras'

type LinhaItem = { peca_id: string | null; peca_nome: string; quantidade: string; notas: string }

const novaLinha = (): LinhaItem => ({ peca_id: null, peca_nome: '', quantidade: '1', notas: '' })

// Campos que o rascunho automático guarda (sem a lista de fornecedores nem o controlo).
type ComprasDraft = { urgente: boolean; itens: LinhaItem[]; fornecedor: string; fornecedorOutro: string; notas: string }
const comprasVazia = (): ComprasDraft => ({ urgente: false, itens: [novaLinha()], fornecedor: '', fornecedorOutro: '', notas: '' })

export default function NovoPedidoPage() {
  const router = useRouter()
  const { session, perfil } = useAuth()
  const [urgente, setUrgente] = useState(false)
  const [itens, setItens] = useState<LinhaItem[]>([novaLinha()])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedor, setFornecedor] = useState('')
  const [fornecedorOutro, setFornecedorOutro] = useState('')
  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarFornecedores(true).then(setFornecedores) }, [])

  function setLinha(i: number, patch: Partial<LinhaItem>) {
    setItens((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  // Rascunho automático.
  const valores: ComprasDraft = { urgente, itens, fornecedor, fornecedorOutro, notas }
  function restaurar(d: ComprasDraft) {
    setUrgente(d.urgente)
    setItens(d.itens ?? [novaLinha()])
    setFornecedor(d.fornecedor)
    setFornecedorOutro(d.fornecedorOutro)
    setNotas(d.notas)
  }
  const { rascunhoRecuperado, descartar, limpar } = useFormDraft<ComprasDraft>(
    'compras:novo', valores, restaurar, { emptyState: comprasVazia() }
  )

  async function guardar(emitir: boolean) {
    setErro(null)
    const validos: ItemInput[] = itens
      .filter((l) => l.peca_nome.trim())
      .map((l) => ({ peca_id: l.peca_id, peca_nome: l.peca_nome.trim(), quantidade: Math.max(1, Number(l.quantidade) || 1), notas: l.notas.trim() || null }))
    if (validos.length === 0) { setErro('Adiciona pelo menos uma peça.'); return }

    const fornecedorFinal = (fornecedor === '__outro__' ? fornecedorOutro : fornecedor).trim()
    const notasFinal = [notas.trim(), fornecedorFinal ? `Fornecedor sugerido: ${fornecedorFinal}` : ''].filter(Boolean).join('\n') || null

    setAGuardar(true)
    const uid = session?.user.id ?? null
    const nome = perfil?.nome ?? perfil?.email ?? null
    const { data, error } = await criarPedido({ urgente, notas: notasFinal, estado: 'rascunho' }, validos, uid, nome)
    if (error || !data) { setAGuardar(false); setErro('Erro ao criar o pedido: ' + (error?.message ?? '')); return }
    if (emitir) await enviarParaCompras(data, validos.length, { id: uid, nome })
    setAGuardar(false)
    limpar()
    router.push(`/compras/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--a4l-text-dark)' }}>Novo Pedido de Compra</h1>
        <Link href="/compras" style={{ color: 'var(--a4l-text-light)', textDecoration: 'none', fontSize: 14 }}>← Pedidos de Compra</Link>
      </div>

      {rascunhoRecuperado && (
        <div style={{ marginBottom: 12 }}>
          <RascunhoAviso onDescartar={descartar} />
        </div>
      )}

      {/* Urgente */}
      <div className="a4l-card" style={{ marginBottom: 14, background: urgente ? '#fdecea' : undefined, border: urgente ? '1px solid #DC2626' : undefined }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, color: urgente ? '#DC2626' : 'var(--a4l-text-dark)' }}>
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
          {urgente ? '🔴 Pedido URGENTE' : 'Marcar como urgente'}
        </label>
      </div>

      {/* Itens */}
      <div className="a4l-card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--a4l-text-dark)', marginBottom: 12 }}>Itens a comprar</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {itens.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', borderTop: i > 0 ? '0.5px solid var(--a4l-border)' : undefined, paddingTop: i > 0 ? 12 : 0 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <PecaAutocomplete
                  valor={l.peca_nome}
                  onTexto={(v) => setLinha(i, { peca_nome: v, peca_id: null })}
                  onEscolher={(p) => setLinha(i, { peca_nome: p.nome, peca_id: p.id })}
                />
              </div>
              <input className="a4l-input" style={{ width: 70 }} type="number" min={1} value={l.quantidade} onChange={(e) => setLinha(i, { quantidade: e.target.value })} />
              <input className="a4l-input" style={{ flex: 1, minWidth: 140 }} placeholder="Notas (opcional)" value={l.notas} onChange={(e) => setLinha(i, { notas: e.target.value })} />
              {itens.length > 1 && (
                <button type="button" onClick={() => setItens((a) => a.filter((_, idx) => idx !== i))} className="a4l-btn-ghost" style={{ padding: '8px 12px' }}>×</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItens((a) => [...a, novaLinha()])} className="a4l-btn-ghost" style={{ marginTop: 12 }}>+ Adicionar item</button>
      </div>

      {/* Fornecedor sugerido + notas */}
      <div className="a4l-card" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={lbl}>Fornecedor sugerido (opcional)</label>
          <select className="a4l-input" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
            <option value="">—</option>
            {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
            <option value="__outro__">Outro...</option>
          </select>
          {fornecedor === '__outro__' && (
            <input className="a4l-input" style={{ marginTop: 8 }} placeholder="Nome do fornecedor" value={fornecedorOutro} onChange={(e) => setFornecedorOutro(e.target.value)} />
          )}
        </div>
        <div>
          <label style={lbl}>Notas gerais</label>
          <textarea className="a4l-input" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      {erro && <div style={{ background: '#fdecea', color: '#DC2626', border: '1px solid #DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{erro}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="a4l-btn-ghost" disabled={aGuardar} onClick={() => guardar(false)}>{aGuardar ? 'A guardar...' : 'Guardar rascunho'}</button>
        <button className="a4l-btn" disabled={aGuardar} onClick={() => guardar(true)}>{aGuardar ? 'A guardar...' : 'Enviar para Compras'}</button>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--a4l-text-mid)', marginBottom: 4 }
