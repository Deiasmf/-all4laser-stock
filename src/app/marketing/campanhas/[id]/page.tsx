'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { obterCampanha, atualizarCampanha, apagarCampanha } from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import CampanhaForm from '@/components/CampanhaForm'
import { LINHA_NEGOCIO_LABEL } from '@/types/marketing'
import type { Campanha, CampanhaInput } from '@/types/marketing'

export default function CampanhaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { perfil } = useAuth()
  const [campanha, setCampanha] = useState<Campanha | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [editar, setEditar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    obterCampanha(id).then(({ data }) => { setCampanha((data as Campanha) ?? null); setCarregando(false) })
  }, [id])

  async function guardar(input: CampanhaInput) {
    setAGuardar(true); setErro(null)
    const { data, error } = await atualizarCampanha(id, input)
    setAGuardar(false)
    if (error || !data) { setErro(mensagemErro(error, { entidade: 'campanha' })); return }
    setCampanha(data as Campanha)
    setEditar(false)
  }

  async function eliminar() {
    if (!perfil || !confirm('Eliminar esta campanha? As publicações associadas mantêm-se (sem campanha).')) return
    const { error } = await apagarCampanha(id, { id: perfil.id, nome: perfil.nome })
    if (error) { setErro(mensagemErro(error, { entidade: 'campanha' })); return }
    router.push('/marketing/campanhas')
  }

  if (carregando) return <main style={{ padding: 20 }}><p style={{ color: 'var(--muted)' }}>A carregar…</p></main>
  if (!campanha) return (
    <main style={{ padding: 20 }}>
      <Link href="/marketing/campanhas" style={{ color: 'var(--muted)' }}>← Campanhas</Link>
      <p style={{ marginTop: 12 }}>Campanha não encontrada.</p>
    </main>
  )

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <Link href="/marketing/campanhas" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Campanhas</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, margin: '4px 0 18px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
          {campanha.nome} {campanha.numero && <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>· {campanha.numero}</span>}
        </h1>
        {!editar && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn.sec} onClick={() => setEditar(true)}>Editar</button>
            <button style={btn.del} onClick={eliminar}>Eliminar</button>
          </div>
        )}
      </div>

      {erro && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{erro}</p>}

      <div className="a4l-card" style={{ padding: 20 }}>
        {editar ? (
          <CampanhaForm inicial={campanha} aGuardar={aGuardar} onSubmit={guardar} onCancelar={() => setEditar(false)} />
        ) : (
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px', margin: 0 }}>
            <Campo r="Estado" v={campanha.estado} />
            <Campo r="Linha de negócio" v={campanha.linha_negocio ? LINHA_NEGOCIO_LABEL[campanha.linha_negocio] : '—'} />
            <Campo r="Objetivo comercial" v={campanha.objetivo_comercial ?? '—'} />
            <Campo r="Oferta" v={campanha.oferta ?? '—'} />
            <Campo r="Mercados" v={campanha.mercados.length ? campanha.mercados.join(', ') : '—'} />
            <Campo r="Públicos" v={campanha.publicos ?? '—'} />
            <Campo r="Período" v={`${campanha.data_inicio ?? '—'}${campanha.data_fim ? ` → ${campanha.data_fim}` : ''}`} />
            <Campo r="Idiomas" v={campanha.idiomas.length ? campanha.idiomas.join(', ') : '—'} />
            <Campo r="Canais" v={campanha.canais.length ? campanha.canais.join(', ') : '—'} />
            <Campo r="Landing / contacto" v={campanha.landing_url ?? '—'} />
            <Campo r="KPI principal" v={campanha.kpi_principal ?? '—'} />
            <Campo r="KPIs secundários" v={campanha.kpis_secundarios ?? '—'} />
            <Campo r="Notas" v={campanha.notas ?? '—'} />
          </dl>
        )}
      </div>
    </main>
  )
}

function Campo({ r, v }: { r: string; v: string }) {
  return (
    <>
      <dt style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{r}</dt>
      <dd style={{ margin: 0, fontSize: 14 }}>{v}</dd>
    </>
  )
}

const btn: Record<string, React.CSSProperties> = {
  sec: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  del: { background: 'var(--danger-bg, #fbecea)', color: 'var(--danger, #c0392b)', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
}
