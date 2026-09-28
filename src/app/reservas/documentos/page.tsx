'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { dataPt, listarDocumentosCliente, type ClienteDocumento } from '@/lib/areaCliente'
import s from '../portal.module.css'

export default function DocumentosClientePage() {
  const [docs, setDocs] = useState<ClienteDocumento[]>([])
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarDocumentosCliente().then(setDocs) }, [])

  const filtrados = useMemo(() => docs.filter((d) => {
    const texto = `${d.titulo} ${d.descricao ?? ''}`.toLowerCase()
    return (!q || texto.includes(q.toLowerCase())) && (!categoria || d.categoria === categoria)
  }), [docs, q, categoria])

  async function descarregar(doc: ClienteDocumento) {
    setErro(null)
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setErro('Inicie sessão para descarregar documentos.'); return }
    const r = await fetch('/api/area-cliente/ficheiro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tipo: 'documento', id: doc.id }),
    })
    const j = await r.json()
    if (!j.ok) { setErro(j.erro ?? 'Não foi possível criar o link.'); return }
    window.open(j.url, '_blank', 'noopener')
  }

  return (
    <div className={s.cartao}>
      <h1 className={s.titulo}>Os meus documentos</h1>
      <p className={s.subtitulo}>Faturas, contratos e certificados associados à sua conta.</p>
      {erro && <div className={s.erro}>{erro}</div>}
      <div className={s.toolbar}>
        <input className={s.input} placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={s.select} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          <option value="fatura">Faturas</option>
          <option value="contrato">Contratos</option>
          <option value="certificado_formacao">Certificados de formação</option>
          <option value="outro">Outros</option>
        </select>
      </div>
      {filtrados.length === 0 ? <p className={s.vazio}>Sem documentos.</p> : (
        <div className={s.lista}>
          {filtrados.map((d) => (
            <div key={d.id} className={s.linhaCard}>
              <div className={s.reservaTopo}><strong>{d.titulo}</strong><span className={s.badge}>{d.categoria}</span></div>
              <div className={s.acaoTexto}>{dataPt(d.data_documento ?? d.created_at)}{d.descricao ? ` · ${d.descricao}` : ''}</div>
              <button className={s.botaoSec} style={{ marginTop: 10 }} onClick={() => descarregar(d)}>Descarregar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
