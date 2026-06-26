'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  obterReserva, cancelarReserva, estadoInfo, modalidadeLabel, formatarData,
  CONTACTO_ALL4LASER, type ReservaPortal,
} from '@/lib/reservasPortal'
import s from '../portal.module.css'

export default function DetalheReservaPage() {
  return (
    <Suspense fallback={<p className={s.vazio}>A carregar...</p>}>
      <DetalheReserva />
    </Suspense>
  )
}

function DetalheReserva() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const novo = useSearchParams().get('novo') === '1'
  const [reserva, setReserva] = useState<ReservaPortal | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aCancelar, setACancelar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!params?.id) return
    obterReserva(params.id).then((r) => { setReserva(r); setCarregando(false) })
  }, [params?.id])

  async function cancelar() {
    if (!reserva) return
    if (!confirm('Tens a certeza que queres cancelar este pedido?')) return
    setErro(null)
    setACancelar(true)
    const r = await cancelarReserva(reserva.id)
    setACancelar(false)
    if (!r.ok) { setErro(r.erro ?? 'Não foi possível cancelar.'); return }
    setReserva({ ...reserva, estado: 'cancelada' })
  }

  if (carregando) return <p className={s.vazio}>A carregar...</p>
  if (!reserva) {
    return (
      <div className={s.cartao}>
        <p className={s.vazio}>Reserva não encontrada.</p>
        <Link href="/reservas" className={s.link}>← Voltar</Link>
      </div>
    )
  }

  const info = estadoInfo(reserva.estado)

  return (
    <>
      {novo && (
        <div className={s.sucesso}>
          O teu pedido foi recebido. Receberás confirmação em breve.
        </div>
      )}

      <div className={s.cartao}>
        <div className={s.reservaTopo}>
          <h1 className={s.titulo} style={{ marginBottom: 0 }}>{reserva.numero ?? 'Reserva'}</h1>
          <span className={s.badge} style={{ color: info.cor, background: info.bg }}>{info.label}</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Modelo</span><span className={s.resumoValor}>{reserva.modelo_equipamento ?? '—'}</span></div>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Modalidade</span><span className={s.resumoValor}>{modalidadeLabel(reserva.modalidade ?? '')}</span></div>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Início</span><span className={s.resumoValor}>{formatarData(reserva.data_inicio_pretendida)}</span></div>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Fim</span><span className={s.resumoValor}>{formatarData(reserva.data_fim_pretendida)}</span></div>
          {reserva.notas_cliente && (
            <div className={s.resumoLinha}><span className={s.resumoLabel}>Notas</span><span className={s.resumoValor}>{reserva.notas_cliente}</span></div>
          )}
        </div>
      </div>

      {reserva.estado === 'confirmada' && (
        <div className={s.cartao}>
          <div className={s.sucesso} style={{ marginBottom: 0 }}>
            Reserva confirmada para {formatarData(reserva.data_inicio_pretendida)} a {formatarData(reserva.data_fim_pretendida)}.
            Entraremos em contacto com os próximos passos.
          </div>
        </div>
      )}

      {reserva.estado === 'rejeitada' && (
        <div className={s.cartao}>
          <div className={s.erro} style={{ marginBottom: 8 }}>
            Este pedido não pôde ser confirmado.
            {reserva.motivo_rejeicao ? ` Motivo: ${reserva.motivo_rejeicao}` : ''}
          </div>
          <p className={s.subtitulo} style={{ marginBottom: 0 }}>
            Contacta-nos para alternativas: <a href={`tel:${CONTACTO_ALL4LASER.replace(/\s/g, '')}`} className={s.link}>{CONTACTO_ALL4LASER}</a>
          </p>
        </div>
      )}

      {erro && <div className={s.erro}>{erro}</div>}

      <div className={s.acoes}>
        <button className={s.botaoSec} onClick={() => router.push('/reservas')}>← Voltar</button>
        {reserva.estado === 'pendente' && (
          <button className={s.botaoPerigo} onClick={cancelar} disabled={aCancelar}>
            {aCancelar ? 'A cancelar...' : 'Cancelar pedido'}
          </button>
        )}
      </div>
    </>
  )
}
