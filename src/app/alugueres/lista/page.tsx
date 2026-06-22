'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import { formatarEuro, mesAtual, nomeMes, somar } from '@/lib/alugueres'
import {
  TIPOS_ALUGUER,
  TIPOS_INTERNACIONAL,
  METODOS_PAGAMENTO,
  type Aluguer,
} from '@/types/aluguer'

const BUCKET_FATURAS = 'faturas-alugueres'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Limpa o nome do ficheiro (só letras, números, ponto e traço)
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

export default function ListaAlugueres() {
  const { isAdmin } = useAuth()
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [mes, setMes] = useState(mesAtual())
  const [pesquisa, setPesquisa] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [editar, setEditar] = useState<Aluguer | null>(null)

  useEffect(() => {
    supabase
      .from('alugueres')
      .select('*')
      .order('data_entrega', { ascending: false })
      .then(({ data }) => {
        const lista = (data as Aluguer[]) ?? []
        setAlugueres(lista)
        setCarregando(false)
        // abrir no mês mais recente que tenha registos
        const ms = lista.map((a) => (a.data_entrega ?? '').slice(0, 7)).filter(Boolean).sort()
        if (ms.length) setMes(ms[ms.length - 1])
      })
  }, [])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return alugueres
      .filter((a) => (a.data_entrega ?? '').startsWith(mes))
      .filter((a) => !q || (a.cliente_nome ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.cliente_nome ?? '').localeCompare(b.cliente_nome ?? '', 'pt'))
  }, [alugueres, mes, pesquisa])

  const total = somar(filtrados, (a) => a.valor)

  // Resumo de faturação do mês mostrado
  const totalFaturar = somar(filtrados, (a) => (a.nao_faturar ? 0 : a.valor_a_faturar))
  const numNaoFaturar = filtrados.filter((a) => a.nao_faturar).length
  const numPorDefinir = filtrados.filter((a) => a.valor_a_faturar == null && !a.nao_faturar).length

  // Atualiza a faturação de um aluguer (otimista + persistência imediata)
  async function atualizarFaturacao(id: string, patch: Partial<Aluguer>) {
    setAlugueres((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    const { error } = await supabase
      .from('alugueres')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) alert('Erro a guardar: ' + error.message)
  }

  function aoGuardar(atualizado: Aluguer) {
    setAlugueres((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)))
    setEditar(null)
  }

  function aoEliminar(id: string) {
    setAlugueres((prev) => prev.filter((a) => a.id !== id))
    setEditar(null)
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Alugueres</h1>
        <Link href="/" style={c.voltar}>← Stock</Link>
      </div>
      <AlugueresNav />

      <div style={c.filtros}>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.inputMes} />
        <input
          placeholder="Procurar cliente..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.inputPesq}
        />
      </div>

      <div style={c.resumo}>
        <span style={{ textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
        <span>{filtrados.length} aluguer(es) · <strong>{formatarEuro(total)}</strong></span>
      </div>

      <div style={c.resumoFaturar}>
        <div style={c.resumoFaturarTopo}>
          <span style={c.resumoFaturarLabel}>Total a faturar este mês</span>
          <span style={c.resumoFaturarValor}>{formatarEuro(totalFaturar)}</span>
        </div>
        <div style={c.resumoFaturarLinha}>
          <span>Nº de alugueres: <strong>{filtrados.length}</strong></span>
          <span>Não faturar: <strong>{numNaoFaturar}</strong></span>
          <span>Por definir: <strong>{numPorDefinir}</strong></span>
        </div>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem alugueres neste mês.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Cliente</span>
            <span>Data</span>
            <span>Método</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span>Valor a Faturar</span>
            <span>Fatura</span>
          </div>
          {filtrados.map((a) => (
            <div
              key={a.id}
              style={{ ...c.linha, ...(isAdmin ? c.linhaClicavel : {}) }}
              onClick={isAdmin ? () => setEditar(a) : undefined}
              title={isAdmin ? 'Clica para editar ou apagar' : undefined}
            >
              <span style={{ fontWeight: 600 }}>
                {a.cliente_nome ?? '—'}
                {!a.nacional && <span style={c.intl}>Internacional</span>}
              </span>
              <span>{formatarData(a.data_entrega)}</span>
              <span>{a.metodo_pagamento ?? '—'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(a.valor || 0)}</span>
              <span style={c.celula} onClick={(e) => e.stopPropagation()}>
                <CelulaFaturar aluguer={a} podeEditar={isAdmin} onChange={atualizarFaturacao} />
              </span>
              <span style={c.celula} onClick={(e) => e.stopPropagation()}>
                <CelulaFatura aluguer={a} podeEditar={isAdmin} onChange={atualizarFaturacao} />
              </span>
            </div>
          ))}
        </div>
      )}

      {isAdmin && <p style={c.dica}>Toca num aluguer para editar ou apagar.</p>}

      {editar && (
        <ModalEditar
          aluguer={editar}
          onFechar={() => setEditar(null)}
          onGuardado={aoGuardar}
          onEliminado={aoEliminar}
        />
      )}
    </main>
  )
}

// ------------------------------------------------------ CÉLULA: VALOR A FATURAR
function CelulaFaturar({
  aluguer, podeEditar, onChange,
}: {
  aluguer: Aluguer
  podeEditar: boolean
  onChange: (id: string, patch: Partial<Aluguer>) => void
}) {
  const definido = aluguer.valor_a_faturar != null
  const naoFaturar = !!aluguer.nao_faturar
  const valorTotal = aluguer.valor ?? 0

  // Modo atual a partir dos dados guardados
  let modo: '' | 'total' | '50' | 'outro' | 'nao' = ''
  if (naoFaturar) modo = 'nao'
  else if (definido) {
    if (aluguer.valor_a_faturar === valorTotal) modo = 'total'
    else if (aluguer.valor_a_faturar === 50) modo = '50'
    else modo = 'outro'
  }

  const [editarOutro, setEditarOutro] = useState(false)
  const [manual, setManual] = useState(definido ? String(aluguer.valor_a_faturar) : '')

  const mostrarInput = modo === 'outro' || editarOutro

  // Viewers só veem o resultado, sem controlos
  if (!podeEditar) {
    if (naoFaturar) return <span style={c.badgeCinza}>Não faturar</span>
    if (definido) return <span style={c.valorVerde}>{formatarEuro(aluguer.valor_a_faturar!)}</span>
    return <span style={c.semDef}>—</span>
  }

  function aplicar(patch: Partial<Aluguer>) {
    onChange(aluguer.id, patch)
    setEditarOutro(false)
  }

  function aoMudar(v: string) {
    if (v === 'outro') {
      setManual(definido ? String(aluguer.valor_a_faturar) : '')
      setEditarOutro(true)
      return
    }
    if (v === 'total') return aplicar({ valor_a_faturar: valorTotal, nao_faturar: false })
    if (v === '50') return aplicar({ valor_a_faturar: 50, nao_faturar: false })
    if (v === 'nao') return aplicar({ valor_a_faturar: null, nao_faturar: true })
    aplicar({ valor_a_faturar: null, nao_faturar: false }) // "— definir —"
  }

  function guardarManual() {
    const v = manual.trim()
    if (v === '' || isNaN(Number(v))) { setEditarOutro(false); return }
    aplicar({ valor_a_faturar: Number(v), nao_faturar: false })
  }

  const estiloSelect = naoFaturar ? c.selectCinza : definido ? c.selectVerde : c.selectFaturar

  return (
    <span style={c.faturarLinha}>
      <select
        style={estiloSelect}
        value={mostrarInput ? 'outro' : modo}
        onChange={(e) => aoMudar(e.target.value)}
      >
        <option value="">— definir —</option>
        <option value="total">Valor total ({formatarEuro(valorTotal)})</option>
        <option value="50">50 €</option>
        <option value="outro">Outro valor…</option>
        <option value="nao">Não faturar</option>
      </select>
      {mostrarInput && (
        <input
          style={c.inputManual}
          type="number"
          inputMode="decimal"
          placeholder="€"
          autoFocus
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardarManual() }}
          onBlur={guardarManual}
        />
      )}
    </span>
  )
}

// ------------------------------------------------------------- CÉLULA: FATURA
function CelulaFatura({
  aluguer, podeEditar, onChange,
}: {
  aluguer: Aluguer
  podeEditar: boolean
  onChange: (id: string, patch: Partial<Aluguer>) => void
}) {
  const [aCarregar, setACarregar] = useState(false)
  const temFatura = !!aluguer.fatura_url

  async function carregar(file: File) {
    setACarregar(true)
    const caminho = `${aluguer.id}/${Date.now()}-${nomeSeguro(file.name)}`
    const { error: erroUp } = await supabase.storage.from(BUCKET_FATURAS).upload(caminho, file)
    if (erroUp) {
      setACarregar(false)
      alert('Erro a carregar a fatura: ' + erroUp.message)
      return
    }
    const { data: pub } = supabase.storage.from(BUCKET_FATURAS).getPublicUrl(caminho)
    onChange(aluguer.id, { fatura_url: pub.publicUrl, fatura_caminho: caminho, fatura_nome: file.name })
    setACarregar(false)
  }

  async function remover() {
    if (!window.confirm(`Remover a fatura “${aluguer.fatura_nome ?? ''}”?`)) return
    if (aluguer.fatura_caminho) await supabase.storage.from(BUCKET_FATURAS).remove([aluguer.fatura_caminho])
    onChange(aluguer.id, { fatura_url: null, fatura_caminho: null, fatura_nome: null })
  }

  if (temFatura) {
    return (
      <span style={c.faturaLinha}>
        <a href={aluguer.fatura_url!} target="_blank" rel="noopener noreferrer" style={c.faturaLink}>
          📄 {aluguer.fatura_nome ?? 'fatura'}
        </a>
        {podeEditar && (
          <button style={c.chipApagar} onClick={remover} title="Remover fatura">×</button>
        )}
      </span>
    )
  }

  if (!podeEditar) return <span style={c.semDef}>—</span>

  return (
    <label style={c.btnAnexar}>
      {aCarregar ? '...' : '📎 Anexar'}
      <input
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) carregar(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

// ---------------------------------------------------------------- EDITAR
function ModalEditar({
  aluguer, onFechar, onGuardado, onEliminado,
}: {
  aluguer: Aluguer
  onFechar: () => void
  onGuardado: (a: Aluguer) => void
  onEliminado: (id: string) => void
}) {
  const [clienteNome, setClienteNome] = useState(aluguer.cliente_nome ?? '')
  const [serial, setSerial] = useState(aluguer.serial_number ?? '')
  const [marca, setMarca] = useState(aluguer.marca ?? '')
  const [modelo, setModelo] = useState(aluguer.modelo ?? '')
  const [ano, setAno] = useState(aluguer.ano ?? '')
  const [nacional, setNacional] = useState(aluguer.nacional ?? true)
  const [tipo, setTipo] = useState(aluguer.tipo_aluguer ?? '')
  const [valor, setValor] = useState(aluguer.valor != null ? String(aluguer.valor) : '')
  const [metodo, setMetodo] = useState(aluguer.metodo_pagamento ?? '')
  const [dataEntrega, setDataEntrega] = useState((aluguer.data_entrega ?? '').slice(0, 10))
  const [dataRecolha, setDataRecolha] = useState((aluguer.data_recolha ?? '').slice(0, 10))

  const [aGuardar, setAGuardar] = useState(false)
  const [aApagar, setAApagar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Tipos disponíveis conforme o mercado; garante que o valor atual aparece sempre
  const tiposBase: readonly string[] = nacional ? TIPOS_ALUGUER : TIPOS_INTERNACIONAL
  const tipos = tipo && !tiposBase.includes(tipo) ? [tipo, ...tiposBase] : tiposBase

  async function guardar() {
    setErro(null)
    if (!clienteNome.trim()) return setErro('Indica o cliente.')
    if (!serial.trim()) return setErro('Indica o serial number.')
    if (valor.trim() && isNaN(Number(valor))) return setErro('O valor não é válido.')

    setAGuardar(true)
    const patch = {
      cliente_nome: clienteNome.trim(),
      serial_number: serial.trim(),
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      ano: ano.trim() || null,
      nacional,
      tipo_aluguer: tipo || null,
      valor: valor.trim() ? Number(valor) : null,
      metodo_pagamento: metodo || null,
      data_entrega: dataEntrega || null,
      data_recolha: dataRecolha || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('alugueres')
      .update(patch)
      .eq('id', aluguer.id)
      .select()
      .single()
    setAGuardar(false)
    if (error) return setErro('Erro a guardar: ' + error.message)
    onGuardado(data as Aluguer)
  }

  async function eliminar() {
    if (!confirm(`Apagar o aluguer de ${aluguer.cliente_nome ?? 'cliente'} (${aluguer.serial_number ?? '—'})? Esta ação não pode ser anulada.`)) return
    setErro(null)
    setAApagar(true)
    const { error } = await supabase.from('alugueres').delete().eq('id', aluguer.id)
    setAApagar(false)
    if (error) return setErro('Erro a apagar: ' + error.message)
    onEliminado(aluguer.id)
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>Editar aluguer</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>

        {erro && <div style={c.erro}>{erro}</div>}

        <label style={c.label}>Cliente</label>
        <input style={c.input} value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />

        <label style={c.label}>Serial number</label>
        <input style={c.input} value={serial} onChange={(e) => setSerial(e.target.value)} />

        <div style={c.linha3}>
          <div>
            <label style={c.label}>Marca</label>
            <input style={c.input} value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
          <div>
            <label style={c.label}>Modelo</label>
            <input style={c.input} value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </div>
          <div>
            <label style={c.label}>Ano</label>
            <input style={c.input} value={ano} onChange={(e) => setAno(e.target.value)} />
          </div>
        </div>

        <label style={c.checkLinha}>
          <input
            type="checkbox"
            checked={!nacional}
            onChange={(e) => setNacional(!e.target.checked)}
          />
          Aluguer internacional
        </label>

        <label style={c.label}>Tipo de aluguer</label>
        <select style={c.input} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">— escolher —</option>
          {tipos.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Valor (€)</label>
            <input
              style={c.input}
              type="number"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div>
            <label style={c.label}>Método de pagamento</label>
            <select style={c.input} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="">— escolher —</option>
              {METODOS_PAGAMENTO.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Data de entrega</label>
            <input style={c.input} type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
          </div>
          <div>
            <label style={c.label}>Data de recolha</label>
            <input style={c.input} type="date" value={dataRecolha} onChange={(e) => setDataRecolha(e.target.value)} />
          </div>
        </div>

        <div style={c.modalAcoes}>
          <button onClick={eliminar} disabled={aApagar} style={c.btnDanger}>
            {aApagar ? 'A apagar...' : 'Apagar'}
          </button>
          <button onClick={onFechar} style={c.btnGhost}>Cancelar</button>
          <button onClick={guardar} disabled={aGuardar} style={c.btnPrimario}>
            {aGuardar ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputMes: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  inputPesq: { flex: 1, minWidth: 160, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8 },

  // Resumo de faturação do mês
  resumoFaturar: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  resumoFaturarTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  resumoFaturarLabel: { fontSize: 14, fontWeight: 600, color: 'var(--muted)' },
  resumoFaturarValor: { fontSize: 22, fontWeight: 800, color: '#1b873f' },
  resumoFaturarLinha: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' },

  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 0.9fr 1.7fr 1.5fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 720 },
  linhaClicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  intl: { marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent, #3552eb)', borderRadius: 999, padding: '1px 6px' },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 10, textAlign: 'center' },

  // Célula "Valor a Faturar"
  celula: { display: 'flex', alignItems: 'center', minWidth: 0 },
  faturarLinha: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  selectFaturar: { padding: '5px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, background: '#fff', color: 'var(--muted)', cursor: 'pointer', maxWidth: '100%' },
  selectVerde: { padding: '5px 8px', border: '1px solid #1b873f', borderRadius: 6, fontSize: 13, background: '#fff', color: '#1b873f', fontWeight: 700, cursor: 'pointer', maxWidth: '100%' },
  selectCinza: { padding: '5px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, background: '#f3f3f3', color: 'var(--muted)', fontWeight: 600, cursor: 'pointer', maxWidth: '100%' },
  inputManual: { width: 72, padding: '5px 6px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 },
  valorVerde: { color: '#1b873f', fontWeight: 700, fontSize: 14 },
  badgeCinza: { background: '#eee', color: 'var(--muted)', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 },
  semDef: { color: 'var(--muted)' },

  // Célula "Fatura"
  faturaLinha: { display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' },
  faturaLink: { fontSize: 13, color: 'var(--foreground)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 },
  chipApagar: { width: 20, height: 20, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.12)', color: 'var(--danger, #c62828)', fontSize: 14, lineHeight: 1, cursor: 'pointer', flexShrink: 0 },
  btnAnexar: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },

  // Modal de edição
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  modalCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  linha3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14, fontWeight: 600 },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginTop: 8, color: '#c62828' },
  modalAcoes: { display: 'flex', gap: 8, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { background: '#fff', color: 'var(--danger, #c62828)', border: '1px solid var(--danger, #c62828)', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
}
