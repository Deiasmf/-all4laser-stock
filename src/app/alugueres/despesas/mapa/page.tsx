'use client'

// Mapa mensal de despesas (admin/financeiro): apuramento por colaborador
// (recebido − despesas − entregue), com fecho do mês (conferência em massa,
// congelamento imutável) e exportação para Excel. Mês fechado mostra o snapshot.
import { useCallback, useEffect, useMemo, useState } from 'react'
import GuardaFinanceiro from '@/components/despesas/GuardaFinanceiro'
import NavGestao from '@/components/despesas/NavGestao'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import { useAuth } from '@/lib/auth'
import {
  listarDespesasMes, listarFundosMes, listarColaboradores, listarTodosTipos,
  apurarMes, fecharMes, obterMesFechado, resolverNomeTipo, mesCorrente,
  type Colaborador, type MesFechado,
} from '@/lib/despesas'
import type { Despesa, Fundo, DespesaTipo, ApuramentoColaborador } from '@/types/despesa'

const eur = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
const zero = (v: number) => Math.abs(v) < 0.005
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function MapaPage() {
  return <GuardaFinanceiro><Conteudo /></GuardaFinanceiro>
}

function Conteudo() {
  const { perfil } = useAuth()
  const autor = useMemo(() => ({ id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null }), [perfil])

  const [mes, setMes] = useState(mesCorrente())
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [fundos, setFundos] = useState<Fundo[]>([])
  const [tipos, setTipos] = useState<DespesaTipo[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [fechado, setFechado] = useState<MesFechado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modalFechar, setModalFechar] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [ds, fs, fch] = await Promise.all([listarDespesasMes(mes), listarFundosMes(mes), obterMesFechado(mes)])
    setDespesas(ds); setFundos(fs); setFechado(fch); setCarregando(false)
  }, [mes])

  useEffect(() => { listarTodosTipos().then(setTipos); listarColaboradores().then(setColaboradores) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  // Apuramento ao vivo (mês aberto) ou a partir do snapshot congelado (fechado).
  const apuramentoVivo = useMemo(
    () => apurarMes(despesas, fundos, colaboradores, tipos),
    [despesas, fundos, colaboradores, tipos],
  )
  const snapshot = (fechado?.snapshot as { apuramento?: ApuramentoColaborador[] } | null)
  const apuramento = fechado && snapshot?.apuramento ? snapshot.apuramento : apuramentoVivo

  const colunasTipo = useMemo(() => {
    const set = new Set<string>()
    apuramento.forEach((a) => Object.keys(a.porTipo).forEach((t) => set.add(t)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'))
  }, [apuramento])

  const totalGeral = useMemo(() => ({
    recebido: apuramento.reduce((s, a) => s + a.recebido, 0),
    despesas: apuramento.reduce((s, a) => s + a.despesas, 0),
    entregue: apuramento.reduce((s, a) => s + a.entregue, 0),
    apuramento: apuramento.reduce((s, a) => s + a.apuramento, 0),
  }), [apuramento])

  const comDiferenca = apuramento.filter((a) => !zero(a.apuramento))

  // Colunas do Excel (colaborador + por tipo + totais).
  const colunasExport: ColunaExport<ApuramentoColaborador>[] = [
    { cabecalho: 'Colaborador', valor: (a) => a.colaborador_nome },
    { cabecalho: 'Recebido', valor: (a) => a.recebido.toFixed(2) },
    ...colunasTipo.map((t) => ({ cabecalho: t, valor: (a: ApuramentoColaborador) => (a.porTipo[t] ?? 0).toFixed(2) })),
    { cabecalho: 'Total despesas', valor: (a) => a.despesas.toFixed(2) },
    { cabecalho: 'Entregue', valor: (a) => a.entregue.toFixed(2) },
    { cabecalho: 'A acertar', valor: (a) => a.apuramento.toFixed(2) },
  ]

  return (
    <main style={c.page}>
      <NavGestao />
      <div style={c.topo}>
        <h1 style={c.titulo}>Mapa de Despesas</h1>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesCorrente())} style={c.input} />
      </div>

      {fechado
        ? <div style={c.fechadoBar}>🔒 Mês fechado por {fechado.fechado_por_nome ?? '—'} em {dataHora(fechado.fechado_em)}.</div>
        : comDiferenca.length > 0 && (
          <div style={c.avisoDif}>
            ⚠ {comDiferenca.length} colaborador(es) com contas por acertar (a acertar ≠ 0). Resolve antes de fechar o mês.
          </div>
        )}

      {carregando ? <p style={c.muted}>A carregar…</p> : apuramento.length === 0 ? (
        <p style={c.muted}>Sem movimentos neste mês.</p>
      ) : (
        <>
          <div style={c.acoesTopo}>
            <BotaoExportar nome={`mapa-despesas-${mes}`} colunas={colunasExport} linhas={apuramento} />
            {!fechado && <button style={c.btnFechar} onClick={() => setModalFechar(true)}>🔒 Fechar mês</button>}
          </div>

          <div style={c.tabelaWrap}>
            <table style={c.tabela}>
              <thead>
                <tr>
                  <th style={c.th}>Colaborador</th>
                  <th style={c.thNum}>Recebido</th>
                  {colunasTipo.map((t) => <th key={t} style={c.thNum}>{t}</th>)}
                  <th style={c.thNum}>Despesas</th>
                  <th style={c.thNum}>Entregue</th>
                  <th style={c.thNum}>A acertar</th>
                </tr>
              </thead>
              <tbody>
                {apuramento.map((a) => (
                  <tr key={a.colaborador_id}>
                    <td style={c.td}>{a.colaborador_nome}</td>
                    <td style={c.tdNum}>{eur(a.recebido)}</td>
                    {colunasTipo.map((t) => <td key={t} style={c.tdNum}>{a.porTipo[t] ? eur(a.porTipo[t]) : '—'}</td>)}
                    <td style={c.tdNum}>{eur(a.despesas)}</td>
                    <td style={c.tdNum}>{eur(a.entregue)}</td>
                    <td style={{ ...c.tdNum, ...(zero(a.apuramento) ? c.ok : c.dif) }}>{eur(a.apuramento)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={c.tfoot}>Total</td>
                  <td style={c.tfootNum}>{eur(totalGeral.recebido)}</td>
                  {colunasTipo.map((t) => <td key={t} style={c.tfootNum}>—</td>)}
                  <td style={c.tfootNum}>{eur(totalGeral.despesas)}</td>
                  <td style={c.tfootNum}>{eur(totalGeral.entregue)}</td>
                  <td style={c.tfootNum}>{eur(totalGeral.apuramento)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {modalFechar && (
        <ModalFechar mes={mes} despesas={despesas} apuramento={apuramentoVivo} comDiferenca={comDiferenca}
          nomeTipo={(id) => resolverNomeTipo(id, tipos)} autor={autor}
          onFechado={async () => { setModalFechar(false); await carregar() }}
          onCancelar={() => setModalFechar(false)} />
      )}
    </main>
  )
}

// Modal de fecho: escolhe as despesas a conferir (todas por defeito) e congela.
function ModalFechar({ mes, despesas, apuramento, comDiferenca, nomeTipo, autor, onFechado, onCancelar }: {
  mes: string; despesas: Despesa[]; apuramento: ApuramentoColaborador[]
  comDiferenca: ApuramentoColaborador[]; nomeTipo: (id: string | null) => string
  autor: { id: string | null; nome: string | null }
  onFechado: () => void | Promise<void>; onCancelar: () => void
}) {
  const registadas = despesas.filter((d) => d.estado === 'registada')
  const [conferir, setConferir] = useState<Set<string>>(new Set(registadas.map((d) => d.id)))
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function alternar(id: string) {
    setConferir((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function fechar() {
    if (comDiferenca.length > 0 &&
      !confirm(`${comDiferenca.length} colaborador(es) com contas por acertar. Fechar o mês à mesma? Isto NÃO pode ser desfeito.`)) return
    if (!confirm(`Fechar ${mes}? O mapa fica imutável e não reabre.`)) return
    setAGravar(true)
    const snapshot = { apuramento, fechadoEm: mes }
    const { error } = await fecharMes(mes, Array.from(conferir), snapshot, autor)
    setAGravar(false)
    if (error) { setErro('Erro ao fechar: ' + error.message); return }
    await onFechado()
  }

  return (
    <div style={c.overlay} onClick={onCancelar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalTopo}><strong>Fechar {mes}</strong>
          <button style={c.fechar} onClick={onCancelar} aria-label="Fechar">×</button></div>
        <p style={c.muted}>As despesas selecionadas ficam <strong>conferidas</strong>. Desmarca as exceções antes de fechar.</p>
        {comDiferenca.length > 0 && <div style={c.avisoDif}>⚠ Há contas por acertar (a acertar ≠ 0).</div>}
        {erro && <div style={c.erroBar}>{erro}</div>}
        {registadas.length === 0 ? <p style={c.muted}>Não há despesas por conferir.</p> : (
          <div style={c.checklist}>
            {registadas.map((d) => (
              <label key={d.id} style={c.checkLinha}>
                <input type="checkbox" checked={conferir.has(d.id)} onChange={() => alternar(d.id)} />
                <span style={c.checkValor}>{eur(Number(d.valor))}</span>
                <span style={c.checkMeta}>{nomeTipo(d.tipo_id)}{d.fornecedor ? ` · ${d.fornecedor}` : ''}</span>
              </label>
            ))}
          </div>
        )}
        <div style={c.acoes}>
          <button style={c.btnSec} onClick={onCancelar} disabled={aGravar}>Cancelar</button>
          <button style={c.btnFechar} onClick={fechar} disabled={aGravar}>{aGravar ? 'A fechar…' : 'Fechar mês'}</button>
        </div>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  input: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  fechadoBar: { background: '#F3F4F6', color: '#374151', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, marginBottom: 12 },
  avisoDif: { background: '#FEF3C7', color: '#92400E', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, marginBottom: 12 },
  muted: { color: 'var(--muted)', fontSize: 14, padding: 20, textAlign: 'center' },
  acoesTopo: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap' },
  btnFechar: { background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  tabelaWrap: { overflowX: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', padding: '10px 12px', color: 'var(--muted)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right', padding: '10px 12px', color: 'var(--muted)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' },
  tdNum: { padding: '10px 12px', borderTop: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  ok: { color: '#065F46', fontWeight: 700 },
  dif: { color: '#B91C1C', fontWeight: 800 },
  tfoot: { padding: '10px 12px', borderTop: '2px solid var(--border)', fontWeight: 800 },
  tfootNum: { padding: '10px 12px', borderTop: '2px solid var(--border)', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, overflowY: 'auto', zIndex: 80 },
  modal: { background: '#fff', borderRadius: 14, padding: 16, width: 'min(520px, 100%)', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fechar: { background: 'transparent', border: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  checklist: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '4px 2px' },
  checkValor: { fontWeight: 700, width: 80 },
  checkMeta: { color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  erroBar: { background: '#FEF2F2', color: '#B91C1C', padding: '8px 12px', borderRadius: 8, fontSize: 13 },
}
