'use client'

import { useEffect, useState } from 'react'
import { atualizarPerfilCliente, perfilClienteAtual, type ClientePortalCompleto } from '@/lib/areaCliente'
import s from '../portal.module.css'

export default function PerfilClientePage() {
  const [perfil, setPerfil] = useState<ClientePortalCompleto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { perfilClienteAtual().then(setPerfil) }, [])
  if (!perfil) return <p className={s.vazio}>A carregar...</p>

  function set<K extends keyof ClientePortalCompleto>(k: K, v: ClientePortalCompleto[K]) {
    setPerfil((p) => (p ? { ...p, [k]: v } : p))
  }
  async function guardar() {
    if (!perfil) return
    setErro(null); setMsg(null)
    const r = await atualizarPerfilCliente(perfil.id, perfil)
    if (r.error) setErro(r.error.message)
    else setMsg('Dados guardados.')
  }

  return (
    <div className={s.cartao}>
      <h1 className={s.titulo}>Os meus dados</h1>
      <p className={s.subtitulo}>Dados de contacto, empresa e faturação.</p>
      {erro && <div className={s.erro}>{erro}</div>}
      {msg && <div className={s.sucesso}>{msg}</div>}
      <Campo label="Nome" value={perfil.nome ?? ''} onChange={(v) => set('nome', v)} />
      <Campo label="Email" value={perfil.email ?? ''} onChange={(v) => set('email', v)} />
      <Campo label="Telemóvel" value={perfil.telefone ?? ''} onChange={(v) => set('telefone', v)} />
      <Campo label="Empresa" value={perfil.empresa ?? ''} onChange={(v) => set('empresa', v)} />
      <Campo label="NIF" value={perfil.nif ?? ''} onChange={(v) => set('nif', v)} />
      <Campo label="Morada" value={perfil.morada ?? ''} onChange={(v) => set('morada', v)} />
      <Campo label="Nome de faturação" value={perfil.faturacao_nome ?? ''} onChange={(v) => set('faturacao_nome', v)} />
      <Campo label="NIF de faturação" value={perfil.faturacao_nif ?? ''} onChange={(v) => set('faturacao_nif', v)} />
      <Campo label="Morada de faturação" value={perfil.faturacao_morada ?? ''} onChange={(v) => set('faturacao_morada', v)} />
      <button className={s.botao} onClick={guardar}>Guardar</button>
    </div>
  )
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className={s.campo}><label className={s.label}>{label}</label><input className={s.input} value={value} onChange={(e) => onChange(e.target.value)} /></div>
}
