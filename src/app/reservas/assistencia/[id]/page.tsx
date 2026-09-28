'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { acrescentarMensagemAssistencia, estadoAssistenciaLabel, obterAssistenciaCliente, type AssistenciaMensagem, type AssistenciaPedido } from '@/lib/areaCliente'
import s from '../../portal.module.css'

export default function DetalheAssistenciaPage() {
  const { id } = useParams<{ id: string }>()
  const [pedido, setPedido] = useState<AssistenciaPedido | null>(null)
  const [mensagens, setMensagens] = useState<AssistenciaMensagem[]>([])
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function carregar() { obterAssistenciaCliente(id).then((r) => { setPedido(r.pedido); setMensagens(r.mensagens) }) }
  useEffect(() => { carregar() }, [id])

  async function enviar() {
    if (!pedido || !texto.trim()) return
    const r = await acrescentarMensagemAssistencia(pedido.id, pedido.cliente_portal_id, texto.trim())
    if (r.error) setErro(r.error.message)
    else { setTexto(''); carregar() }
  }

  if (!pedido) return <p className={s.vazio}>A carregar...</p>
  return (
    <>
      <div className={s.cartao}>
        <div className={s.reservaTopo}><h1 className={s.titulo}>{pedido.numero}</h1><span className={s.badge}>{estadoAssistenciaLabel(pedido.estado)}</span></div>
        <p className={s.subtitulo}>{pedido.equipamento}{pedido.numero_serie ? ` · ${pedido.numero_serie}` : ''}</p>
        <div className={s.aviso}>{pedido.descricao}</div>
      </div>
      <div className={s.cartao}>
        <h2 className={s.titulo} style={{ fontSize: 18 }}>Mensagens</h2>
        {erro && <div className={s.erro}>{erro}</div>}
        <div className={s.lista}>
          {mensagens.map((m) => <div key={m.id} className={s.linhaCard}><strong>{m.autor_nome ?? m.autor_tipo}</strong><p>{m.mensagem}</p></div>)}
        </div>
        <textarea className={s.textarea} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Acrescentar informação" style={{ marginTop: 12 }} />
        <button className={s.botao} onClick={enviar}>Enviar mensagem</button>
      </div>
    </>
  )
}
