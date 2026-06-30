'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarReparacoes, criarReparacao, atualizarReparacao, eliminarReparacao } from '@/lib/reparacaoPecas'
import type { ReparacaoPeca } from '@/types/reparacaoPeca'
import { STATUS_REPARACAO, PAGO_REPARACAO } from '@/types/reparacaoPeca'

// Cor do badge conforme o estado da reparação
function corStatus(status: string | null): string {
  const s = (status ?? '').toLowerCase()
  if (s.includes('em reparação') || s.includes('aguarda')) return '#D4820A'
  if (s.includes('fechado')) return '#16A34A'
  if (s.includes('não') || s.includes('devolu')) return '#DC2626'
  return '#6B7280'
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  return (
    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 8px', color: '#fff', background: corStatus(status) }}>
      {status}
    </span>
  )
}

export default function ReparacaoPecasPage() {
  const { isAdmin } = useAuth()
  const [registos, setRegistos] = useState<ReparacaoPeca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [aberta, setAberta] = useState<ReparacaoPeca | null>(null)
  const [criar, setCriar] = useState(false)

  async function carregar() {
    const lista = await listarReparacoes()
    setRegistos(lista)
    setCarregando(false)
  }

  useEffect(() => {
    // setState só corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  // Estados existentes nos dados (para o filtro)
  const estados = useMemo(
    () => Array.from(new Set(registos.map((r) => r.status).filter(Boolean))).sort() as string[],
    [registos]
  )

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return registos
      .filter((r) => !fStatus || r.status === fStatus)
      .filter((r) =>
        !q ||
        (r.peca ?? '').toLowerCase().includes(q) ||
        (r.fornecedor ?? '').toLowerCase().includes(q) ||
        (r.serial_number ?? '').toLowerCase().includes(q) ||
        (r.observacoes ?? '').toLowerCase().includes(q)
      )
  }, [registos, pesquisa, fStatus])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Stock Reparação de Peças</h1>
        <Link href="/logistico" style={c.voltar}>← Logística</Link>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar por peça, fornecedor, serial..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.input}
        />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          {estados.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {isAdmin && (
          <button style={c.btnPrimario} onClick={() => setCriar(true)}>+ Novo registo</button>
        )}
      </div>

      <div style={c.resumo}>
        <span>{filtrados.length} registo(s)</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem registos.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Peça / Fornecedor</span>
            <span>Estado</span>
            <span style={{ textAlign: 'right' }}>Entrada</span>
          </div>
          {filtrados.map((r) => (
            <div key={r.id} style={{ ...c.linha, ...c.clicavel }} onClick={() => setAberta(r)}>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{r.peca || '—'}</span>
                {r.serial_number && <span style={c.serialTag}>S/N: {r.serial_number}</span>}
                <span style={c.fornecedor}>{r.fornecedor || '—'}</span>
              </span>
              <span><StatusBadge status={r.status} /></span>
              <span style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 13 }}>{r.data_entrada || '—'}</span>
            </div>
          ))}
        </div>
      )}

      <p style={c.dica}>Toca num registo para ver os detalhes{isAdmin ? ' e editar' : ''}.</p>

      {(aberta || criar) && (
        <ModalReparacao
          registo={aberta}
          isAdmin={isAdmin}
          onFechar={() => { setAberta(null); setCriar(false) }}
          onGuardado={() => { setAberta(null); setCriar(false); carregar() }}
        />
      )}
    </main>
  )
}

function ModalReparacao({
  registo, isAdmin, onFechar, onGuardado,
}: {
  registo: ReparacaoPeca | null
  isAdmin: boolean
  onFechar: () => void
  onGuardado: () => void
}) {
  const [fornecedor, setFornecedor] = useState(registo?.fornecedor ?? '')
  const [peca, setPeca] = useState(registo?.peca ?? '')
  const [serialNumber, setSerialNumber] = useState(registo?.serial_number ?? '')
  const [avaria, setAvaria] = useState(registo?.avaria ?? '')
  const [garantia, setGarantia] = useState(registo?.garantia ?? '')
  const [dataSaida, setDataSaida] = useState(registo?.data_saida ?? '')
  const [dataEntrada, setDataEntrada] = useState(registo?.data_entrada ?? '')
  const [status, setStatus] = useState(registo?.status ?? '')
  const [pago, setPago] = useState(registo?.pago ?? '')
  const [observacoes, setObservacoes] = useState(registo?.observacoes ?? '')
  const [aGuardar, setAGuardar] = useState(false)
  const [aApagar, setAApagar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const soLeitura = !isAdmin

  async function guardar() {
    setErro(null)
    if (!peca.trim() && !fornecedor.trim()) { setErro('Indica pelo menos a peça ou o fornecedor.'); return }
    setAGuardar(true)
    const payload = {
      fornecedor: fornecedor.trim() || null,
      peca: peca.trim() || null,
      serial_number: serialNumber.trim() || null,
      avaria: avaria.trim() || null,
      garantia: garantia.trim() || null,
      data_saida: dataSaida || null,
      data_entrada: dataEntrada || null,
      status: status.trim() || null,
      pago: pago.trim() || null,
      observacoes: observacoes.trim() || null,
    }
    const { error } = registo ? await atualizarReparacao(registo.id, payload) : await criarReparacao(payload)
    setAGuardar(false)
    if (error) { setErro('Erro a guardar: ' + error.message); return }
    onGuardado()
  }

  async function apagar() {
    if (!registo) return
    if (!confirm('Apagar este registo de reparação? Esta ação não pode ser anulada.')) return
    setAApagar(true)
    const { error } = await eliminarReparacao(registo.id)
    setAApagar(false)
    if (error) { setErro('Erro a apagar: ' + error.message); return }
    onGuardado()
  }

  const titulo = !registo ? 'Novo registo' : soLeitura ? 'Reparação' : 'Editar reparação'

  // Garante que o estado/pago do registo aparece na lista mesmo que não esteja nas constantes
  const estadosOpcoes = Array.from(new Set([...STATUS_REPARACAO, ...(status ? [status] : [])]))
  const pagoOpcoes = Array.from(new Set([...PAGO_REPARACAO, ...(pago ? [pago] : [])]))

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>{titulo}</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>

        {erro && <div style={c.erro}>{erro}</div>}

        <label style={c.label}>Peça</label>
        <input style={c.inputModal} value={peca} onChange={(e) => setPeca(e.target.value)} placeholder="Ex: Fonte MGL" disabled={soLeitura} />

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Fornecedor de serviço</label>
            <input style={c.inputModal} value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} disabled={soLeitura} />
          </div>
          <div>
            <label style={c.label}>Serial Number</label>
            <input style={c.inputModal} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} disabled={soLeitura} />
          </div>
        </div>

        <label style={c.label}>Descrição da avaria</label>
        <input style={c.inputModal} value={avaria} onChange={(e) => setAvaria(e.target.value)} disabled={soLeitura} />

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Data de saída</label>
            <input style={c.inputModal} type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} disabled={soLeitura} />
          </div>
          <div>
            <label style={c.label}>Data de entrada</label>
            <input style={c.inputModal} type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} disabled={soLeitura} />
          </div>
        </div>

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Estado</label>
            <select style={c.inputModal} value={status} onChange={(e) => setStatus(e.target.value)} disabled={soLeitura}>
              <option value="">—</option>
              {estadosOpcoes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={c.label}>Pago</label>
            <select style={c.inputModal} value={pago} onChange={(e) => setPago(e.target.value)} disabled={soLeitura}>
              <option value="">—</option>
              {pagoOpcoes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <label style={c.label}>Garantia</label>
        <input style={c.inputModal} value={garantia} onChange={(e) => setGarantia(e.target.value)} placeholder="Ex: S/ Garantia" disabled={soLeitura} />

        <label style={c.label}>Observações</label>
        <textarea style={c.textarea} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} disabled={soLeitura} />

        <div style={c.modalAcoes}>
          {registo && isAdmin && (
            <button onClick={apagar} disabled={aApagar} style={c.btnDanger}>
              {aApagar ? 'A apagar...' : 'Apagar'}
            </button>
          )}
          <button onClick={onFechar} style={c.btnGhost}>{soLeitura ? 'Fechar' : 'Cancelar'}</button>
          {isAdmin && (
            <button onClick={guardar} disabled={aGuardar} style={c.btnPrimario}>
              {aGuardar ? 'A guardar...' : 'Guardar'}
            </button>
          )}
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
  input: { flex: 1, minWidth: 160, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8 },
  linha: { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center' },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  serialTag: { marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--muted)' },
  fornecedor: { display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 10, textAlign: 'center' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  modalCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4, display: 'block' },
  inputModal: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 60, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', resize: 'vertical' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginTop: 8, color: '#c62828' },
  modalAcoes: { display: 'flex', gap: 8, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { background: '#fff', color: 'var(--danger, #c62828)', border: '1px solid var(--danger, #c62828)', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
}
