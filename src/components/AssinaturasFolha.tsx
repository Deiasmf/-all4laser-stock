'use client'

import { useState } from 'react'
import AssinaturaPad from './AssinaturaPad'
import { guardarAssinatura } from '@/lib/folhasObra'
import type { FolhaObra } from '@/types/folhaObra'

type Tipo = 'tecnico' | 'cliente'

function formatarDataHora(d: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleString('pt-PT')
}

export default function AssinaturasFolha({
  folha,
  onAtualizada,
}: {
  folha: FolhaObra
  onAtualizada: (f: FolhaObra) => void
}) {
  const [aAbrir, setAAbrir] = useState<Tipo | null>(null)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function confirmar(tipo: Tipo, blob: Blob) {
    setAGuardar(true)
    setErro(null)
    const { data, error } = await guardarAssinatura(folha.id, tipo, blob)
    setAGuardar(false)
    if (error) { setErro('Erro ao guardar a assinatura: ' + error.message); return }
    if (data) onAtualizada(data)
    setAAbrir(null)
  }

  return (
    <section style={s.seccao}>
      <div style={s.titulo}>Assinaturas</div>
      {erro && <div style={s.erro}>{erro}</div>}
      <div style={s.grid}>
        {(['tecnico', 'cliente'] as Tipo[]).map((tipo) => {
          const url = tipo === 'tecnico' ? folha.assinatura_tecnico_url : folha.assinatura_cliente_url
          const at = tipo === 'tecnico' ? folha.assinatura_tecnico_at : folha.assinatura_cliente_at
          const rotulo = tipo === 'tecnico' ? 'Técnico' : 'Cliente'
          const aberto = aAbrir === tipo
          return (
            <div key={tipo} style={s.bloco}>
              <div style={s.blocoTopo}>
                <span style={s.blocoRotulo}>{rotulo}</span>
                {at && <span style={s.data}>{formatarDataHora(at)}</span>}
              </div>

              {aberto ? (
                <AssinaturaPad
                  aGuardar={aGuardar}
                  onConfirmar={(blob) => confirmar(tipo, blob)}
                  onCancelar={() => setAAbrir(null)}
                />
              ) : url ? (
                <div style={s.assinadaWrap}>
                  {/* assinatura guardada como PNG no storage */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Assinatura ${rotulo}`} style={s.img} />
                  <button type="button" onClick={() => setAAbrir(tipo)} style={s.btnSecundario}>
                    Voltar a assinar
                  </button>
                </div>
              ) : (
                <div style={s.vaziaWrap}>
                  <span style={s.semAssinatura}>Sem assinatura</span>
                  <button type="button" onClick={() => setAAbrir(tipo)} style={s.btnPrimario}>
                    ✍ Assinar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 },
  titulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 },
  bloco: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  blocoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  blocoRotulo: { fontWeight: 700, fontSize: 14 },
  data: { fontSize: 12, color: 'var(--muted)' },
  assinadaWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  img: { width: '100%', height: 140, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 },
  vaziaWrap: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' },
  semAssinatura: { fontSize: 13, color: 'var(--muted)' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' },
  btnSecundario: { alignSelf: 'flex-start', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer' },
}
