'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import CompletudeFicha from '@/components/CompletudeFicha'
import DadosProdutoEquip from '@/components/DadosProdutoEquip'
import HandpiecesEquip from '@/components/HandpiecesEquip'
import AcessoriosEquip from '@/components/AcessoriosEquip'
import MediaGaleria from '@/components/MediaGaleria'
import PedirDadosFalta from '@/components/PedirDadosFalta'

// Passo guiado (mobile-first) para completar os dados de produto de um
// equipamento — pensado para o técnico fazer ao lado da máquina, no telemóvel.
type EquipMin = { id: string; modelo: string | null; marca: string | null; serial_number: string | null; acessorios: string | null }

export default function FichaProdutoPasso() {
  const params = useParams()
  const id = params.id as string
  const [eq, setEq] = useState<EquipMin | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [rk, setRk] = useState(0)
  const bump = () => setRk((v) => v + 1)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('equipamentos')
      .select('id, modelo, marca, serial_number, acessorios').eq('id', id).single()
    setEq((data as EquipMin) ?? null); setCarregando(false)
  }, [id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  if (carregando) return <main style={s.page}><p style={s.muted}>A carregar…</p></main>
  if (!eq) return <main style={s.page}><p style={s.muted}>Equipamento não encontrado.</p></main>

  const nome = [eq.marca, eq.modelo].filter(Boolean).join(' ') || 'Equipamento'

  return (
    <main style={s.page}>
      <Link href={`/equipamentos/${id}`} style={s.voltar}>← Voltar ao equipamento</Link>
      <h1 style={s.titulo}>📋 Completar dados de produto</h1>
      <p style={s.sub}>{nome}{eq.serial_number ? ` · S/N ${eq.serial_number}` : ''}</p>

      <CompletudeFicha equipamentoId={id} refreshKey={rk} />

      <div style={s.passo}>
        <div style={s.passoTit}>1 · Fotos</div>
        <p style={s.dica}>Sugestão (mín. 5): frontal · traseira · ecrã · handpieces · acessórios. No telemóvel podes usar a câmara. A ⭐ marca a foto de capa.</p>
        <MediaGaleria equipamentoId={id} onChange={bump} />
      </div>

      <div style={s.passo}>
        <div style={s.passoTit}>2 · Estado e especificações</div>
        <DadosProdutoEquip equipamentoId={id} onChange={bump} />
      </div>

      <div style={s.passo}>
        <div style={s.passoTit}>3 · Handpieces / contadores</div>
        <HandpiecesEquip equipamentoId={id} onChange={bump} />
      </div>

      <div style={s.passo}>
        <div style={s.passoTit}>4 · Acessórios</div>
        <AcessoriosEquip equipamentoId={id} textoLegado={eq.acessorios} onChange={bump} />
      </div>

      <div style={s.rodape}>
        <PedirDadosFalta equipamentoId={id} tituloEquip={nome} />
        <Link href={`/equipamentos/${id}`} style={s.btnPrim}>Concluir</Link>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: '0 0 8px' },
  muted: { color: 'var(--muted)', fontSize: 14 },
  passo: { marginTop: 6 },
  passoTit: { fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginTop: 18 },
  dica: { fontSize: 12.5, color: 'var(--muted)', margin: '6px 0 0' },
  rodape: { display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 24, flexWrap: 'wrap' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
}
