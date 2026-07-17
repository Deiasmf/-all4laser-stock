'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import { formatarEuro } from '@/lib/alugueres'
import type { Aluguer } from '@/types/aluguer'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Nº de meses a partir do tipo de aluguer ("12 meses" -> 12, "24 meses" -> 24)
function mesesDeDuracao(tipo: string | null): number | null {
  if (!tipo) return null
  const m = tipo.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

// Data de fim prevista = início + duração − 1 dia (calculada em hora local)
function fimPrevisto(a: Aluguer): string | null {
  const meses = mesesDeDuracao(a.tipo_aluguer)
  if (!a.data_entrega || !meses) return null
  const [y, mo, d] = a.data_entrega.slice(0, 10).split('-').map(Number)
  if (!y || !mo || !d) return null
  const dt = new Date(y, mo - 1, d)
  dt.setMonth(dt.getMonth() + meses)
  dt.setDate(dt.getDate() - 1)
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  return iso
}

const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAte(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const alvo = new Date(y, m - 1, d).getTime()
  const h = new Date()
  const hoje = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime()
  return Math.round((alvo - hoje) / 86400000)
}

type EstadoContrato = { chave: 'ativo' | 'a_expirar' | 'expirado' | 'terminado'; label: string; cor: string; bg: string }

// Estado do contrato a partir das datas
function estadoContrato(a: Aluguer): EstadoContrato {
  const hoje = hojeISO()
  // Terminado: houve recolha e já passou
  if (a.data_recolha && a.data_recolha.slice(0, 10) <= hoje) {
    return { chave: 'terminado', label: 'Terminado', cor: '#374151', bg: '#E5E7EB' }
  }
  const fim = fimPrevisto(a)
  if (!fim) return { chave: 'ativo', label: 'Ativo', cor: '#065F46', bg: '#D1FAE5' }
  if (fim < hoje) return { chave: 'expirado', label: 'Expirado', cor: '#991B1B', bg: '#FEE2E2' }
  if (diasAte(fim) <= 90) return { chave: 'a_expirar', label: 'A expirar', cor: '#92400E', bg: '#FEF3C7' }
  return { chave: 'ativo', label: 'Ativo', cor: '#065F46', bg: '#D1FAE5' }
}

type Ordenacao = 'fim-asc' | 'inicio-desc' | 'cliente-asc' | 'valor-desc'

const colunasExport: ColunaExport<Aluguer>[] = [
  { cabecalho: 'Cliente', valor: (a) => a.cliente_nome ?? '' },
  { cabecalho: 'Serial Number', valor: (a) => a.serial_number ?? '' },
  { cabecalho: 'Equipamento', valor: (a) => [a.marca, a.modelo].filter(Boolean).join(' ') },
  { cabecalho: 'Início', valor: (a) => formatarData(a.data_entrega) },
  { cabecalho: 'Duração', valor: (a) => a.tipo_aluguer ?? '' },
  { cabecalho: 'Fim previsto', valor: (a) => formatarData(fimPrevisto(a)) },
  { cabecalho: 'Valor mensal', valor: (a) => formatarEuro(a.valor || 0) },
  { cabecalho: 'Estado', valor: (a) => estadoContrato(a).label },
]

export default function AlugueresInternacional() {
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [ordenar, setOrdenar] = useState<Ordenacao>('fim-asc')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase
      .from('alugueres')
      .select('*')
      .eq('nacional', false)
      .order('data_entrega', { ascending: false })
      .then(({ data }) => {
        setAlugueres((data as Aluguer[]) ?? [])
        setCarregando(false)
      })
  }, [])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    const lista = alugueres
      .filter((a) => !fEstado || estadoContrato(a).chave === fEstado)
      .filter((a) =>
        !q ||
        (a.cliente_nome ?? '').toLowerCase().includes(q) ||
        (a.serial_number ?? '').toLowerCase().includes(q) ||
        (a.modelo ?? '').toLowerCase().includes(q) ||
        (a.marca ?? '').toLowerCase().includes(q)
      )

    return [...lista].sort((a, b) => {
      switch (ordenar) {
        case 'fim-asc':
          return (fimPrevisto(a) ?? '9999').localeCompare(fimPrevisto(b) ?? '9999')
        case 'inicio-desc':
          return (b.data_entrega ?? '').localeCompare(a.data_entrega ?? '')
        case 'cliente-asc':
          return (a.cliente_nome ?? '').localeCompare(b.cliente_nome ?? '', 'pt')
        case 'valor-desc':
          return (b.valor ?? 0) - (a.valor ?? 0)
        default:
          return 0
      }
    })
  }, [alugueres, pesquisa, fEstado, ordenar])

  // Contratos em vigor (não terminados) e valor mensal total desses
  const emVigor = filtrados.filter((a) => estadoContrato(a).chave !== 'terminado')
  const mensalTotal = emVigor.reduce((acc, a) => acc + (a.valor || 0), 0)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Alugueres · Internacional</h1>
        <Link href="/" style={c.voltar}>← Stock</Link>
      </div>
      <AlugueresNav />

      <div style={c.filtros}>
        <input
          placeholder="Procurar cliente, SN, modelo..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.inputPesq}
        />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.inputSel} title="Filtrar por estado">
          <option value="">Todos os estados</option>
          <option value="ativo">Ativo</option>
          <option value="a_expirar">A expirar (≤90 dias)</option>
          <option value="expirado">Expirado</option>
          <option value="terminado">Terminado</option>
        </select>
        <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as Ordenacao)} style={c.inputSel} title="Ordenar">
          <option value="fim-asc">Fim previsto (mais próximo)</option>
          <option value="inicio-desc">Início (mais recente)</option>
          <option value="cliente-asc">Cliente (A → Z)</option>
          <option value="valor-desc">Valor (maior → menor)</option>
        </select>
        <BotaoExportar nome="alugueres-internacional" colunas={colunasExport} linhas={filtrados} />
      </div>

      <div style={c.resumo}>
        <span>{filtrados.length} contrato(s) · <strong>{emVigor.length}</strong> em vigor</span>
        <span>Valor mensal (em vigor): <strong>{formatarEuro(mensalTotal)}</strong></span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <div style={c.vazio}>
          <p style={{ margin: 0, fontWeight: 600 }}>Sem alugueres internacionais.</p>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Os alugueres de clientes fora de Portugal aparecem aqui automaticamente.
            Regista um novo em <Link href="/alugueres" style={c.link}>Registar</Link>.
          </p>
        </div>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Cliente</span>
            <span>Equipamento</span>
            <span>Início</span>
            <span>Duração</span>
            <span>Fim previsto</span>
            <span style={{ textAlign: 'right' }}>Valor/mês</span>
            <span>Estado</span>
          </div>
          {filtrados.map((a) => {
            const est = estadoContrato(a)
            return (
              <div key={a.id} style={c.linha}>
                <span style={{ fontWeight: 600 }}>{a.cliente_nome ?? '—'}</span>
                <span style={c.equip}>
                  <span style={c.equipSn}>{a.serial_number ?? '—'}</span>
                  <span style={c.equipMarca}>{[a.marca, a.modelo].filter(Boolean).join(' ') || '—'}</span>
                </span>
                <span>{formatarData(a.data_entrega)}</span>
                <span>{a.tipo_aluguer ?? '—'}</span>
                <span>{formatarData(fimPrevisto(a))}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(a.valor || 0)}</span>
                <span><span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span></span>
              </div>
            )
          })}
        </div>
      )}

      <p style={c.dica}>Para registar um contrato internacional usa o separador Registar; para editar, a Lista.</p>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  link: { color: 'var(--primary)', fontWeight: 600 },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputPesq: { flex: 1, minWidth: 160, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  inputSel: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, background: '#fff', cursor: 'pointer' },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  vazio: { background: '#fff', border: '1px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center' },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.4fr 1.5fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr', gap: 10, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 860 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  equip: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  equipSn: { fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  equipMarca: { color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  badge: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 10, textAlign: 'center' },
}
