'use client'

// Equipamentos Prontos a Enviar — agora com agrupamento em Expedições.
// As NEs prontas (fase admin_expedicao/em_curso) aparecem agrupadas por cliente.
// Selecionar 1+ NEs do mesmo cliente → criar uma Expedição (escolhendo a morada).
// A expedição (documentos, tracking, confirmar expedida) faz-se no detalhe.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { notasProntas, moradasCliente, criarExpedicion } from '@/lib/expeditions'
import { resumoEquipamentos, type MoradaEntrega } from '@/types/expedition'
import type { NotaEncomenda } from '@/types/notaEncomenda'

function fdata(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

type Grupo = { clienteId: string | null; clienteNome: string; notas: NotaEncomenda[] }

export default function ProntosAEnviarPage() {
  const { session, perfil } = useAuth()
  const router = useRouter()
  const [notas, setNotas] = useState<NotaEncomenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  // Modal de criação (escolher morada)
  const [criarPara, setCriarPara] = useState<{ grupo: Grupo; moradas: MoradaEntrega[] } | null>(null)
  const [moradaSel, setMoradaSel] = useState<string>('')
  const [aCriar, setACriar] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setNotas(await notasProntas())
    setSel(new Set())
    setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  // Agrupar por cliente.
  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, Grupo>()
    for (const n of notas) {
      const k = n.cliente_id ?? `sem:${n.cliente_nome ?? ''}`
      if (!m.has(k)) m.set(k, { clienteId: n.cliente_id, clienteNome: n.cliente_nome ?? 'Sem cliente', notas: [] })
      m.get(k)!.notas.push(n)
    }
    return [...m.values()].sort((a, b) => a.clienteNome.localeCompare(b.clienteNome))
  }, [notas])

  const notaPorId = useMemo(() => new Map(notas.map((n) => [n.id, n])), [notas])
  // Cliente da seleção atual (null se vazia; false se mistura clientes).
  const clienteSel = useMemo<string | null | false>(() => {
    let c: string | null | undefined
    for (const id of sel) {
      const n = notaPorId.get(id); if (!n) continue
      if (c === undefined) c = n.cliente_id
      else if (c !== n.cliente_id) return false
    }
    return c ?? null
  }, [sel, notaPorId])

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function iniciarCriacao(notaIds: string[]) {
    const ns = notaIds.map((id) => notaPorId.get(id)).filter((n): n is NotaEncomenda => !!n)
    if (ns.length === 0) return
    const cliente = ns[0].cliente_id
    if (ns.some((n) => n.cliente_id !== cliente)) { setToast('Só podes agrupar NEs do mesmo cliente.'); return }
    const grupo: Grupo = { clienteId: cliente, clienteNome: ns[0].cliente_nome ?? 'Sem cliente', notas: ns }
    const moradas = cliente ? await moradasCliente(cliente) : []
    setMoradaSel(moradas.length === 1 ? moradas[0].id : '')
    setCriarPara({ grupo, moradas })
  }

  async function confirmarCriacao() {
    if (!criarPara) return
    setACriar(true)
    const { grupo, moradas } = criarPara
    const morada = moradas.find((m) => m.id === moradaSel) ?? null
    const { id, error } = await criarExpedicion(
      { cliente_id: grupo.clienteId, cliente_nome: grupo.clienteNome, morada, notaIds: grupo.notas.map((n) => n.id) },
      { id: session?.user.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null },
    )
    setACriar(false)
    if (error || !id) { setToast('Erro: ' + (error ?? 'desconhecido')); return }
    router.push(`/admin-dept/expedicoes/${id}`)
  }

  const selCount = sel.size

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Equipamentos Prontos a Enviar</h1>
          <Link href="/admin-dept" style={c.voltar}>← Administrativo</Link>
          {' · '}
          <Link href="/admin-dept/expedicoes" style={c.link}>Ver Expedições →</Link>
        </div>
        <span style={c.contador}>{notas.length} prontas</span>
      </div>

      {selCount > 0 && (
        <div style={c.barraSel}>
          <span>{selCount} selecionada{selCount > 1 ? 's' : ''}{clienteSel === false ? ' — de clientes diferentes!' : ''}</span>
          <button style={{ ...c.btnPrimario, opacity: clienteSel === false ? 0.5 : 1 }} disabled={clienteSel === false}
            onClick={() => iniciarCriacao([...sel])}>Criar Expedição</button>
          <button style={c.btnLimpar} onClick={() => setSel(new Set())}>Limpar seleção</button>
        </div>
      )}

      {carregando ? (
        <p style={c.estado}>A carregar…</p>
      ) : notas.length === 0 ? (
        <p style={c.estado}>Não há equipamentos prontos a enviar.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.clienteId ?? g.clienteNome} style={c.grupo}>
            <div style={c.grupoTopo}>
              <strong>{g.clienteNome}</strong>
              <span style={c.grupoInfo}>{g.notas.length} pronta{g.notas.length > 1 ? 's' : ''} · {resumoEquipamentos(g.notas)}</span>
              {g.notas.length > 1 && (
                <button style={c.btnAgrupar} onClick={() => iniciarCriacao(g.notas.map((n) => n.id))}>
                  Agrupar as {g.notas.length} numa expedição
                </button>
              )}
            </div>
            <div style={c.tabelaWrap}>
              <table style={c.tabela}>
                <tbody>
                  {g.notas.map((n) => (
                    <tr key={n.id} style={c.tr}>
                      <td style={c.tdCheck}>
                        <input type="checkbox" checked={sel.has(n.id)} onChange={() => toggle(n.id)} />
                      </td>
                      <td style={{ ...c.td, fontWeight: 700 }}>{n.numero ?? '—'}</td>
                      <td style={c.td}>{fdata(n.data_pedido)}</td>
                      <td style={c.td}>{n.pais_destino ?? '—'}</td>
                      <td style={c.td}>{n.equipamento_modelo ?? '—'}</td>
                      <td style={c.td}>SN {n.equipamento_sn ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {/* Modal: escolher morada e criar */}
      {criarPara && (
        <div style={c.backdrop} onClick={() => setCriarPara(null)}>
          <div style={c.painel} onClick={(e) => e.stopPropagation()}>
            <div style={c.painelTopo}>
              <strong>Criar Expedição — {criarPara.grupo.clienteNome}</strong>
              <button onClick={() => setCriarPara(null)} style={c.fechar} aria-label="Fechar">×</button>
            </div>
            <p style={c.ajuda}>{criarPara.grupo.notas.length} NE(s): {criarPara.grupo.notas.map((n) => n.numero).join(', ')}</p>

            <span style={c.rot}>Morada de entrega</span>
            {criarPara.moradas.length === 0 ? (
              <p style={c.ajuda}>Este cliente não tem moradas de entrega registadas — a expedição fica sem morada específica (podes editar depois).</p>
            ) : (
              <div style={c.moradas}>
                {criarPara.moradas.map((m) => (
                  <label key={m.id} style={c.moradaLinha}>
                    <input type="radio" name="morada" checked={moradaSel === m.id} onChange={() => setMoradaSel(m.id)} />
                    <span>{m.etiqueta ? <b>{m.etiqueta}: </b> : null}{[m.morada, m.cidade, m.codigo_postal, m.pais].filter(Boolean).join(', ')}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={c.acoes}>
              <button style={c.btnSec} onClick={() => setCriarPara(null)} disabled={aCriar}>Cancelar</button>
              <button style={c.btnPrimario} onClick={confirmarCriacao} disabled={aCriar || (criarPara.moradas.length > 0 && !moradaSel)}>
                {aCriar ? 'A criar…' : 'Criar Expedição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  link: { color: 'var(--primary)', textDecoration: 'none', fontSize: 14 },
  contador: { color: 'var(--muted)', fontSize: 14, alignSelf: 'center', whiteSpace: 'nowrap' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  barraSel: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 },
  grupo: { marginBottom: 18 },
  grupoTopo: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  grupoInfo: { color: 'var(--muted)', fontSize: 13 },
  btnAgrupar: { marginLeft: 'auto', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  tabelaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  tr: { borderBottom: '1px solid var(--border)' },
  tdCheck: { padding: '10px 8px 10px 14px', width: 34 },
  td: { padding: '12px 14px', color: 'var(--foreground)', whiteSpace: 'nowrap' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 },
  painel: { background: 'var(--surface)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '92vh', overflowY: 'auto' },
  painelTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  rot: { color: 'var(--muted)', fontWeight: 600, fontSize: 13 },
  ajuda: { fontSize: 13, color: 'var(--muted)' },
  moradas: { display: 'flex', flexDirection: 'column', gap: 6 },
  moradaLinha: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnSec: { background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  btnLimpar: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
