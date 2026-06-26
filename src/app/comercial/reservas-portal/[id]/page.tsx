'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  obterReserva, estadoInfo, modalidadeLabel, formatarData, podeValidar, type ReservaPortal,
} from '@/lib/reservasPortal'

export default function ReservaPortalInternaPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { perfil, isAdmin } = useAuth()
  const [reserva, setReserva] = useState<ReservaPortal | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [motivo, setMotivo] = useState('')
  const [aProcessar, setAProcessar] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    if (!params?.id) return
    obterReserva(params.id).then((r) => { setReserva(r); setCarregando(false) })
  }, [params?.id])

  const validador = podeValidar(perfil?.email, isAdmin)

  async function validar(acao: 'confirmar' | 'rejeitar') {
    if (!reserva) return
    if (acao === 'rejeitar' && !motivo.trim()) {
      setMsg({ tipo: 'erro', texto: 'Indica o motivo da rejeição.' })
      return
    }
    setMsg(null)
    setAProcessar(true)
    const { data: s } = await supabase.auth.getSession()
    const token = s.session?.access_token
    const r = await fetch('/api/reservas-portal/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ id: reserva.id, acao, motivo: motivo.trim() }),
    })
    const json = await r.json()
    setAProcessar(false)
    if (!json.ok) { setMsg({ tipo: 'erro', texto: json.erro ?? 'Falha ao validar.' }); return }
    const aviso = json.smsEnviado ? 'SMS enviado à cliente.' : `Reserva atualizada, mas o SMS não saiu: ${json.smsErro ?? 'sem telefone'}.`
    setMsg({ tipo: 'ok', texto: `${acao === 'confirmar' ? 'Reserva confirmada' : 'Reserva rejeitada'}. ${aviso}` })
    const fresca = await obterReserva(reserva.id)
    setReserva(fresca)
  }

  if (carregando) return <main style={c.page}><p style={c.muted}>A carregar...</p></main>
  if (!reserva) {
    return (
      <main style={c.page}>
        <p style={c.muted}>Reserva não encontrada.</p>
        <button style={c.btnGhost} onClick={() => router.push('/comercial/reservas-portal')}>← Voltar</button>
      </main>
    )
  }

  const info = estadoInfo(reserva.estado)

  return (
    <main style={c.page}>
      <button style={c.btnGhost} onClick={() => router.push('/comercial/reservas-portal')}>← Voltar aos pedidos</button>

      <div style={c.cartao}>
        <div style={c.topo}>
          <h1 style={c.titulo}>{reserva.numero ?? 'Reserva'}</h1>
          <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 12px', color: info.cor, background: info.bg }}>{info.label}</span>
        </div>

        <Linha rotulo="Cliente" valor={reserva.cliente_nome} />
        <Linha rotulo="Email" valor={reserva.cliente_email} />
        <Linha rotulo="Telefone" valor={reserva.cliente_telefone} />
        <Linha rotulo="Modelo" valor={reserva.modelo_equipamento} />
        <Linha rotulo="Modalidade" valor={modalidadeLabel(reserva.modalidade ?? '')} />
        <Linha rotulo="Datas pretendidas" valor={`${formatarData(reserva.data_inicio_pretendida)} – ${formatarData(reserva.data_fim_pretendida)}`} />
        <Linha rotulo="Pedido em" valor={(reserva.created_at ?? '').slice(0, 10)} />
        {reserva.notas_cliente && <Linha rotulo="Notas da cliente" valor={reserva.notas_cliente} />}
        {reserva.motivo_rejeicao && <Linha rotulo="Motivo da rejeição" valor={reserva.motivo_rejeicao} />}
        {reserva.validado_por_nome && (
          <Linha rotulo="Validado por" valor={`${reserva.validado_por_nome}${reserva.validado_at ? ` (${reserva.validado_at.slice(0, 10)})` : ''}`} />
        )}
      </div>

      {msg && (
        <div style={msg.tipo === 'ok' ? c.ok : c.erro}>{msg.texto}</div>
      )}

      {/* Secção de validação — só para validadores e enquanto pendente */}
      {validador && reserva.estado === 'pendente' && (
        <div style={c.cartao}>
          <h2 style={c.subt}>Validação</h2>
          <label style={c.label}>Motivo (obrigatório para rejeitar)</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: equipamento indisponível nessas datas"
            style={c.textarea}
          />
          <div style={c.acoes}>
            <button style={c.btnConfirmar} onClick={() => validar('confirmar')} disabled={aProcessar}>
              {aProcessar ? 'A processar...' : '✓ Confirmar reserva'}
            </button>
            <button style={c.btnRejeitar} onClick={() => validar('rejeitar')} disabled={aProcessar}>
              ✗ Rejeitar
            </button>
          </div>
          <p style={c.nota}>Ao confirmar ou rejeitar é enviado um SMS à cliente (remetente All4laser).</p>
        </div>
      )}

      {!validador && reserva.estado === 'pendente' && (
        <div style={c.cartao}>
          <p style={c.muted}>Apenas validadores autorizados podem confirmar ou rejeitar este pedido.</p>
        </div>
      )}
    </main>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div style={c.linha}>
      <span style={c.linhaRot}>{rotulo}</span>
      <span style={c.linhaVal}>{valor || '—'}</span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: 20 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginTop: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  subt: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  linha: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #f2f2f2', fontSize: 14.5 },
  linhaRot: { color: 'var(--muted)' },
  linhaVal: { fontWeight: 600, textAlign: 'right' },
  label: { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 },
  textarea: { width: '100%', minHeight: 80, padding: 11, border: '1px solid var(--border)', borderRadius: 9, fontSize: 15, resize: 'vertical' },
  acoes: { display: 'flex', gap: 10, marginTop: 12 },
  btnConfirmar: { flex: 1, background: '#1a7f37', color: '#fff', border: 'none', borderRadius: 9, padding: 13, fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  btnRejeitar: { background: '#fff', color: 'var(--danger)', border: '1px solid #f3c4c4', borderRadius: 9, padding: '13px 18px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  nota: { color: 'var(--muted)', fontSize: 12.5, marginTop: 10 },
  muted: { color: 'var(--muted)', fontSize: 14 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  ok: { background: '#e7f6ec', color: '#1a7f37', border: '1px solid #b6e3c4', borderRadius: 9, padding: '11px 13px', fontSize: 14, marginTop: 14 },
  erro: { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid #f3c4c4', borderRadius: 9, padding: '11px 13px', fontSize: 14, marginTop: 14 },
}
