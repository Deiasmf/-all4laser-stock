'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarNotas } from '@/lib/notasEncomenda'
import {
  ESTADO_NOTA_CONFIG, ESTADO_NOTA_OPCOES,
  type NotaEncomenda, type EstadoNota,
} from '@/types/notaEncomenda'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'

const STORAGE_KEY = 'notas-encomenda-filtros'

// Lê os filtros guardados (uma vez, no arranque). Tolerante a dados inválidos.
function lerFiltrosGuardados(): { estado?: string; mes?: string; pesquisa?: string } {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Colunas para exportação (espelham a tabela de notas de encomenda)
const colunasExport: ColunaExport<NotaEncomenda>[] = [
  { cabecalho: 'Número', valor: (n) => n.numero },
  { cabecalho: 'Data', valor: (n) => formatarData(n.data_pedido) },
  { cabecalho: 'Cliente', valor: (n) => n.cliente_nome },
  { cabecalho: 'País', valor: (n) => n.pais_destino },
  { cabecalho: 'Equipamento', valor: (n) => n.equipamento_modelo },
  { cabecalho: 'SN', valor: (n) => n.equipamento_sn },
  { cabecalho: 'Estado', valor: (n) => ESTADO_NOTA_CONFIG[n.estado].label },
]

function EstadoTag({ estado }: { estado: EstadoNota }) {
  const cfg = ESTADO_NOTA_CONFIG[estado]
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

export default function NotasEncomendaPage() {
  const router = useRouter()
  const [notas, setNotas] = useState<NotaEncomenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // Valores iniciais restaurados do sessionStorage (lidos uma só vez no arranque).
  const [guardados] = useState(lerFiltrosGuardados)
  const [fEstado, setFEstado] = useState(guardados.estado ?? '')
  const [fMes, setFMes] = useState(guardados.mes ?? '') // formato YYYY-MM
  const [pesquisa, setPesquisa] = useState(guardados.pesquisa ?? '')

  // Carrega notas
  useEffect(() => {
    let activo = true
    listarNotas()
      .then((dados) => { if (activo) setNotas(dados) })
      .catch((e) => { if (activo) setErro(String(e)) })
      .finally(() => { if (activo) setCarregando(false) })
    return () => { activo = false }
  }, [])

  // Persiste filtros sempre que mudam
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ estado: fEstado, mes: fMes, pesquisa }))
    } catch { /* ignora */ }
  }, [fEstado, fMes, pesquisa])

  const contagens = useMemo(() => {
    const m: Record<string, number> = {}
    for (const n of notas) m[n.estado] = (m[n.estado] ?? 0) + 1
    return m
  }, [notas])

  const filtradas = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return notas.filter((n) => {
      if (fEstado && n.estado !== fEstado) return false
      if (fMes && (n.data_pedido ?? '').slice(0, 7) !== fMes) return false
      if (q) {
        const alvo = `${n.numero ?? ''} ${n.cliente_nome ?? ''} ${n.equipamento_sn ?? ''} ${n.equipamento_modelo ?? ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
  }, [notas, fEstado, fMes, pesquisa])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Notas de Encomenda</h1>
          <Link href="/comercial" style={c.voltar}>← Comercial</Link>
        </div>
        <Link href="/comercial/notas-encomenda/nova" style={c.btnNova}>+ Nova Nota de Encomenda</Link>
      </div>

      <div style={c.resumoLinha}>
        {ESTADO_NOTA_OPCOES.map((e) => (
          <button
            key={e}
            onClick={() => setFEstado(fEstado === e ? '' : e)}
            style={{
              ...c.pill,
              color: ESTADO_NOTA_CONFIG[e].color,
              background: fEstado === e ? ESTADO_NOTA_CONFIG[e].bg : 'transparent',
              borderColor: fEstado === e ? ESTADO_NOTA_CONFIG[e].color : 'var(--border)',
            }}
          >
            {ESTADO_NOTA_CONFIG[e].label} · {contagens[e] ?? 0}
          </button>
        ))}
      </div>

      <div style={c.filtros}>
        <input
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          placeholder="Pesquisar por nº, cliente ou SN..."
          style={{ ...c.input, flex: 1, minWidth: 220 }}
        />
        <input type="month" value={fMes} onChange={(e) => setFMes(e.target.value)} style={c.input} />
        {(fEstado || fMes || pesquisa) && (
          <button onClick={() => { setFEstado(''); setFMes(''); setPesquisa('') }} style={c.limpar}>Limpar</button>
        )}
        <BotaoExportar nome="notas-encomenda" colunas={colunasExport} linhas={filtradas} />
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 14, alignSelf: 'center' }}>
          {filtradas.length} de {notas.length}
        </span>
      </div>

      {erro ? (
        <p style={{ ...c.estado, color: 'var(--danger)' }}>Não foi possível carregar as notas de encomenda. {erro}</p>
      ) : carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <p style={c.estado}>{notas.length === 0 ? 'Ainda não há notas de encomenda. Cria a primeira.' : 'Nenhuma nota corresponde aos filtros.'}</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>Número</th>
                <th style={c.th}>Data</th>
                <th style={c.th}>Cliente</th>
                <th style={c.th}>País</th>
                <th style={c.th}>Equipamento</th>
                <th style={c.th}>SN</th>
                <th style={c.th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((n) => (
                <tr key={n.id} onClick={() => router.push(`/comercial/notas-encomenda/${n.id}`)} style={c.tr}>
                  <td style={{ ...c.td, fontWeight: 700 }}>{n.numero ?? '—'}</td>
                  <td style={c.td}>{formatarData(n.data_pedido)}</td>
                  <td style={c.td}>{n.cliente_nome ?? '—'}</td>
                  <td style={c.td}>{n.pais_destino ?? '—'}</td>
                  <td style={c.td}>{n.equipamento_modelo ?? '—'}</td>
                  <td style={c.td}>{n.equipamento_sn ?? '—'}</td>
                  <td style={c.td}><EstadoTag estado={n.estado} /></td>
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
  btnNova: { background: 'var(--primary)', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, whiteSpace: 'nowrap' },
  resumoLinha: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  pill: { border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  filtros: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit' },
  limpar: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '0 14px', fontWeight: 600, cursor: 'pointer' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '12px 14px', color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 14px', color: 'var(--foreground)', whiteSpace: 'nowrap' },
}
