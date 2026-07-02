'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterMatch, listarMovimentosDoMatch, fecharMatch, atualizarMovimento,
} from '@/lib/recepcao'
import type { RecepcaoMatch, RecepcaoMovimento } from '@/types/recepcao'
import { matchStatusInfo } from '@/types/recepcao'
import RecepcaoMovimentoModal from '@/components/RecepcaoMovimentoModal'

function qtd(m: RecepcaoMovimento) {
  return m.quantidade ?? 1
}

export default function EncomendasMatchPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { isAdmin } = useAuth()

  const [match, setMatch] = useState<RecepcaoMatch | null>(null)
  const [movimentos, setMovimentos] = useState<RecepcaoMovimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)

  const recarregar = useCallback(async () => {
    setMatch(await obterMatch(id))
    setMovimentos(await listarMovimentosDoMatch(id))
    setCarregando(false)
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregar()
  }, [recarregar])

  const enviado = movimentos.filter((m) => m.tipo === 'saida').reduce((s, m) => s + qtd(m), 0)
  const recebido = movimentos.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + qtd(m), 0)
  const pendente = Math.max(0, enviado - recebido)

  async function aoGravar(m: RecepcaoMovimento) {
    setModalAberto(false)
    await atualizarMovimento(m.id, { match_id: id })
    await recarregar()
  }

  async function fechar() {
    if (!confirm('Fechar este match? Todos os movimentos ficam marcados como fechados.')) return
    await fecharMatch(id)
    await recarregar()
  }

  if (carregando) return <main style={c.page}><p style={c.nota}>A carregar...</p></main>
  if (!match) return (
    <main style={c.page}>
      <div style={c.cabecalho}><h1 style={c.titulo}>Match</h1><Link href="/logistico/encomendas" style={c.voltar}>← Voltar</Link></div>
      <p style={c.nota}>Match não encontrado.</p>
    </main>
  )

  const info = matchStatusInfo(match.estado)
  const clienteDeveDevolucao = match.contraparte_tipo === 'cliente' && pendente > 0
  const resolvido = pendente === 0 && movimentos.length > 0

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          {match.numero && <div style={c.numeroTopo}>{match.numero}</div>}
          <h1 style={c.titulo}>{match.contraparte || 'Match'}</h1>
        </div>
        <Link href="/logistico/encomendas" style={c.voltar}>← Voltar</Link>
      </div>

      <div style={c.badgeRow}>
        <span style={{ ...c.badge, background: info.fundo, color: info.cor }}>{info.label}</span>
        {clienteDeveDevolucao && <span style={c.badgeDevolucao}>⚠️ Cliente deve devolução</span>}
      </div>

      <section style={c.card}>
        <div style={c.cardTitulo}>Resumo</div>
        <div style={c.resumoGrid}>
          <div style={c.resumoItem}><div style={{ ...c.resumoNum, color: '#c62828' }}>{enviado}</div><div style={c.resumoLbl}>Enviado</div></div>
          <div style={c.resumoItem}><div style={{ ...c.resumoNum, color: '#159a4a' }}>{recebido}</div><div style={c.resumoLbl}>Recebido</div></div>
          <div style={c.resumoItem}><div style={{ ...c.resumoNum, color: '#d4820a' }}>{pendente}</div><div style={c.resumoLbl}>Pendente</div></div>
        </div>
      </section>

      {isAdmin && (
        <div style={c.acoes}>
          <button style={c.btnPrimario} onClick={() => setModalAberto(true)}>+ Registar entrada manual</button>
          {resolvido && match.estado !== 'fechado' && (
            <button style={c.btnFechar} onClick={fechar}>✓ Fechar match</button>
          )}
        </div>
      )}

      <section style={c.card}>
        <div style={c.cardTitulo}>Movimentos ({movimentos.length})</div>
        {movimentos.length === 0 ? (
          <p style={c.nota}>Sem movimentos neste match.</p>
        ) : (
          <div style={c.timeline}>
            {movimentos.map((m) => (
              <div key={m.id} style={c.mov}>
                <span style={{ ...c.pontoTipo, background: m.tipo === 'entrada' ? '#159a4a' : '#c62828' }}>
                  {m.tipo === 'entrada' ? '↓' : '↑'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={c.movTopo}>
                    <strong>{m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</strong>
                    <span style={c.movData}>{m.data_movimento}</span>
                  </div>
                  <div style={c.movDesc}>
                    {m.descricao}{qtd(m) !== 1 ? ` × ${qtd(m)}` : ''}
                    {m.serial_numbers && m.serial_numbers.length > 0 ? ` · S/N ${m.serial_numbers.join(', ')}` : ''}
                    {m.referencia_numero ? ` · ${m.referencia_numero}` : ''}
                  </div>
                  {m.notas && <div style={c.nota}>{m.notas}</div>}
                  {m.criado_por_nome && <div style={c.nota}>— {m.criado_por_nome}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {match.notas && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Notas</div>
          <p style={{ fontSize: 14 }}>{match.notas}</p>
        </section>
      )}

      <RecepcaoMovimentoModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onGravado={aoGravar}
        prefill={{ tipo: 'entrada', origem_destino: match.contraparte ?? '' }}
      />
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 640, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  numeroTopo: { fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: 'var(--primary)', marginBottom: 2 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' },
  badgeRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
  badge: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 12px' },
  badgeDevolucao: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 12px', background: '#fff3cd', color: '#8a5a00', border: '1px solid #f0c884' },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitulo: { fontWeight: 700, color: 'var(--primary)', marginBottom: 10 },
  resumoGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  resumoItem: { textAlign: 'center', background: '#fafafa', borderRadius: 10, padding: '12px 8px' },
  resumoNum: { fontSize: 26, fontWeight: 800 },
  resumoLbl: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  acoes: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  btnFechar: { background: '#159a4a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  timeline: { display: 'flex', flexDirection: 'column', gap: 12 },
  mov: { display: 'flex', gap: 12, paddingBottom: 12, borderBottom: '1px solid #f6f6f6' },
  pontoTipo: { flexShrink: 0, width: 26, height: 26, borderRadius: 999, color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 },
  movTopo: { display: 'flex', gap: 8, alignItems: 'center' },
  movData: { fontSize: 12.5, color: 'var(--muted)' },
  movDesc: { fontSize: 14, marginTop: 2 },
  nota: { fontSize: 13, color: 'var(--muted)', marginTop: 2 },
}
