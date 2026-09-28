'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import s from '../portal.module.css'

type Msg = { papel: 'cliente' | 'assistente'; texto: string }

export default function AssistenteClientePage() {
  const [mensagens, setMensagens] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aEnviar, setAEnviar] = useState(false)

  async function enviar() {
    const pergunta = texto.trim()
    if (!pergunta) return
    setTexto(''); setErro(null); setAEnviar(true)
    setMensagens((m) => [...m, { papel: 'cliente', texto: pergunta }])
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setErro('Inicie sessão para usar o assistente.'); setAEnviar(false); return }
    const r = await fetch('/api/area-cliente/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mensagem: pergunta, conversaId }),
    })
    const j = await r.json()
    setAEnviar(false)
    if (!j.ok) { setErro(j.erro ?? 'Não foi possível responder.'); return }
    setConversaId(j.conversaId)
    setMensagens((m) => [...m, { papel: 'assistente', texto: j.resposta }])
  }

  return (
    <div className={s.cartao}>
      <h1 className={s.titulo}>Assistente All4laser</h1>
      <p className={s.subtitulo}>Responde com base em conteúdos aprovados e nos seus dados autenticados. Questões técnicas ou de segurança são encaminhadas para a equipa.</p>
      {erro && <div className={s.erro}>{erro}</div>}
      <div className={s.lista} style={{ minHeight: 260 }}>
        {mensagens.length === 0 && <p className={s.vazio}>Escreva a sua questão.</p>}
        {mensagens.map((m, i) => <div key={i} className={s.linhaCard} style={{ background: m.papel === 'cliente' ? '#f6f7fb' : '#fff' }}><strong>{m.papel === 'cliente' ? 'Você' : 'Assistente'}</strong><p>{m.texto}</p></div>)}
      </div>
      <textarea className={s.textarea} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva aqui..." />
      <button className={s.botao} onClick={enviar} disabled={aEnviar}>{aEnviar ? 'A responder...' : 'Enviar'}</button>
    </div>
  )
}
