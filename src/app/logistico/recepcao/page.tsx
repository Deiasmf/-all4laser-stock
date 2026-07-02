'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { listarMovimentos, criarMatch, atualizarMovimento } from '@/lib/recepcao'
import type { RecepcaoMovimento } from '@/types/recepcao'
import { matchStatusInfo, REFERENCIA_TIPO_LABEL } from '@/types/recepcao'
import RecepcaoMovimentoModal from '@/components/RecepcaoMovimentoModal'

const CHAVE_FILTROS = 'recepcao_filtros'

function mesAtual() {
  return new Date().toISOString().slice(0, 7)
}

function diasDesde(data: string): number {
  const d = new Date(data + 'T00:00:00')
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function TipoBadge({ tipo }: { tipo: string }) {
  const entrada = tipo === 'entrada'
  return (
    <span style={{ ...c.tipoBadge, background: entrada ? '#159a4a' : '#c62828' }}>
      {entrada ? '↓ ENTRADA' : '↑ SAÍDA'}
    </span>
  )
}

function MatchBadge({ status }: { status: string | null }) {
  const info = matchStatusInfo(status)
  return <span style={{ ...c.matchBadge, background: info.fundo, color: info.cor }}>{info.label}</span>
}

export default function RecepcaoPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [movimentos, setMovimentos] = useState<RecepcaoMovimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)

  // filtros
  const [pesquisa, setPesquisa] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')
  const [fOrigem, setFOrigem] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [filtrosCarregados, setFiltrosCarregados] = useState(false)

  // matches pendentes (expandir por contraparte)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})

  async function carregar() {
    const lista = await listarMovimentos()
    setMovimentos(lista)
    setCarregando(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    try {
      const raw = sessionStorage.getItem(CHAVE_FILTROS)
      if (raw) {
        const f = JSON.parse(raw)
        setPesquisa(f.pesquisa ?? '')
        setFTipo(f.fTipo ?? '')
        setFDe(f.fDe ?? '')
        setFAte(f.fAte ?? '')
        setFOrigem(f.fOrigem ?? '')
        setFStatus(f.fStatus ?? '')
      }
    } catch { /* filtros inválidos */ }
    setFiltrosCarregados(true)
  }, [])

  useEffect(() => {
    if (!filtrosCarregados) return
    sessionStorage.setItem(CHAVE_FILTROS, JSON.stringify({ pesquisa, fTipo, fDe, fAte, fOrigem, fStatus }))
  }, [filtrosCarregados, pesquisa, fTipo, fDe, fAte, fOrigem, fStatus])

  // ── Cards de resumo (mês atual) ──
  const resumo = useMemo(() => {
    const mes = mesAtual()
    let entradas = 0, saidas = 0, pendentes = 0
    for (const m of movimentos) {
      const noMes = (m.data_movimento ?? '').slice(0, 7) === mes
      if (noMes && m.tipo === 'entrada') entradas++
      if (noMes && m.tipo === 'saida') saidas++
      if (m.match_status !== 'fechado') pendentes++
    }
    return { entradas, saidas, pendentes }
  }, [movimentos])

  const origensOpc = useMemo(
    () => Array.from(new Set(movimentos.map((m) => m.origem_destino).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt')),
    [movimentos]
  )

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return movimentos
      .filter((m) => !fTipo || m.tipo === fTipo)
      .filter((m) => !fOrigem || m.origem_destino === fOrigem)
      .filter((m) => !fStatus || (m.match_status ?? 'pendente') === fStatus)
      .filter((m) => !fDe || (m.data_movimento ?? '') >= fDe)
      .filter((m) => !fAte || (m.data_movimento ?? '') <= fAte)
      .filter((m) =>
        !q ||
        (m.descricao ?? '').toLowerCase().includes(q) ||
        (m.origem_destino ?? '').toLowerCase().includes(q) ||
        (m.referencia_numero ?? '').toLowerCase().includes(q) ||
        (m.equipamento_sn ?? '').toLowerCase().includes(q) ||
        (m.serial_numbers ?? []).some((sn) => sn.toLowerCase().includes(q))
      )
  }, [movimentos, pesquisa, fTipo, fDe, fAte, fOrigem, fStatus])

  const LIMITE = 300
  const visiveis = filtrados.slice(0, LIMITE)

  // ── Matches pendentes agrupados por contraparte ──
  const gruposPendentes = useMemo(() => {
    const map = new Map<string, RecepcaoMovimento[]>()
    for (const m of movimentos) {
      if (m.match_status === 'fechado') continue
      const k = m.origem_destino || '—'
      const arr = map.get(k) ?? []
      arr.push(m)
      map.set(k, arr)
    }
    return Array.from(map.entries())
      .map(([contraparte, movs]) => {
        const saidas = movs.filter((m) => m.tipo === 'saida').length
        const entradas = movs.filter((m) => m.tipo === 'entrada').length
        const maisAntigo = movs.reduce((min, m) => (m.data_movimento < min ? m.data_movimento : min), movs[0].data_movimento)
        return { contraparte, movs, saidas, entradas, pendentes: movs.length, antigo: diasDesde(maisAntigo) }
      })
      .sort((a, b) => b.antigo - a.antigo)
  }, [movimentos])

  async function agruparEmMatch(contraparte: string, movs: RecepcaoMovimento[]) {
    const primeiro = movs[0]
    const { data } = await criarMatch({
      descricao: `Movimentos com ${contraparte}`,
      contraparte,
      contraparte_tipo: primeiro?.referencia_tipo === 'reparacao' ? 'fornecedor_reparacao' : 'cliente',
      estado: 'pendente',
    })
    if (!data) return
    await Promise.all(movs.map((m) => atualizarMovimento(m.id, { match_id: data.id })))
    router.push(`/logistico/recepcao/match/${data.id}`)
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Receção de Encomendas</h1>
        <Link href="/logistico" style={c.voltar}>← Logística</Link>
      </div>

      {/* Cards de resumo */}
      <div style={c.cards}>
        <div style={{ ...c.card, borderTop: '3px solid #159a4a' }}>
          <div style={c.cardNum}>{resumo.entradas}</div>
          <div style={c.cardLbl}>Entradas este mês</div>
        </div>
        <div style={{ ...c.card, borderTop: '3px solid #c62828' }}>
          <div style={c.cardNum}>{resumo.saidas}</div>
          <div style={c.cardLbl}>Saídas este mês</div>
        </div>
        <div style={{ ...c.card, borderTop: '3px solid #d4820a' }}>
          <div style={c.cardNum}>{resumo.pendentes}</div>
          <div style={c.cardLbl}>Matches pendentes</div>
        </div>
      </div>

      {/* Ações */}
      <div style={c.acoes}>
        <button style={c.btnPrimario} onClick={() => setModalAberto(true)}>+ Registar movimento manual</button>
        <Link href="/logistico/recepcao/scan" style={c.btnScan}>📷 Scan QR</Link>
      </div>

      {/* Filtros */}
      <div style={c.filtros}>
        <input
          placeholder="Procurar por SN, descrição, referência..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.input}
        />
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={c.select}>
          <option value="">Entradas e saídas</option>
          <option value="entrada">Só entradas</option>
          <option value="saida">Só saídas</option>
        </select>
        <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} style={c.select}>
          <option value="">Toda a origem/destino</option>
          {origensOpc.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          <option value="pendente">Pendente</option>
          <option value="parcial">Parcial</option>
          <option value="fechado">Fechado</option>
        </select>
        <label style={c.dataLbl}>De <input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} style={c.dataInput} /></label>
        <label style={c.dataLbl}>Até <input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} style={c.dataInput} /></label>
      </div>

      <div style={c.resumoLinha}>
        <span>{filtrados.length} movimento(s)</span>
        {filtrados.length > LIMITE && <span style={{ fontSize: 13, color: 'var(--muted)' }}>a mostrar {LIMITE} — refina a pesquisa</span>}
      </div>

      {/* Lista cronológica */}
      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem movimentos.</p>
      ) : (
        <div style={c.lista}>
          {visiveis.map((m) => (
            <div key={m.id} style={{ ...c.linha, background: m.tipo === 'entrada' ? '#eafaf0' : '#fdecec' }}>
              <div style={c.linhaTopo}>
                <TipoBadge tipo={m.tipo} />
                <span style={c.data}>{m.data_movimento}</span>
                <span style={{ flex: 1 }} />
                <MatchBadge status={m.match_status} />
              </div>
              <div style={c.descricao}>
                {m.descricao}
                {m.quantidade && m.quantidade !== 1 ? <span style={c.qtd}> × {m.quantidade}</span> : null}
              </div>
              <div style={c.meta}>
                <span><strong>{m.tipo === 'entrada' ? 'Origem' : 'Destino'}:</strong> {m.origem_destino}</span>
                {m.serial_numbers && m.serial_numbers.length > 0 && <span> · S/N: {m.serial_numbers.join(', ')}</span>}
                {m.equipamento_sn && <span> · Equip.: {m.equipamento_sn}</span>}
                {m.referencia_numero && (
                  <span> · Ref.: {m.referencia_numero}
                    {m.referencia_tipo ? ` (${REFERENCIA_TIPO_LABEL[m.referencia_tipo]})` : ''}</span>
                )}
                {m.qr_lido && <span style={c.qrTag}>📷 QR</span>}
              </div>
              {m.notas && <div style={c.notas}>{m.notas}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Matches pendentes por contraparte */}
      <section style={{ marginTop: 28 }}>
        <h2 style={c.subtitulo}>Matches pendentes</h2>
        {gruposPendentes.length === 0 ? (
          <p style={c.estado}>Tudo fechado — sem pendências. 🎉</p>
        ) : (
          <div style={c.gruposWrap}>
            {gruposPendentes.map((g) => {
              const aberto = !!expandido[g.contraparte]
              const atrasado = g.antigo > 30
              return (
                <div key={g.contraparte} style={c.grupo}>
                  <button style={c.grupoBtn} onClick={() => setExpandido((e) => ({ ...e, [g.contraparte]: !aberto }))}>
                    <span style={{ ...c.chevron, transform: aberto ? 'rotate(90deg)' : 'none' }}>▸</span>
                    <span style={{ fontWeight: 700 }}>{g.contraparte}</span>
                    <span style={c.grupoResumo}>{g.saidas} saídas · {g.entradas} entradas · {g.pendentes} pendentes</span>
                    {atrasado && <span style={c.badgeAtraso}>+30 dias</span>}
                  </button>
                  {aberto && (
                    <div style={c.grupoCorpo}>
                      {g.movs.map((m) => (
                        <div key={m.id} style={c.grupoMov}>
                          <TipoBadge tipo={m.tipo} />
                          <span style={c.data}>{m.data_movimento}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>{m.descricao}</span>
                          <MatchBadge status={m.match_status} />
                        </div>
                      ))}
                      <div style={c.grupoAcoes}>
                        <button style={c.btnGhost} onClick={() => agruparEmMatch(g.contraparte, g.movs)}>Agrupar em match</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <RecepcaoMovimentoModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onGravado={(m) => { setModalAberto(false); setMovimentos((prev) => [m, ...prev]) }}
      />

      <p style={c.dica}>Regista aqui todas as entradas e saídas de peças. Usa o Scan QR no telemóvel para receções rápidas.</p>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' },
  cardNum: { fontSize: 30, fontWeight: 800, color: 'var(--primary)' },
  cardLbl: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  acoes: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  btnScan: { background: '#1b1b2e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: { flex: 1, minWidth: 200, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  dataLbl: { fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 },
  dataInput: { padding: 8, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  resumoLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  linha: { border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' },
  linhaTopo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  tipoBadge: { fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px', color: '#fff', whiteSpace: 'nowrap' },
  matchBadge: { fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  data: { fontSize: 12.5, color: 'var(--muted)' },
  descricao: { fontWeight: 600, fontSize: 14.5 },
  qtd: { color: 'var(--muted)', fontWeight: 700 },
  meta: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 2 },
  qrTag: { marginLeft: 6, fontWeight: 700, color: 'var(--primary-dark)' },
  notas: { fontSize: 12.5, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' },
  subtitulo: { fontSize: 17, fontWeight: 700, color: 'var(--primary)', marginBottom: 10 },
  gruposWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  grupo: { border: '1px solid var(--border)', borderRadius: 10, background: '#fff', overflow: 'hidden' },
  grupoBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: '#fff', border: 'none', padding: 12, cursor: 'pointer', fontSize: 14, flexWrap: 'wrap' },
  chevron: { display: 'inline-block', fontSize: 12, color: 'var(--muted)', transition: 'transform 0.15s' },
  grupoResumo: { fontSize: 12.5, color: 'var(--muted)', marginLeft: 'auto' },
  badgeAtraso: { fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px', color: '#fff', background: '#c62828' },
  grupoCorpo: { padding: 12, borderTop: '1px solid #f2f2f2', background: '#fafafa' },
  grupoMov: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 },
  grupoAcoes: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 20, textAlign: 'center' },
}
