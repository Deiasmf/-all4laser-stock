'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listarGaleriaCliente, type GaleriaMaterial } from '@/lib/areaCliente'
import s from '../portal.module.css'

export default function GaleriaClientePage() {
  const [itens, setItens] = useState<GaleriaMaterial[]>([])
  const [filtro, setFiltro] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { listarGaleriaCliente().then(setItens) }, [])
  const filtrados = useMemo(() => itens.filter((i) => !filtro || `${i.titulo} ${i.equipamento} ${i.tratamento} ${i.campanha}`.toLowerCase().includes(filtro.toLowerCase())), [itens, filtro])

  async function abrir(item: GaleriaMaterial) {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setErro('Inicie sessão.'); return }
    const r = await fetch('/api/area-cliente/ficheiro', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ tipo: 'galeria', id: item.id }) })
    const j = await r.json()
    if (!j.ok) { setErro(j.erro ?? 'Erro ao abrir material.'); return }
    window.open(j.url, '_blank', 'noopener')
  }

  return (
    <div className={s.cartao}>
      <h1 className={s.titulo}>Galeria para redes sociais</h1>
      <p className={s.subtitulo}>Materiais autorizados pela All4laser para publicações e stories.</p>
      {erro && <div className={s.erro}>{erro}</div>}
      <input className={s.input} placeholder="Pesquisar por equipamento, tratamento ou campanha" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      <div className={s.grid} style={{ marginTop: 14 }}>
        {filtrados.map((i) => (
          <div key={i.id} className={s.linhaCard}>
            <div className={s.reservaTopo}><strong>{i.titulo}</strong><span className={s.badge}>{i.formato}</span></div>
            <div className={s.acaoTexto}>{[i.equipamento, i.tratamento, i.campanha].filter(Boolean).join(' · ') || 'Material All4laser'}</div>
            {i.legenda_sugerida && <p className={s.aviso}>{i.legenda_sugerida}</p>}
            <button className={s.botaoSec} onClick={() => abrir(i)}>Pré-visualizar / descarregar</button>
          </div>
        ))}
      </div>
      {filtrados.length === 0 && <p className={s.vazio}>Sem materiais disponíveis.</p>}
    </div>
  )
}
