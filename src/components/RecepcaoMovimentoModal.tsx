'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { criarMovimento } from '@/lib/recepcao'
import { listarClientesCompleto } from '@/lib/clientes'
import { listarFornecedoresReparacao } from '@/lib/reparacaoPecas'
import { pesquisarPecas } from '@/lib/pecas'
import { pesquisarEquipamentos } from '@/lib/folhasObra'
import type { EquipOpc } from '@/lib/folhasObra'
import type { Peca } from '@/types/peca'
import type { RecepcaoMovimento, TipoMovimento, ReferenciaTipo } from '@/types/recepcao'

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

type Prefill = Partial<{
  tipo: TipoMovimento
  origem_destino: string
  descricao: string
  referencia_tipo: ReferenciaTipo
  referencia_id: string
  referencia_numero: string
  qr_lido: boolean
}>

export default function RecepcaoMovimentoModal({
  aberto,
  onFechar,
  onGravado,
  prefill,
}: {
  aberto: boolean
  onFechar: () => void
  onGravado: (m: RecepcaoMovimento) => void
  prefill?: Prefill
}) {
  const { perfil } = useAuth()

  const [tipo, setTipo] = useState<TipoMovimento>('entrada')
  const [dataMov, setDataMov] = useState(hoje())
  const [origem, setOrigem] = useState('')
  const [descricao, setDescricao] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [sns, setSns] = useState<string[]>([])
  const [snInput, setSnInput] = useState('')
  const [equipSn, setEquipSn] = useState('')
  const [equipId, setEquipId] = useState<string | null>(null)
  const [refNumero, setRefNumero] = useState('')
  const [refTipo, setRefTipo] = useState<ReferenciaTipo>('manual')
  const [refId, setRefId] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Opções de origem/destino (clientes + fornecedores de reparação)
  const [contrapartes, setContrapartes] = useState<string[]>([])
  const [sugOrigem, setSugOrigem] = useState<string[]>([])
  const [sugDesc, setSugDesc] = useState<Peca[]>([])
  const [sugEquip, setSugEquip] = useState<EquipOpc[]>([])
  const [sugRef, setSugRef] = useState<{ id: string; numero: string; peca: string | null }[]>([])

  // Repõe o formulário sempre que abre (aplicando prefill do scan)
  useEffect(() => {
    if (!aberto) return
    setTipo(prefill?.tipo ?? 'entrada')
    setDataMov(hoje())
    setOrigem(prefill?.origem_destino ?? '')
    setDescricao(prefill?.descricao ?? '')
    setQuantidade('1')
    setSns([]); setSnInput('')
    setEquipSn(''); setEquipId(null)
    setRefNumero(prefill?.referencia_numero ?? '')
    setRefTipo(prefill?.referencia_tipo ?? 'manual')
    setRefId(prefill?.referencia_id ?? null)
    setNotas('')
    setErro(null)
    setSugOrigem([]); setSugDesc([]); setSugEquip([]); setSugRef([])
  }, [aberto, prefill])

  // Carrega contrapartes uma vez
  useEffect(() => {
    if (!aberto || contrapartes.length > 0) return
    ;(async () => {
      const [clientes, forn] = await Promise.all([
        listarClientesCompleto(),
        listarFornecedoresReparacao(),
      ])
      const nomes = [
        ...clientes.map((c) => c.nome).filter(Boolean) as string[],
        ...forn.map((f) => f.nome),
        'All4laser',
      ]
      setContrapartes(Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, 'pt')))
    })()
  }, [aberto, contrapartes.length])

  function filtrarOrigem(q: string) {
    const t = q.trim().toLowerCase()
    setSugOrigem(t.length < 1 ? [] : contrapartes.filter((n) => n.toLowerCase().includes(t)).slice(0, 8))
  }

  const descRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function procurarDesc(q: string) {
    if (descRef.current) clearTimeout(descRef.current)
    descRef.current = setTimeout(async () => {
      setSugDesc(q.trim().length >= 2 ? await pesquisarPecas(q) : [])
    }, 250)
  }

  const equipRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function procurarEquip(q: string) {
    if (equipRef.current) clearTimeout(equipRef.current)
    equipRef.current = setTimeout(async () => {
      setSugEquip(q.trim().length >= 2 ? await pesquisarEquipamentos(q) : [])
    }, 250)
  }

  const refBuscaRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function procurarRef(q: string) {
    if (refBuscaRef.current) clearTimeout(refBuscaRef.current)
    refBuscaRef.current = setTimeout(async () => {
      const t = q.trim()
      if (t.length < 2) { setSugRef([]); return }
      const { data } = await supabase
        .from('reparacao_pecas')
        .select('id, numero, peca')
        .ilike('numero', `%${t}%`)
        .limit(8)
      setSugRef((data as { id: string; numero: string; peca: string | null }[]) ?? [])
    }, 250)
  }

  function adicionarSn() {
    const v = snInput.trim()
    if (!v) return
    if (!sns.includes(v)) setSns((s) => [...s, v])
    setSnInput('')
  }

  async function gravar() {
    if (!origem.trim()) { setErro('Indica a origem/destino.'); return }
    if (!descricao.trim()) { setErro('Indica a descrição da peça.'); return }
    setErro(null)
    setAGravar(true)
    try {
      const { data, error } = await criarMovimento({
        tipo,
        data_movimento: dataMov || hoje(),
        origem_destino: origem.trim(),
        descricao: descricao.trim(),
        quantidade: Number(quantidade) || 1,
        serial_numbers: sns.length ? sns : null,
        equipamento_sn: equipSn.trim() || null,
        equipamento_id: equipId,
        referencia_tipo: refTipo,
        referencia_id: refId,
        referencia_numero: refNumero.trim() || null,
        qr_lido: prefill?.qr_lido ?? false,
        notas: notas.trim() || null,
        criado_por: perfil?.id ?? null,
        criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
      })
      if (error) throw error
      onGravado(data as RecepcaoMovimento)
    } catch (e) {
      setErro('Erro ao gravar: ' + (e instanceof Error ? e.message : 'desconhecido'))
    } finally {
      setAGravar(false)
    }
  }

  if (!aberto) return null

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.cabecalho}>
          <h2 style={s.titulo}>Registar movimento</h2>
          <button style={s.fechar} onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {erro && <div style={s.erro}>{erro}</div>}

        <div style={s.tipoRow}>
          <button
            type="button"
            style={{ ...s.tipoBtn, ...(tipo === 'entrada' ? s.tipoEntradaAtivo : {}) }}
            onClick={() => setTipo('entrada')}
          >↓ Entrada</button>
          <button
            type="button"
            style={{ ...s.tipoBtn, ...(tipo === 'saida' ? s.tipoSaidaAtivo : {}) }}
            onClick={() => setTipo('saida')}
          >↑ Saída</button>
        </div>

        <label style={s.label}>Data</label>
        <input style={s.input} type="date" value={dataMov} onChange={(e) => setDataMov(e.target.value)} />

        <label style={s.label}>Origem / Destino *</label>
        <div style={{ position: 'relative' }}>
          <input
            style={s.input}
            placeholder="Cliente, fornecedor ou texto livre"
            value={origem}
            onChange={(e) => { setOrigem(e.target.value); filtrarOrigem(e.target.value) }}
          />
          {sugOrigem.length > 0 && (
            <div style={s.dropdown}>
              {sugOrigem.map((n) => (
                <button type="button" key={n} style={s.dropItem} onClick={() => { setOrigem(n); setSugOrigem([]) }}>{n}</button>
              ))}
            </div>
          )}
        </div>

        <label style={s.label}>Descrição da peça *</label>
        <div style={{ position: 'relative' }}>
          <input
            style={s.input}
            placeholder='Ex.: "Fibra 18mm × 3"'
            value={descricao}
            onChange={(e) => { setDescricao(e.target.value); procurarDesc(e.target.value) }}
          />
          {sugDesc.length > 0 && (
            <div style={s.dropdown}>
              {sugDesc.map((p) => (
                <button type="button" key={p.id} style={s.dropItem} onClick={() => { setDescricao(p.nome); setSugDesc([]) }}>
                  {p.nome}{p.serial_number ? ` · S/N ${p.serial_number}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <label style={s.label}>Quantidade</label>
        <input style={s.input} type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />

        <label style={s.label}>Serial Numbers</label>
        <div style={s.snRow}>
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Escreve um SN e Enter"
            value={snInput}
            onChange={(e) => setSnInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarSn() } }}
          />
          <button type="button" style={s.btnGhost} onClick={adicionarSn}>+ Adicionar</button>
        </div>
        {sns.length > 0 && (
          <div style={s.tags}>
            {sns.map((sn) => (
              <span key={sn} style={s.tag}>
                {sn}
                <button type="button" style={s.tagX} onClick={() => setSns((a) => a.filter((x) => x !== sn))}>✕</button>
              </span>
            ))}
          </div>
        )}

        <label style={s.label}>Equipamento associado (opcional)</label>
        <div style={{ position: 'relative' }}>
          <input
            style={s.input}
            placeholder="Procurar por SN do equipamento"
            value={equipSn}
            onChange={(e) => { setEquipSn(e.target.value); setEquipId(null); procurarEquip(e.target.value) }}
          />
          {equipId === null && sugEquip.length > 0 && (
            <div style={s.dropdown}>
              {sugEquip.map((eq) => (
                <button type="button" key={eq.id} style={s.dropItem} onClick={() => { setEquipSn(eq.serial_number ?? ''); setEquipId(eq.id); setSugEquip([]) }}>
                  {eq.modelo || '—'}{eq.serial_number ? ` · S/N ${eq.serial_number}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <label style={s.label}>Referência (opcional)</label>
        <div style={{ position: 'relative' }}>
          <input
            style={s.input}
            placeholder="Nº RPC / EP / NE"
            value={refNumero}
            onChange={(e) => { setRefNumero(e.target.value); setRefId(null); setRefTipo('manual'); procurarRef(e.target.value) }}
          />
          {refId === null && sugRef.length > 0 && (
            <div style={s.dropdown}>
              {sugRef.map((rp) => (
                <button type="button" key={rp.id} style={s.dropItem} onClick={() => { setRefNumero(rp.numero); setRefId(rp.id); setRefTipo('reparacao'); setSugRef([]) }}>
                  {rp.numero}{rp.peca ? ` · ${rp.peca}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <label style={s.label}>Notas</label>
        <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }} value={notas} onChange={(e) => setNotas(e.target.value)} />

        <div style={s.botoes}>
          <button type="button" style={s.btnGhost} onClick={onFechar}>Cancelar</button>
          <button type="button" style={s.btnPrimario} onClick={gravar} disabled={aGravar}>
            {aGravar ? 'A gravar...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 480, margin: '24px auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  titulo: { fontSize: 19, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 10, marginBottom: 10, color: '#c62828', fontSize: 14 },
  tipoRow: { display: 'flex', gap: 8, marginBottom: 6 },
  tipoBtn: { flex: 1, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  tipoEntradaAtivo: { background: '#d7f5df', borderColor: '#7bd399', color: '#14652f' },
  tipoSaidaAtivo: { background: '#ffdede', borderColor: '#e79a9a', color: '#a12626' },
  label: { fontWeight: 600, fontSize: 13, marginTop: 12, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 200, overflowY: 'auto' },
  dropItem: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f2f2f2' },
  snRow: { display: 'flex', gap: 8 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-bg)', color: 'var(--primary-dark)', borderRadius: 999, padding: '3px 10px', fontSize: 13, fontWeight: 600 },
  tagX: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12, padding: 0 },
  botoes: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
}
