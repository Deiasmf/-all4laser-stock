'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarNotasNaFase, concluirFase, type Fase } from '@/lib/neFluxo'
import type { NotaEncomenda } from '@/types/notaEncomenda'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Página de uma fase "simples" (preparação): lista as notas em curso e permite
// concluir cada uma (com notas opcionais), avançando o fluxo.
export default function NeFaseSimples({
  fase, titulo, botaoLabel, voltarHref, voltarLabel,
}: {
  fase: Fase
  titulo: string
  botaoLabel: string
  voltarHref: string
  voltarLabel: string
}) {
  const { session, perfil } = useAuth()
  const [notas, setNotas] = useState<NotaEncomenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<NotaEncomenda | null>(null)
  const [obs, setObs] = useState('')
  const [aGuardar, setAGuardar] = useState(false)

  async function carregar() {
    setNotas(await listarNotasNaFase(fase))
    setCarregando(false)
  }

  useEffect(() => {
    // setState corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  async function concluir() {
    if (!aberta) return
    if (!window.confirm('Concluir esta fase e avançar para a seguinte?')) return
    setAGuardar(true)
    const nome = perfil?.nome ?? perfil?.email ?? null
    const { error } = await concluirFase(aberta, fase, { id: session?.user.id ?? null, nome }, obs.trim() || null)
    setAGuardar(false)
    if (error) { alert('Erro: ' + error.message); return }
    setAberta(null)
    setObs('')
    carregar()
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>{titulo}</h1>
          <Link href={voltarHref} style={c.voltar}>← {voltarLabel}</Link>
        </div>
        <span style={c.contador}>{notas.length} em curso</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : notas.length === 0 ? (
        <p style={c.estado}>Não há equipamentos nesta fase.</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>NE</th>
                <th style={c.th}>Data</th>
                <th style={c.th}>Cliente</th>
                <th style={c.th}>País</th>
                <th style={c.th}>Equipamento</th>
                <th style={c.th}>SN</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} onClick={() => { setAberta(n); setObs('') }} style={c.tr}>
                  <td style={{ ...c.td, fontWeight: 700 }}>{n.numero ?? '—'}</td>
                  <td style={c.td}>{formatarData(n.data_pedido)}</td>
                  <td style={c.td}>{n.cliente_nome ?? '—'}</td>
                  <td style={c.td}>{n.pais_destino ?? '—'}</td>
                  <td style={c.td}>{n.equipamento_modelo ?? '—'}</td>
                  <td style={c.td}>{n.equipamento_sn ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberta && (
        <div style={c.backdrop} onClick={() => setAberta(null)}>
          <div style={c.painel} onClick={(e) => e.stopPropagation()}>
            <div style={c.painelTopo}>
              <strong>{aberta.numero}</strong>
              <button onClick={() => setAberta(null)} style={c.fechar} aria-label="Fechar">×</button>
            </div>
            <div style={c.linha}><span style={c.rot}>Equipamento</span><span>{aberta.equipamento_modelo ?? '—'} {aberta.equipamento_ano ?? ''}</span></div>
            <div style={c.linha}><span style={c.rot}>SN</span><span>{aberta.equipamento_sn ?? '—'}</span></div>
            <div style={c.linha}><span style={c.rot}>Cliente</span><span>{aberta.cliente_nome ?? '—'} ({aberta.pais_destino ?? '—'})</span></div>
            {aberta.detalhes_tecnicos && (
              <div style={c.linha}><span style={c.rot}>Detalhes</span><span>{aberta.detalhes_tecnicos}</span></div>
            )}
            <label style={c.campo}>
              <span style={c.rot}>Notas (opcional)</span>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} style={c.textarea} />
            </label>
            <button onClick={concluir} disabled={aGuardar} style={c.btnPrimario}>
              {aGuardar ? 'A guardar...' : botaoLabel}
            </button>
          </div>
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
  contador: { color: 'var(--muted)', fontSize: 14, alignSelf: 'center', whiteSpace: 'nowrap' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '12px 14px', color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 14px', color: 'var(--foreground)', whiteSpace: 'nowrap' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 },
  painel: { background: 'var(--surface)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '90vh', overflowY: 'auto' },
  painelTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 18, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  linha: { display: 'flex', gap: 10, fontSize: 14 },
  rot: { color: 'var(--muted)', minWidth: 92, fontWeight: 600 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 },
  textarea: { width: '100%', minHeight: 70, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', resize: 'vertical' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 6 },
}
