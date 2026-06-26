'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePortalAuth } from '@/lib/portalAuth'
import {
  listarMinhasReservas, estadoInfo, modalidadeLabel, formatarData, type ReservaPortal,
} from '@/lib/reservasPortal'
import s from './portal.module.css'

export default function PortalDashboard() {
  const { cliente, session } = usePortalAuth()
  const [reservas, setReservas] = useState<ReservaPortal[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!session) return
    listarMinhasReservas().then((r) => { setReservas(r); setCarregando(false) })
  }, [session])

  const primeiroNome = (cliente?.nome ?? '').split(' ')[0]

  return (
    <>
      <div className={s.cartao}>
        <h1 className={s.titulo}>Olá{primeiroNome ? `, ${primeiroNome}` : ''} 👋</h1>
        <p className={s.subtitulo}>Aqui podes pedir reservas de equipamento e acompanhar o estado dos teus pedidos.</p>
        <Link href="/reservas/nova-reserva" className={s.botao} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          + Nova Reserva
        </Link>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '8px 4px 12px' }}>As minhas reservas</h2>

      {carregando ? (
        <p className={s.vazio}>A carregar...</p>
      ) : reservas.length === 0 ? (
        <div className={s.cartao}>
          <p className={s.vazio}>Ainda não tens reservas. Cria a primeira no botão acima.</p>
        </div>
      ) : (
        reservas.map((r) => {
          const info = estadoInfo(r.estado)
          return (
            <Link key={r.id} href={`/reservas/${r.id}`} className={s.reservaItem}>
              <div className={s.reservaTopo}>
                <span className={s.reservaNumero}>{r.numero ?? '—'}</span>
                <span className={s.badge} style={{ color: info.cor, background: info.bg }}>{info.label}</span>
              </div>
              <div className={s.reservaModelo}>{r.modelo_equipamento ?? '—'}</div>
              <div className={s.reservaDatas}>
                {modalidadeLabel(r.modalidade ?? '')} · {formatarData(r.data_inicio_pretendida)} a {formatarData(r.data_fim_pretendida)}
              </div>
            </Link>
          )
        })
      )}
    </>
  )
}
