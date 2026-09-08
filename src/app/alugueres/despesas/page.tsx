'use client'

// Área do colaborador: registar despesas de alugueres (foto + IA), ver as suas
// despesas do mês e o seu extrato de fundos (dinheiro recebido / despesas /
// entregue). Todo o staff acede; a RLS garante que só vê o que é seu.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import RegistarDespesa from '@/components/despesas/RegistarDespesa'
import {
  listarTipos, listarMinhasDespesas, apagarDespesa, atualizarDespesa,
  listarMeusFundosDoColaborador, criarFundo, apagarFundo, calcularExtrato,
  listarAlugueresAtivos, listarAlugueresRecolhidosRecentes, urlFotoDespesa, listarFotosDespesa, mesCorrente, mesFechado,
} from '@/lib/despesas'
import type { Despesa, DespesaTipo, Fundo, AluguerAtivoOpc, TipoFundo } from '@/types/despesa'

const eur = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
const dataPt = (d: string) => { const [a, m, dia] = d.split('-'); return dia ? `${dia}/${m}/${a}` : d }

export default function MinhasDespesasPage() {
  const { perfil, isFinanceiro } = useAuth()
  const uid = perfil?.id ?? null
  const autor = useMemo(() => ({ id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null }), [perfil])

  const [mes, setMes] = useState(mesCorrente())
  const [fechado, setFechado] = useState(false)
  const [tipos, setTipos] = useState<DespesaTipo[]>([])
  const [alugueres, setAlugueres] = useState<AluguerAtivoOpc[]>([])
  const [alugueresRecolhidos, setAlugueresRecolhidos] = useState<AluguerAtivoOpc[]>([])
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [fundos, setFundos] = useState<Fundo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [registar, setRegistar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editar, setEditar] = useState<Despesa | null>(null)

  const nomeTipo = (id: string | null) => tipos.find((t) => t.id === id)?.nome ?? '—'

  const carregar = useCallback(async () => {
    if (!uid) return
    setCarregando(true)
    const [ds, fs, fch] = await Promise.all([
      listarMinhasDespesas(uid, mes), listarMeusFundosDoColaborador(uid, mes), mesFechado(mes),
    ])
    setDespesas(ds); setFundos(fs); setFechado(fch); setCarregando(false)
  }, [mes, uid])

  useEffect(() => {
    listarTipos().then(setTipos)
    listarAlugueresAtivos().then(setAlugueres)
    listarAlugueresRecolhidosRecentes().then(setAlugueresRecolhidos)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const extrato = useMemo(() => calcularExtrato(despesas, fundos), [despesas, fundos])

  async function aoConcluir(m: string) {
    setRegistar(false); setMsg(m)
    setMes(mesCorrente())    // uma despesa nova cai no mês corrente (ou no do documento)
    await carregar()
    setTimeout(() => setMsg(null), 4000)
  }

  async function eliminar(d: Despesa) {
    if (!confirm(`Apagar a despesa de ${eur(Number(d.valor))} (${dataPt(d.data_despesa)})?`)) return
    const { error } = await apagarDespesa(d.id)
    if (error) { setMsg('Erro ao apagar: ' + error.message); return }
    await carregar()
  }

  const ehMesCorrente = mes === mesCorrente()

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>Despesas de Alugueres</h1>
          <Link href="/alugueres" style={c.voltar}>← Alugueres</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isFinanceiro && <Link href="/alugueres/despesas/gestao" style={c.btnGestao}>📊 Gestão</Link>}
          <button style={c.btnRegistar} onClick={() => setRegistar(true)}>➕ Registar Despesa</button>
        </div>
      </div>

      {msg && <div style={c.ok}>{msg}</div>}

      {/* Extrato do mês */}
      <section style={c.secao}>
        <div style={c.secaoTopo}>
          <h2 style={c.h2}>O meu mês</h2>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesCorrente())} style={c.mesInput} />
        </div>
        {fechado && <div style={c.avisoFechado}>🔒 Mês fechado — apenas consulta.</div>}
        <div style={c.cards}>
          <Cartao rot="Recebido" valor={extrato.recebido} cor="#065F46" />
          <Cartao rot="Despesas" valor={extrato.despesas} cor="#B91C1C" />
          <Cartao rot="Entregue" valor={extrato.entregue} cor="#1E40AF" />
          <Cartao rot="A acertar" valor={extrato.apuramento} cor={Math.abs(extrato.apuramento) < 0.005 ? '#065F46' : '#92400E'} destaque />
        </div>
      </section>

      {/* Fundos em mãos */}
      <FundosBloco
        fundos={fundos} alugueres={alugueresRecolhidos} autor={autor}
        bloqueado={fechado || !ehMesCorrente}
        onMudou={carregar} onErro={setMsg}
      />

      {/* As minhas despesas */}
      <section style={c.secao}>
        <h2 style={c.h2}>As minhas despesas ({despesas.length})</h2>
        {carregando ? <p style={c.muted}>A carregar…</p> : despesas.length === 0 ? (
          <p style={c.muted}>Sem despesas neste mês. Usa “➕ Registar Despesa”.</p>
        ) : (
          <div style={c.lista}>
            {despesas.map((d) => (
              <DespesaCard key={d.id} d={d} nomeTipo={nomeTipo}
                podeEditar={d.estado === 'registada' && !fechado}
                onEditar={() => setEditar(d)} onApagar={() => eliminar(d)} />
            ))}
          </div>
        )}
      </section>

      {registar && perfil?.id && (
        <RegistarDespesa
          perfil={{ id: perfil.id, nome: autor.nome }}
          tipos={tipos} alugueres={alugueresRecolhidos}
          onConcluido={aoConcluir}
          onTipoCriado={(t) => setTipos((prev) => [...prev, t])}
          onFechar={() => setRegistar(false)}
        />
      )}

      {editar && (
        <EditarDespesa
          despesa={editar} tipos={tipos} alugueres={alugueres}
          onFechar={() => setEditar(null)}
          onGuardado={async () => { setEditar(null); await carregar() }}
        />
      )}
    </main>
  )
}

function Cartao({ rot, valor, cor, destaque }: { rot: string; valor: number; cor: string; destaque?: boolean }) {
  return (
    <div style={{ ...c.cartao, ...(destaque ? c.cartaoDestaque : {}) }}>
      <div style={{ ...c.cartaoValor, color: cor }}>{eur(valor)}</div>
      <div style={c.cartaoRot}>{rot}</div>
    </div>
  )
}

// ─── Cartão de despesa (com miniatura da 1ª foto) ────────────────────────────
function DespesaCard({ d, nomeTipo, podeEditar, onEditar, onApagar }: {
  d: Despesa; nomeTipo: (id: string | null) => string; podeEditar: boolean; onEditar: () => void; onApagar: () => void
}) {
  const [thumb, setThumb] = useState<string | null>(null)
  useEffect(() => {
    let ativo = true
    listarFotosDespesa(d.id).then(async (fs) => {
      if (fs[0]) { const u = await urlFotoDespesa(fs[0].caminho); if (ativo) setThumb(u) }
    })
    return () => { ativo = false }
  }, [d.id])

  return (
    <div style={c.card}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL temporária
        <a href={thumb} target="_blank" rel="noopener noreferrer"><img src={thumb} alt="talão" style={c.thumb} /></a>
      ) : <div style={c.thumbVazio}>📄</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={c.cardLinha1}>
          <span style={c.cardValor}>{eur(Number(d.valor))}</span>
          <span style={c.cardTipo}>{nomeTipo(d.tipo_id)}</span>
          <span style={{ ...c.estado, ...(d.estado === 'conferida' ? c.estadoConf : c.estadoReg) }}>
            {d.estado === 'conferida' ? 'Conferida' : 'Registada'}
          </span>
        </div>
        <div style={c.cardMeta}>
          {dataPt(d.data_despesa)}{d.fornecedor ? ` · ${d.fornecedor}` : ''}
          {d.aluguer_ref ? ` · ${d.aluguer_ref}` : ''}
        </div>
        {d.nota && <div style={c.cardNota}>{d.nota}</div>}
        {d.registado_apos_fecho && <div style={c.cardAviso}>Registada após o fecho do mês do documento</div>}
      </div>
      {podeEditar && (
        <div style={c.cardAcoes}>
          <button style={c.btnMini} onClick={onEditar}>✏️</button>
          <button style={c.btnMini} onClick={onApagar}>🗑️</button>
        </div>
      )}
    </div>
  )
}

// ─── Bloco dos fundos em mãos ────────────────────────────────────────────────
function FundosBloco({ fundos, alugueres, autor, bloqueado, onMudou, onErro }: {
  fundos: Fundo[]; alugueres: AluguerAtivoOpc[]; autor: { id: string | null; nome: string | null }
  bloqueado: boolean; onMudou: () => void | Promise<void>; onErro: (m: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoFundo>('entrada')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(new Date().toLocaleDateString('sv-SE'))
  const [aluguerRef, setAluguerRef] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [aGravar, setAGravar] = useState(false)

  async function guardar() {
    const v = Number(valor.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) { onErro('Indica um valor válido.'); return }
    if (!data) { onErro('Indica a data.'); return }
    setAGravar(true)
    const a = alugueres.find((x) => x.label === aluguerRef)
    const { error } = await criarFundo(
      { tipo, valor: v, data, cliente_id: a?.cliente_id ?? null, aluguer_ref: aluguerRef, nota: nota.trim() || null },
      autor,
    )
    setAGravar(false)
    if (error) { onErro('Erro ao guardar: ' + error.message); return }
    setValor(''); setNota(''); setAluguerRef(null); setAberto(false)
    await onMudou()
  }

  async function eliminar(f: Fundo) {
    if (!confirm(`Apagar este movimento de ${eur(Number(f.valor))}?`)) return
    const { error } = await apagarFundo(f.id)
    if (error) { onErro('Erro ao apagar: ' + error.message); return }
    await onMudou()
  }

  return (
    <section style={c.secao}>
      <div style={c.secaoTopo}>
        <h2 style={c.h2}>Fundos em mãos ({fundos.length})</h2>
        {!bloqueado && <button style={c.btnSec} onClick={() => setAberto((v) => !v)}>{aberto ? 'Cancelar' : '+ Movimento'}</button>}
      </div>

      {aberto && (
        <div style={c.form}>
          <div style={c.segmento}>
            <button style={{ ...c.segBtn, ...(tipo === 'entrada' ? c.segOn : {}) }} onClick={() => setTipo('entrada')}>Recebi do cliente</button>
            <button style={{ ...c.segBtn, ...(tipo === 'entrega' ? c.segOn : {}) }} onClick={() => setTipo('entrega')}>Entreguei em caixa</button>
          </div>
          <div style={c.grid2}>
            <label style={c.campo}><span style={c.rot}>Valor (€)</span>
              <input style={c.input} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
            <label style={c.campo}><span style={c.rot}>Data</span>
              <input style={c.input} type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
          </div>
          {tipo === 'entrada' && (
            <label style={c.campo}><span style={c.rot}>Aluguer / cliente (opcional)</span>
              <select style={c.input} value={aluguerRef ?? ''} onChange={(e) => setAluguerRef(e.target.value || null)}>
                <option value="">— nenhum —</option>
                {alugueres.map((a) => <option key={a.label} value={a.label}>{a.label}</option>)}
              </select>
            </label>
          )}
          <label style={c.campo}><span style={c.rot}>Nota (opcional)</span>
            <input style={c.input} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
          <button style={c.btnPri} onClick={guardar} disabled={aGravar}>{aGravar ? 'A guardar…' : 'Adicionar movimento'}</button>
        </div>
      )}

      {fundos.length > 0 && (
        <div style={c.lista}>
          {fundos.map((f) => (
            <div key={f.id} style={c.fundoLinha}>
              <span style={{ ...c.fundoTag, ...(f.tipo === 'entrada' ? c.tagEntrada : c.tagEntrega) }}>
                {f.tipo === 'entrada' ? 'Recebido' : 'Entregue'}
              </span>
              <span style={c.fundoValor}>{eur(Number(f.valor))}</span>
              <span style={c.fundoMeta}>{dataPt(f.data)}{f.aluguer_ref ? ` · ${f.aluguer_ref}` : ''}{f.nota ? ` · ${f.nota}` : ''}</span>
              {!bloqueado && <button style={c.btnMini} onClick={() => eliminar(f)}>🗑️</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Editar despesa (campos; fotos não se alteram aqui) ──────────────────────
function EditarDespesa({ despesa, tipos, alugueres, onFechar, onGuardado }: {
  despesa: Despesa; tipos: DespesaTipo[]; alugueres: AluguerAtivoOpc[]
  onFechar: () => void; onGuardado: () => void | Promise<void>
}) {
  const [tipoId, setTipoId] = useState(despesa.tipo_id ?? '')
  const [valor, setValor] = useState(String(despesa.valor))
  const [data, setData] = useState(despesa.data_despesa)
  const [fornecedor, setFornecedor] = useState(despesa.fornecedor ?? '')
  const [iva, setIva] = useState(despesa.iva != null ? String(despesa.iva) : '')
  const [numDoc, setNumDoc] = useState(despesa.num_documento ?? '')
  const [aluguerRef, setAluguerRef] = useState<string | null>(despesa.aluguer_ref)
  const [nota, setNota] = useState(despesa.nota ?? '')
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar() {
    const v = Number(valor.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) { setErro('Valor inválido.'); return }
    if (!tipoId) { setErro('Escolhe o tipo.'); return }
    setAGravar(true)
    const a = alugueres.find((x) => x.label === aluguerRef)
    const { error } = await atualizarDespesa(despesa.id, {
      tipo_id: tipoId, valor: v, data_despesa: data, fornecedor: fornecedor.trim() || null,
      iva: iva.trim() ? Number(iva.replace(',', '.')) : null, num_documento: numDoc.trim() || null,
      aluguer_ref: aluguerRef, cliente_id: a?.cliente_id ?? despesa.cliente_id, nota: nota.trim() || null,
    })
    setAGravar(false)
    if (error) { setErro('Erro ao guardar: ' + error.message); return }
    await onGuardado()
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.topo}><strong>Editar despesa</strong>
          <button style={c.fechar} onClick={onFechar} aria-label="Fechar">×</button></div>
        {erro && <div style={c.erroBar}>{erro}</div>}
        <label style={c.campo}><span style={c.rot}>Tipo</span>
          <select style={c.input} value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">— escolher —</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.estado === 'pendente' ? ' (por aprovar)' : ''}</option>)}
          </select></label>
        <div style={c.grid2}>
          <label style={c.campo}><span style={c.rot}>Valor (€)</span>
            <input style={c.input} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
          <label style={c.campo}><span style={c.rot}>Data</span>
            <input style={c.input} type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        </div>
        <label style={c.campo}><span style={c.rot}>Fornecedor</span>
          <input style={c.input} value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} /></label>
        <div style={c.grid2}>
          <label style={c.campo}><span style={c.rot}>IVA (€)</span>
            <input style={c.input} inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} /></label>
          <label style={c.campo}><span style={c.rot}>Nº documento</span>
            <input style={c.input} value={numDoc} onChange={(e) => setNumDoc(e.target.value)} /></label>
        </div>
        <label style={c.campo}><span style={c.rot}>Aluguer / cliente</span>
          <select style={c.input} value={aluguerRef ?? ''} onChange={(e) => setAluguerRef(e.target.value || null)}>
            <option value="">— nenhum —</option>
            {alugueres.map((a) => <option key={a.label} value={a.label}>{a.label}</option>)}
          </select></label>
        <label style={c.campo}><span style={c.rot}>Nota</span>
          <input style={c.input} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
        <div style={c.acoes}>
          <button style={c.btnSec} onClick={onFechar} disabled={aGravar}>Cancelar</button>
          <button style={c.btnPri} onClick={guardar} disabled={aGravar}>{aGravar ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '0 0 4px' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  btnRegistar: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnGestao: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 10, padding: '12px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 15, textDecoration: 'none' },
  ok: { background: '#e6f7f1', color: '#00875f', border: '1px solid #00A87A', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 14 },
  secao: { marginBottom: 22 },
  secaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  h2: { fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--foreground)' },
  mesInput: { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit' },
  avisoFechado: { background: '#F3F4F6', color: '#374151', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 10 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
  cartaoDestaque: { borderColor: 'var(--primary)', borderWidth: 2 },
  cartaoValor: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  cartaoRot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 4 },
  muted: { color: 'var(--muted)', fontSize: 14 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 12 },
  thumb: { width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 },
  thumbVazio: { width: 52, height: 52, borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, background: '#fafafa' },
  cardLinha1: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardValor: { fontSize: 16, fontWeight: 800 },
  cardTipo: { fontSize: 13, color: 'var(--foreground)', background: '#EEF2FF', borderRadius: 999, padding: '2px 10px', fontWeight: 600 },
  estado: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 9px' },
  estadoReg: { color: '#92400E', background: '#FEF3C7' },
  estadoConf: { color: '#065F46', background: '#D1FAE5' },
  cardMeta: { fontSize: 13, color: 'var(--muted)', marginTop: 3 },
  cardNota: { fontSize: 13, color: 'var(--foreground)', marginTop: 3 },
  cardAviso: { fontSize: 11.5, color: '#92400E', marginTop: 3 },
  cardAcoes: { display: 'flex', flexDirection: 'column', gap: 6 },
  fundoLinha: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', flexWrap: 'wrap' },
  fundoTag: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 9px' },
  tagEntrada: { color: '#065F46', background: '#D1FAE5' },
  tagEntrega: { color: '#1E40AF', background: '#DBEAFE' },
  fundoValor: { fontSize: 15, fontWeight: 800 },
  fundoMeta: { fontSize: 12.5, color: 'var(--muted)', flex: 1, minWidth: 0 },
  form: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 },
  segmento: { display: 'flex', gap: 6 },
  segBtn: { flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 },
  segOn: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: 10, font: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  btnMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 13 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, overflowY: 'auto', zIndex: 80 },
  modal: { background: '#fff', borderRadius: 14, padding: 16, width: 'min(520px, 100%)', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  fechar: { background: 'transparent', border: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  erroBar: { background: '#FEF2F2', color: '#B91C1C', padding: '8px 12px', borderRadius: 8, fontSize: 13 },
}
