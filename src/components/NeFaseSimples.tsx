'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { listarNotasNaFase, concluirFase, type Fase } from '@/lib/neFluxo'
import { folhasDaNota, temFolhaConcluida } from '@/lib/folhasObra'
import { ESTADO_FOLHA_CONFIG, type FolhaObra } from '@/types/folhaObra'
import NotaDetalhe from '@/components/NotaDetalhe'
import type { NotaEncomenda } from '@/types/notaEncomenda'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Página de uma fase "simples" (preparação): lista as notas em curso e permite
// concluir cada uma (com notas opcionais), avançando o fluxo. Quando
// `exigeFolhaObra`, só conclui depois de existir uma folha de obra concluída
// ligada à nota (fase técnica).
export default function NeFaseSimples({
  fase, titulo, botaoLabel, voltarHref, voltarLabel, exigeFolhaObra = false,
}: {
  fase: Fase
  titulo: string
  botaoLabel: string
  voltarHref: string
  voltarLabel: string
  exigeFolhaObra?: boolean
}) {
  const { session, perfil } = useAuth()
  const router = useRouter()
  const [notas, setNotas] = useState<NotaEncomenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<NotaEncomenda | null>(null)
  const [obs, setObs] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [folhas, setFolhas] = useState<FolhaObra[]>([])
  const [folhaOk, setFolhaOk] = useState(false)

  async function carregar() {
    setNotas(await listarNotasNaFase(fase))
    setCarregando(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  async function abrir(n: NotaEncomenda) {
    setAberta(n)
    setObs('')
    if (exigeFolhaObra) {
      setFolhas(await folhasDaNota(n.id))
      setFolhaOk(await temFolhaConcluida(n.id))
    }
  }

  async function concluir() {
    if (!aberta) return
    if (exigeFolhaObra && !folhaOk) return
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
                <th style={c.th}>NE</th><th style={c.th}>Data</th><th style={c.th}>Cliente</th>
                <th style={c.th}>País</th><th style={c.th}>Equipamento</th><th style={c.th}>SN</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} onClick={() => abrir(n)} style={c.tr}>
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

            <NotaDetalhe nota={aberta} />

            {exigeFolhaObra && (
              <div style={c.folhaBloco}>
                <div style={c.rot}>Folha de Obra (obrigatória)</div>
                {folhas.length === 0 ? (
                  <div style={c.ajuda}>Ainda não há folha de obra para esta nota.</div>
                ) : (
                  <ul style={c.folhaLista}>
                    {folhas.map((f) => (
                      <li key={f.id} style={c.folhaItem}>
                        <Link href={`/tecnico/folhas-obra/${f.id}`} style={c.link}>{f.numero}</Link>
                        <span style={{ ...c.folhaTag, color: ESTADO_FOLHA_CONFIG[f.estado].color, background: ESTADO_FOLHA_CONFIG[f.estado].bg }}>
                          {ESTADO_FOLHA_CONFIG[f.estado].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button onClick={() => router.push(`/tecnico/folhas-obra/nova?nota=${aberta.id}`)} style={c.btnSecundario}>
                  + Criar Folha de Obra
                </button>
              </div>
            )}

            <label style={c.campo}>
              <span style={c.rot}>Notas (opcional)</span>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} style={c.textarea} />
            </label>

            <button
              onClick={concluir}
              disabled={aGuardar || (exigeFolhaObra && !folhaOk)}
              style={{ ...c.btnPrimario, opacity: exigeFolhaObra && !folhaOk ? 0.5 : 1 }}
            >
              {aGuardar ? 'A guardar...' : botaoLabel}
            </button>
            {exigeFolhaObra && !folhaOk && (
              <span style={c.ajuda}>Conclui a folha de obra desta nota para poder avançar.</span>
            )}
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
  painel: { background: 'var(--surface)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '92vh', overflowY: 'auto' },
  painelTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 18, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  folhaBloco: { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 },
  folhaLista: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  folhaItem: { display: 'flex', alignItems: 'center', gap: 10 },
  folhaTag: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  link: { color: 'var(--primary)', fontSize: 14, textDecoration: 'underline', fontWeight: 700 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rot: { color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  textarea: { width: '100%', minHeight: 60, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', resize: 'vertical' },
  ajuda: { fontSize: 12, color: 'var(--muted)' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 4 },
  btnSecundario: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14, alignSelf: 'flex-start' },
}
