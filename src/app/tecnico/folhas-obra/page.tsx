'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarFolhas } from '@/lib/folhasObra'
import {
  ESTADO_FOLHA_CONFIG, ESTADO_FOLHA_OPCOES,
  type FolhaObra, type EstadoFolha,
} from '@/types/folhaObra'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function EstadoTag({ estado }: { estado: EstadoFolha }) {
  const cfg = ESTADO_FOLHA_CONFIG[estado]
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

export default function FolhasObraPage() {
  const router = useRouter()
  const [folhas, setFolhas] = useState<FolhaObra[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fEstado, setFEstado] = useState('')
  const [fTecnico, setFTecnico] = useState('')
  const [pesquisa, setPesquisa] = useState('')

  useEffect(() => {
    let activo = true
    listarFolhas()
      .then((dados) => { if (activo) setFolhas(dados) })
      .catch((e) => { if (activo) setErro(String(e)) })
      .finally(() => { if (activo) setCarregando(false) })
    return () => { activo = false }
  }, [])

  const tecnicos = useMemo(
    () => Array.from(new Set(folhas.map((f) => f.tecnico_nome).filter(Boolean))).sort() as string[],
    [folhas]
  )

  const contagens = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of folhas) m[f.estado] = (m[f.estado] ?? 0) + 1
    return m
  }, [folhas])

  const filtradas = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return folhas.filter((f) => {
      if (fEstado && f.estado !== fEstado) return false
      if (fTecnico && f.tecnico_nome !== fTecnico) return false
      if (q) {
        const alvo = `${f.numero} ${f.cliente_nome ?? ''} ${f.equipamento_modelo ?? ''} ${f.equipamento_sn ?? ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
  }, [folhas, fEstado, fTecnico, pesquisa])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Folhas de Obra</h1>
          <Link href="/tecnico" style={c.voltar}>← Técnico</Link>
        </div>
        <Link href="/tecnico/folhas-obra/nova" style={c.btnNova}>+ Nova folha</Link>
      </div>

      <div style={c.resumoLinha}>
        {ESTADO_FOLHA_OPCOES.map((e) => (
          <button
            key={e}
            onClick={() => setFEstado(fEstado === e ? '' : e)}
            style={{
              ...c.pill,
              color: ESTADO_FOLHA_CONFIG[e].color,
              background: fEstado === e ? ESTADO_FOLHA_CONFIG[e].bg : 'transparent',
              borderColor: fEstado === e ? ESTADO_FOLHA_CONFIG[e].color : 'var(--border)',
            }}
          >
            {ESTADO_FOLHA_CONFIG[e].label} · {contagens[e] ?? 0}
          </button>
        ))}
      </div>

      <div style={c.filtros}>
        <input
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          placeholder="Pesquisar por nº, cliente ou equipamento..."
          style={{ ...c.input, flex: 1, minWidth: 220 }}
        />
        <select value={fTecnico} onChange={(e) => setFTecnico(e.target.value)} style={c.input}>
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {(fEstado || fTecnico || pesquisa) && (
          <button onClick={() => { setFEstado(''); setFTecnico(''); setPesquisa('') }} style={c.limpar}>Limpar</button>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 14, alignSelf: 'center' }}>
          {filtradas.length} de {folhas.length}
        </span>
      </div>

      {erro ? (
        <p style={{ ...c.estado, color: 'var(--danger)' }}>Não foi possível carregar as folhas de obra. {erro}</p>
      ) : carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <p style={c.estado}>{folhas.length === 0 ? 'Ainda não há folhas de obra. Cria a primeira.' : 'Nenhuma folha corresponde aos filtros.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtradas.map((fo) => (
            <button key={fo.id} onClick={() => router.push(`/tecnico/folhas-obra/${fo.id}`)} style={c.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{fo.numero}</span>
                <EstadoTag estado={fo.estado} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={c.meta}>📅 {formatarData(fo.data_intervencao)}</span>
                {fo.cliente_nome && <span style={c.meta}>👤 {fo.cliente_nome}</span>}
                {(fo.equipamento_modelo || fo.equipamento_sn) && (
                  <span style={c.meta}>🔧 {fo.equipamento_modelo ?? ''}{fo.equipamento_sn ? ` (${fo.equipamento_sn})` : ''}</span>
                )}
                {fo.tipo_servico && <span style={c.meta}>🛠 {fo.tipo_servico}</span>}
                {fo.tecnico_nome && <span style={{ ...c.meta, marginLeft: 'auto' }}>{fo.tecnico_nome}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  btnNova: { background: 'var(--primary)', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, whiteSpace: 'nowrap' },
  resumoLinha: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  pill: { border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  filtros: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit' },
  limpar: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '0 14px', fontWeight: 600, cursor: 'pointer' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  card: { textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, cursor: 'pointer', width: '100%', font: 'inherit', color: 'inherit' },
  meta: { fontSize: 12, color: 'var(--muted)' },
}
