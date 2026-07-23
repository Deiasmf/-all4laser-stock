'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarFornecedores, moradaFornecedor } from '@/lib/fornecedores'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import type { Fornecedor } from '@/types/compras'

const colunasExport: ColunaExport<Fornecedor>[] = [
  { cabecalho: 'Nome', valor: (f) => f.nome },
  { cabecalho: 'NIF/VAT', valor: (f) => f.nif },
  { cabecalho: 'Morada', valor: (f) => moradaFornecedor(f) },
  { cabecalho: 'Telefone', valor: (f) => f.telefone },
  { cabecalho: 'Telemóvel', valor: (f) => f.telemovel },
  { cabecalho: 'Email', valor: (f) => f.email },
  { cabecalho: 'Email reparações', valor: (f) => f.email_reparacoes },
  { cabecalho: 'Pessoa de contacto', valor: (f) => f.pessoa_contacto },
  { cabecalho: 'IBAN', valor: (f) => f.iban },
  { cabecalho: 'Ativo', valor: (f) => (f.ativo ? 'Sim' : 'Não') },
]

export default function FornecedoresPage() {
  const [lista, setLista] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pesquisa, setPesquisa] = useState('')

  useEffect(() => { listarFornecedores().then(setLista).finally(() => setCarregando(false)) }, [])

  const filtrados = useMemo(() => {
    const t = pesquisa.trim().toLowerCase()
    if (!t) return lista
    return lista.filter((f) => f.nome.toLowerCase().includes(t) || (f.nif ?? '').toLowerCase().includes(t))
  }, [lista, pesquisa])

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--a4l-text-dark)' }}>Fornecedores</h1>
          <Link href="/compras" style={{ color: 'var(--a4l-text-light)', textDecoration: 'none', fontSize: 14 }}>← Pedidos de Compra</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <BotaoExportar nome="fornecedores" colunas={colunasExport} linhas={filtrados} />
          <Link href="/compras/fornecedores/novo" className="a4l-btn">+ Novo Fornecedor</Link>
        </div>
      </div>

      <input
        className="a4l-input"
        placeholder="Pesquisar por nome ou NIF..."
        value={pesquisa}
        onChange={(e) => setPesquisa(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {carregando ? (
        <p style={{ color: 'var(--a4l-text-light)', padding: 24, textAlign: 'center' }}>A carregar...</p>
      ) : (
        <div className="a4l-card" style={{ display: 'flex', flexDirection: 'column' }}>
          {filtrados.map((f) => {
            const contacto = [f.telefone, f.telemovel, f.email].filter(Boolean).join(' · ')
            const local = [f.localidade, f.pais].filter(Boolean).join(', ')
            return (
              <Link
                key={f.id}
                href={`/compras/fornecedores/${f.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: '0.5px solid var(--a4l-border)', textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ opacity: f.ativo ? 1 : 0.5 }}>
                  <div style={{ fontWeight: 700, color: 'var(--a4l-text-dark)' }}>
                    {f.nome} {!f.ativo && <span style={{ fontSize: 11, color: 'var(--a4l-text-light)' }}>(inativo)</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--a4l-text-light)' }}>
                    {[f.nif ? `NIF ${f.nif}` : '', local, contacto].filter(Boolean).join('  ·  ') || '—'}
                  </div>
                </div>
                <span style={{ color: 'var(--a4l-text-light)', fontSize: 18 }}>›</span>
              </Link>
            )
          })}
          {filtrados.length === 0 && <p style={{ color: 'var(--a4l-text-light)', fontSize: 13, padding: 8 }}>Sem fornecedores.</p>}
        </div>
      )}
    </div>
  )
}
