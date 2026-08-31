'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { listarTabelas, criarTabela, eliminarTabela } from '@/lib/tabelasFinanceiras'
import { formatarData, type TabelaFinanceira } from '@/types/tabelaFinanceira'

export default function TabelasFinanceirasPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [tabelas, setTabelas] = useState<TabelaFinanceira[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aCriar, setACriar] = useState(false)
  const [pesquisa, setPesquisa] = useState('')

  async function carregar() {
    setTabelas(await listarTabelas())
    setCarregando(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [])

  async function nova() {
    setACriar(true)
    const { data, error } = await criarTabela('Nova tabela', { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setACriar(false)
    if (error || !data) { alert('Não foi possível criar a tabela: ' + (error?.message ?? '')); return }
    router.push(`/financeiro/tabelas/${(data as TabelaFinanceira).id}`)
  }

  async function apagar(t: TabelaFinanceira) {
    if (!confirm(`Apagar a tabela "${t.nome}"? Esta ação não pode ser revertida.`)) return
    const { error } = await eliminarTabela(t.id)
    if (error) { alert('Não foi possível apagar: ' + error.message); return }
    setTabelas((prev) => prev.filter((x) => x.id !== t.id))
  }

  const q = pesquisa.trim().toLowerCase()
  const filtradas = q
    ? tabelas.filter((t) => t.nome.toLowerCase().includes(q) || (t.criado_por_nome ?? '').toLowerCase().includes(q))
    : tabelas

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>📊 Folhas de Cálculo</h1>
          <p style={c.sub}>Cria as tuas próprias tabelas do zero — guarda, exporta (Excel/PDF), anexa e envia.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button style={c.btnPrimario} onClick={nova} disabled={aCriar}>{aCriar ? 'A criar...' : '+ Nova tabela'}</button>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
        </div>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar por nome..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={{ ...c.input, flex: 1, minWidth: 200 }}
        />
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <div style={c.vazio}>
          <p style={{ fontSize: 40, marginBottom: 8 }}>📊</p>
          <p>Ainda não há tabelas. Clica em <strong>“+ Nova tabela”</strong> para criar a primeira.</p>
        </div>
      ) : (
        <div style={c.grelha}>
          {filtradas.map((t) => (
            <div key={t.id} style={c.cartao}>
              <Link href={`/financeiro/tabelas/${t.id}`} style={c.cartaoLink}>
                <span style={c.cartaoNome}>{t.nome}</span>
                <span style={c.cartaoMeta}>
                  {t.colunas.length} coluna(s) · {t.linhas.length} linha(s)
                </span>
                <span style={c.cartaoMeta}>Atualizada {formatarData(t.updated_at)}</span>
                {t.ficheiro_caminho && <span style={c.anexoTag}>📎 anexo</span>}
              </Link>
              <button style={c.btnApagar} onClick={() => apagar(t)} title="Apagar tabela">🗑</button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 2 },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  filtros: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  estado: { color: 'var(--muted)', padding: 8 },
  vazio: { textAlign: 'center', color: 'var(--muted)', padding: 40, background: '#fff', border: '1px dashed var(--border)', borderRadius: 12 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  cartao: { position: 'relative', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 4 },
  cartaoLink: { display: 'flex', flexDirection: 'column', gap: 4, padding: 14, textDecoration: 'none', color: 'var(--foreground)' },
  cartaoNome: { fontSize: 16, fontWeight: 700, color: 'var(--primary)', paddingRight: 24 },
  cartaoMeta: { fontSize: 12.5, color: 'var(--muted)' },
  anexoTag: { fontSize: 11, fontWeight: 700, color: 'var(--primary-dark, #3730A3)', marginTop: 2 },
  btnApagar: { position: 'absolute', top: 10, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15, opacity: 0.6, lineHeight: 1 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
}
