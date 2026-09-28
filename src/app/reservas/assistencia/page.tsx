'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { estadoAssistenciaLabel, listarAssistenciaCliente, type AssistenciaPedido } from '@/lib/areaCliente'
import s from '../portal.module.css'

export default function AssistenciaClientePage() {
  const [pedidos, setPedidos] = useState<AssistenciaPedido[]>([])
  const [equipamento, setEquipamento] = useState('')
  const [serial, setSerial] = useState('')
  const [descricao, setDescricao] = useState('')
  const [parado, setParado] = useState(false)
  const [contacto, setContacto] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aEnviar, setAEnviar] = useState(false)

  function carregar() { listarAssistenciaCliente().then(setPedidos) }
  useEffect(() => { carregar() }, [])

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setMsg(null); setAEnviar(true)
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setAEnviar(false); setErro('Inicie sessão para reportar uma avaria.'); return }
    const fd = new FormData()
    fd.set('equipamento', equipamento); fd.set('numero_serie', serial); fd.set('descricao', descricao)
    fd.set('equipamento_parado', String(parado)); fd.set('contacto', contacto)
    Array.from(files ?? []).forEach((f) => fd.append('anexos', f))
    const r = await fetch('/api/area-cliente/assistencia', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
    const j = await r.json()
    setAEnviar(false)
    if (!j.ok) { setErro(j.erro ?? 'Não foi possível registar.'); return }
    setMsg(`Pedido ${j.numero ?? ''} registado.${j.email ? '' : ' O email à assistência ficou pendente para nova tentativa.'}`)
    setEquipamento(''); setSerial(''); setDescricao(''); setParado(false); setContacto(''); setFiles(null); carregar()
  }

  return (
    <>
      <div className={s.cartao}>
        <h1 className={s.titulo}>Reportar avaria</h1>
        <p className={s.subtitulo}>Registe situações técnicas com fotos ou vídeos. Casos de segurança são encaminhados para avaliação humana.</p>
        {erro && <div className={s.erro}>{erro}</div>}
        {msg && <div className={s.sucesso}>{msg}</div>}
        <form onSubmit={submeter}>
          <div className={s.campo}><label className={s.label}>Equipamento</label><input className={s.input} value={equipamento} onChange={(e) => setEquipamento(e.target.value)} required /></div>
          <div className={s.campo}><label className={s.label}>Número de série</label><input className={s.input} value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
          <div className={s.campo}><label className={s.label}>Descrição</label><textarea className={s.textarea} value={descricao} onChange={(e) => setDescricao(e.target.value)} required /></div>
          <div className={s.campo}><label><input type="checkbox" checked={parado} onChange={(e) => setParado(e.target.checked)} /> Equipamento parado</label></div>
          <div className={s.campo}><label className={s.label}>Contacto preferencial</label><input className={s.input} value={contacto} onChange={(e) => setContacto(e.target.value)} /></div>
          <div className={s.campo}><label className={s.label}>Fotos ou vídeos</label><input className={s.input} type="file" multiple accept="image/*,video/*" onChange={(e) => setFiles(e.target.files)} /></div>
          <button className={s.botao} disabled={aEnviar}>{aEnviar ? 'A enviar...' : 'Submeter pedido'}</button>
        </form>
      </div>
      <div className={s.cartao}>
        <h2 className={s.titulo} style={{ fontSize: 18 }}>Os meus pedidos</h2>
        {pedidos.length === 0 ? <p className={s.vazio}>Sem pedidos de assistência.</p> : pedidos.map((p) => (
          <Link key={p.id} href={`/reservas/assistencia/${p.id}`} className={s.reservaItem}>
            <div className={s.reservaTopo}><strong>{p.numero ?? 'Pedido'}</strong><span className={s.badge}>{estadoAssistenciaLabel(p.estado)}</span></div>
            <div className={s.acaoTexto}>{p.equipamento}</div>
          </Link>
        ))}
      </div>
    </>
  )
}
