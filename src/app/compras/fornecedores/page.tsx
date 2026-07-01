'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarFornecedores, criarFornecedor, atualizarFornecedor } from '@/lib/compras'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import type { Fornecedor } from '@/types/compras'

type Form = { nome: string; contacto: string; email: string; notas: string }
const vazio: Form = { nome: '', contacto: '', email: '', notas: '' }

const colunasExport: ColunaExport<Fornecedor>[] = [
  { cabecalho: 'Nome', valor: (f) => f.nome },
  { cabecalho: 'Contacto', valor: (f) => f.contacto },
  { cabecalho: 'Email', valor: (f) => f.email },
  { cabecalho: 'Notas', valor: (f) => f.notas },
  { cabecalho: 'Ativo', valor: (f) => (f.ativo ? 'Sim' : 'Não') },
]

export default function FornecedoresPage() {
  const [lista, setLista] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(vazio)
  const [aGuardar, setAGuardar] = useState(false)

  function carregar() { listarFornecedores().then(setLista).finally(() => setCarregando(false)) }
  useEffect(carregar, [])

  function abrirNovo() { setEditId(null); setForm(vazio); setModal(true) }
  function abrirEditar(f: Fornecedor) {
    setEditId(f.id)
    setForm({ nome: f.nome, contacto: f.contacto ?? '', email: f.email ?? '', notas: f.notas ?? '' })
    setModal(true)
  }

  async function guardar() {
    if (!form.nome.trim()) return
    setAGuardar(true)
    const dados = { nome: form.nome.trim(), contacto: form.contacto.trim() || null, email: form.email.trim() || null, notas: form.notas.trim() || null }
    if (editId) await atualizarFornecedor(editId, dados)
    else await criarFornecedor(dados)
    setAGuardar(false)
    setModal(false)
    carregar()
  }

  async function alternarAtivo(f: Fornecedor) {
    await atualizarFornecedor(f.id, { ativo: !f.ativo })
    carregar()
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--a4l-text-dark)' }}>Fornecedores</h1>
          <Link href="/compras" style={{ color: 'var(--a4l-text-light)', textDecoration: 'none', fontSize: 14 }}>← Pedidos de Compra</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <BotaoExportar nome="fornecedores" colunas={colunasExport} linhas={lista} />
          <button className="a4l-btn" onClick={abrirNovo}>+ Novo Fornecedor</button>
        </div>
      </div>

      {carregando ? (
        <p style={{ color: 'var(--a4l-text-light)', padding: 24, textAlign: 'center' }}>A carregar...</p>
      ) : (
        <div className="a4l-card" style={{ display: 'flex', flexDirection: 'column' }}>
          {lista.map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '0.5px solid var(--a4l-border)' }}>
              <div style={{ opacity: f.ativo ? 1 : 0.5 }}>
                <div style={{ fontWeight: 700, color: 'var(--a4l-text-dark)' }}>{f.nome} {!f.ativo && <span style={{ fontSize: 11, color: 'var(--a4l-text-light)' }}>(inativo)</span>}</div>
                <div style={{ fontSize: 12.5, color: 'var(--a4l-text-light)' }}>{[f.contacto, f.email].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="a4l-btn-ghost" onClick={() => abrirEditar(f)}>Editar</button>
                <button className="a4l-btn-ghost" onClick={() => alternarAtivo(f)}>{f.ativo ? 'Desativar' : 'Ativar'}</button>
              </div>
            </div>
          ))}
          {lista.length === 0 && <p style={{ color: 'var(--a4l-text-light)', fontSize: 13, padding: 8 }}>Sem fornecedores.</p>}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(false)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} className="a4l-card" style={{ width: '100%', maxWidth: 440 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--a4l-text-dark)', marginBottom: 14 }}>{editId ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
            {([['Nome', 'nome'], ['Contacto', 'contacto'], ['Email', 'email']] as const).map(([label, campo]) => (
              <div key={campo} style={{ marginBottom: 10 }}>
                <label style={lbl}>{label}{campo === 'nome' ? ' *' : ''}</label>
                <input className="a4l-input" value={form[campo]} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Notas</label>
              <textarea className="a4l-input" rows={2} value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="a4l-btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="a4l-btn" disabled={aGuardar || !form.nome.trim()} onClick={guardar}>{aGuardar ? 'A guardar...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--a4l-text-mid)', marginBottom: 4 }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(13,11,43,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
