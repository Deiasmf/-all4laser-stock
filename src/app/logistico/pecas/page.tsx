'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarPecas, criarPeca, atualizarPeca, eliminarPeca } from '@/lib/pecas'
import { pecasComPedidoPendente } from '@/lib/compras'
import { LOCALIZACOES_PECA } from '@/types/compras'
import QrPeca from '@/components/QrPeca'
import type { Peca } from '@/types/peca'

// Badge de alerta de stock: vermelho se <= 10, amarelo se <= 20.
function StockBadge({ q }: { q: number }) {
  if (q > 20) return null
  const baixo = q <= 10
  return (
    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', color: '#fff', background: baixo ? '#DC2626' : '#D4820A' }}>
      {baixo ? 'stock crítico' : 'stock baixo'}
    </span>
  )
}

export default function StockPecasPage() {
  const { isAdmin } = useAuth()
  const [pecas, setPecas] = useState<Peca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const [fMarca, setFMarca] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [aberta, setAberta] = useState<Peca | null>(null)
  const [criar, setCriar] = useState(false)
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  // Id da peça vinda de um QR Code (?peca=<id>), lido uma única vez
  const qrPecaId = useRef<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('peca') : null
  )

  async function carregar() {
    const lista = await listarPecas()
    setPecas(lista)
    setCarregando(false)
    // Abrir automaticamente a peça vinda de um QR Code, já depois do await
    if (qrPecaId.current) {
      const f = lista.find((p) => p.id === qrPecaId.current)
      if (f) setAberta(f)
      qrPecaId.current = null
    }
  }

  useEffect(() => {
    // setState só corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    pecasComPedidoPendente().then(setPendentes)
  }, [])

  const marcas = useMemo(() => Array.from(new Set(pecas.map((p) => p.marca).filter(Boolean))) as string[], [pecas])
  const grupos = useMemo(
    () => Array.from(new Set(pecas.filter((p) => !fMarca || p.marca === fMarca).map((p) => p.grupo).filter(Boolean))) as string[],
    [pecas, fMarca]
  )

  const filtradas = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return pecas
      .filter((p) => !fMarca || p.marca === fMarca)
      .filter((p) => !fGrupo || p.grupo === fGrupo)
      .filter((p) => !q || p.nome.toLowerCase().includes(q) || (p.grupo ?? '').toLowerCase().includes(q))
  }, [pecas, pesquisa, fMarca, fGrupo])

  const totalUnidades = filtradas.reduce((a, p) => a + (p.quantidade || 0), 0)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Stock de Peças</h1>
        <Link href="/logistico" style={c.voltar}>← Logística</Link>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar peça..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.input}
        />
        <select value={fMarca} onChange={(e) => { setFMarca(e.target.value); setFGrupo('') }} style={c.select}>
          <option value="">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} style={c.select}>
          <option value="">Todos os grupos</option>
          {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {isAdmin && (
          <button style={c.btnPrimario} onClick={() => setCriar(true)}>+ Nova peça</button>
        )}
      </div>

      <div style={c.resumo}>
        <span>{filtradas.length} peça(s)</span>
        <span>{totalUnidades} unidade(s) em stock</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <p style={c.estado}>Sem peças.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Peça</span>
            <span>Grupo</span>
            <span style={{ textAlign: 'right' }}>Stock</span>
          </div>
          {filtradas.map((p) => (
            <div key={p.id} style={{ ...c.linha, ...c.clicavel }} onClick={() => setAberta(p)}>
              <span style={{ fontWeight: 600 }}>
                {p.nome}
                {p.marca && <span style={c.marcaTag}>{p.marca}</span>}
                {pendentes.has(p.id) && <span title="Pedido de compra pendente" style={{ marginLeft: 6 }}>🛒</span>}
              </span>
              <span style={c.grupoCel}>{p.grupo ?? '—'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: p.quantidade <= 0 ? 'var(--danger, #c62828)' : 'inherit' }}>
                {p.quantidade}
                <StockBadge q={p.quantidade} />
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={c.dica}>Toca numa peça para ver detalhes e QR Code{isAdmin ? ' (e editar)' : ''}.</p>

      {(aberta || criar) && (
        <ModalPeca
          peca={aberta}
          isAdmin={isAdmin}
          pendente={aberta ? pendentes.has(aberta.id) : false}
          onFechar={() => { setAberta(null); setCriar(false) }}
          onGuardado={() => { setAberta(null); setCriar(false); carregar() }}
        />
      )}
    </main>
  )
}

function ModalPeca({
  peca, isAdmin, pendente, onFechar, onGuardado,
}: {
  peca: Peca | null
  isAdmin: boolean
  pendente: boolean
  onFechar: () => void
  onGuardado: () => void
}) {
  const [nome, setNome] = useState(peca?.nome ?? '')
  const [marca, setMarca] = useState(peca?.marca ?? '')
  const [grupo, setGrupo] = useState(peca?.grupo ?? '')
  const [referencia, setReferencia] = useState(peca?.referencia ?? '')
  const [quantidade, setQuantidade] = useState(peca?.quantidade != null ? String(peca.quantidade) : '0')
  const [localizacao, setLocalizacao] = useState(peca?.localizacao ?? '')
  const [notas, setNotas] = useState(peca?.notas ?? '')
  const [aGuardar, setAGuardar] = useState(false)
  const [aApagar, setAApagar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const soLeitura = !isAdmin

  async function guardar() {
    setErro(null)
    if (!nome.trim()) { setErro('Indica o nome da peça.'); return }
    if (isNaN(Number(quantidade))) { setErro('Quantidade inválida.'); return }
    setAGuardar(true)
    const payload = {
      nome: nome.trim(),
      marca: marca.trim() || null,
      grupo: grupo.trim() || null,
      referencia: referencia.trim() || null,
      quantidade: Math.trunc(Number(quantidade)),
      notas: notas.trim() || null,
      localizacao: localizacao.trim() || null,
    }
    const { error } = peca ? await atualizarPeca(peca.id, payload) : await criarPeca(payload)
    setAGuardar(false)
    if (error) { setErro('Erro a guardar: ' + error.message); return }
    onGuardado()
  }

  async function apagar() {
    if (!peca) return
    if (!confirm(`Apagar a peça "${peca.nome}"? Esta ação não pode ser anulada.`)) return
    setAApagar(true)
    const { error } = await eliminarPeca(peca.id)
    setAApagar(false)
    if (error) { setErro('Erro a apagar: ' + error.message); return }
    onGuardado()
  }

  const titulo = !peca ? 'Nova peça' : soLeitura ? 'Peça' : 'Editar peça'

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>{titulo}</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>

        {/* QR Code (peças existentes) */}
        {peca && <QrPeca peca={peca} />}

        {pendente && (
          <div style={{ background: '#fdf2e3', border: '1px solid #D4820A', color: '#9a5b00', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 13, fontWeight: 600 }}>
            🛒 Pedido de compra pendente para esta peça
          </div>
        )}

        {erro && <div style={c.erro}>{erro}</div>}

        <label style={c.label}>Nome *</label>
        <input style={c.inputModal} value={nome} onChange={(e) => setNome(e.target.value)} disabled={soLeitura} />

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Marca</label>
            <input style={c.inputModal} value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Candela, AlmaLaser..." disabled={soLeitura} />
          </div>
          <div>
            <label style={c.label}>Grupo</label>
            <input style={c.inputModal} value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="Ex: Peças PRO" disabled={soLeitura} />
          </div>
        </div>

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Referência</label>
            <input style={c.inputModal} value={referencia} onChange={(e) => setReferencia(e.target.value)} disabled={soLeitura} />
          </div>
          <div>
            <label style={c.label}>Quantidade em stock</label>
            <input style={c.inputModal} type="number" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} disabled={soLeitura} />
          </div>
        </div>

        <label style={c.label}>Localização</label>
        <select style={c.inputModal} value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} disabled={soLeitura}>
          <option value="">—</option>
          {LOCALIZACOES_PECA.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <label style={c.label}>Notas</label>
        <textarea style={c.textarea} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={soLeitura} />

        <div style={c.modalAcoes}>
          {peca && isAdmin && (
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
  linha: { display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center' },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  marcaTag: { marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'var(--accent-bg, #eef1f6)', borderRadius: 999, padding: '1px 6px' },
  grupoCel: { color: 'var(--muted)', fontSize: 13 },
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
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { background: '#fff', color: 'var(--danger, #c62828)', border: '1px solid var(--danger, #c62828)', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
}
