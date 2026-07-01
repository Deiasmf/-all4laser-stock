'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarClientesCompleto } from '@/lib/clientes'
import type { Cliente } from '@/types/cliente'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'

// Colunas para exportação (espelham a tabela de clientes)
const colunasExport: ColunaExport<Cliente>[] = [
  { cabecalho: 'Nome', valor: (c) => c.nome },
  { cabecalho: 'Tipo', valor: (c) => c.tipo },
  { cabecalho: 'Contacto', valor: (c) => c.contacto_nome },
  { cabecalho: 'Cidade', valor: (c) => c.cidade },
  { cabecalho: 'Email', valor: (c) => c.email },
  { cabecalho: 'Telefone', valor: (c) => c.telefone },
  { cabecalho: 'País', valor: (c) => c.pais },
  { cabecalho: 'NIF', valor: (c) => c.nif },
]

export default function ClientesPage() {
  const router = useRouter()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pesquisa, setPesquisa] = useState('')
  const [soSemEmail, setSoSemEmail] = useState(false)

  useEffect(() => {
    let activo = true
    listarClientesCompleto()
      .then((d) => { if (activo) setClientes(d) })
      .catch((e) => { if (activo) setErro(String(e)) })
      .finally(() => { if (activo) setCarregando(false) })
    return () => { activo = false }
  }, [])

  const semEmail = useMemo(() => clientes.filter((c) => !c.email).length, [clientes])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return clientes.filter((c) => {
      if (soSemEmail && c.email) return false
      if (q) {
        const alvo = `${c.nome} ${c.cidade ?? ''} ${c.email ?? ''} ${c.telefone ?? ''} ${c.contacto_nome ?? ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
  }, [clientes, pesquisa, soSemEmail])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Clientes</h1>
          <Link href="/comercial" style={c.voltar}>← Comercial</Link>
        </div>
        <Link href="/comercial/clientes/novo" style={c.btnNovo}>+ Novo cliente</Link>
      </div>

      <div style={c.filtros}>
        <input
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          placeholder="Pesquisar por nome, cidade, email ou telefone..."
          style={{ ...c.input, flex: 1, minWidth: 220 }}
        />
        <button
          onClick={() => setSoSemEmail((v) => !v)}
          style={{ ...c.pill, ...(soSemEmail ? c.pillOn : {}) }}
          title="Mostrar só clientes sem email definido"
        >
          ✉️ Sem email · {semEmail}
        </button>
        <BotaoExportar nome="clientes" colunas={colunasExport} linhas={filtrados} />
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 14, alignSelf: 'center' }}>
          {filtrados.length} de {clientes.length}
        </span>
      </div>

      {erro ? (
        <p style={{ ...c.estado, color: 'var(--danger)' }}>Não foi possível carregar os clientes. {erro}</p>
      ) : carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>{clientes.length === 0 ? 'Ainda não há clientes. Cria o primeiro.' : 'Nenhum cliente corresponde à pesquisa.'}</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>Nome</th>
                <th style={c.th}>Tipo</th>
                <th style={c.th}>Cidade</th>
                <th style={c.th}>Email</th>
                <th style={c.th}>Telefone</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((cl) => (
                <tr key={cl.id} onClick={() => router.push(`/comercial/clientes/${cl.id}`)} style={c.tr}>
                  <td style={{ ...c.td, fontWeight: 700 }}>{cl.nome}</td>
                  <td style={c.td}>{cl.tipo ?? '—'}</td>
                  <td style={c.td}>{cl.cidade ?? '—'}</td>
                  <td style={c.td}>
                    {cl.email
                      ? cl.email
                      : <span style={c.semEmail}>⚠ sem email</span>}
                  </td>
                  <td style={c.td}>{cl.telefone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  btnNovo: { background: 'var(--primary)', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, whiteSpace: 'nowrap' },
  filtros: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit' },
  pill: { border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'transparent', color: 'var(--foreground)' },
  pillOn: { background: '#fbecea', borderColor: 'var(--danger)', color: 'var(--danger)' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '12px 14px', color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 14px', color: 'var(--foreground)', whiteSpace: 'nowrap' },
  semEmail: { color: 'var(--danger)', fontWeight: 600, fontSize: 13 },
}
