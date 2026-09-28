'use client'

import { useEffect, useState } from 'react'
import { atualizarPreferenciasLembretes, listarAgendamentosCliente, perfilClienteAtual, type AgendamentoCliente, type ClientePortalCompleto } from '@/lib/areaCliente'
import s from '../portal.module.css'

export default function AgendaClientePage() {
  const [agenda, setAgenda] = useState<AgendamentoCliente[]>([])
  const [cliente, setCliente] = useState<ClientePortalCompleto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarAgendamentosCliente(), perfilClienteAtual()]).then(([a, c]) => { setAgenda(a); setCliente(c) })
  }, [])

  async function guardarPrefs(prefs: Record<string, boolean>) {
    if (!cliente) return
    const r = await atualizarPreferenciasLembretes(cliente.id, prefs)
    if (!r.error) { setCliente({ ...cliente, preferencias_lembretes: prefs }); setMsg('Preferências guardadas.') }
  }

  const prefs = cliente?.preferencias_lembretes ?? { email: true, sms: false, whatsapp: false, push: false }
  return (
    <>
      <div className={s.cartao}>
        <h1 className={s.titulo}>Agenda e lembretes</h1>
        <p className={s.subtitulo}>Lembretes preparados para 48 horas e 24 horas antes, no fuso horário Europe/Lisbon.</p>
        {msg && <div className={s.sucesso}>{msg}</div>}
        <div className={s.grid}>
          {(['email', 'sms', 'whatsapp', 'push'] as const).map((canal) => (
            <label key={canal} className={s.linhaCard}><input type="checkbox" checked={!!prefs[canal]} onChange={(e) => guardarPrefs({ ...prefs, [canal]: e.target.checked })} /> {canal.toUpperCase()}</label>
          ))}
        </div>
      </div>
      <div className={s.cartao}>
        <h2 className={s.titulo} style={{ fontSize: 18 }}>Marcações</h2>
        {agenda.length === 0 ? <p className={s.vazio}>Sem marcações.</p> : agenda.map((a) => (
          <div key={a.id} className={s.linhaCard}>
            <div className={s.reservaTopo}><strong>{a.titulo}</strong><span className={s.badge}>{a.estado}</span></div>
            <div className={s.acaoTexto}>{new Date(a.inicio).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}</div>
            {a.descricao && <p>{a.descricao}</p>}
          </div>
        ))}
      </div>
    </>
  )
}
