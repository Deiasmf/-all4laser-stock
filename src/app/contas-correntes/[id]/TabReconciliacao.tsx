'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  listarConsignacoes, movimentosDaConta, marcarDevolucao,
  formatarData,
  type ContaComSaldo,
} from '@/lib/cc'
import {
  lerFicheiro, sugerirMapeamento, normalizarLinhas, compararComExcel,
  obterMapeamentoConta, guardarMapeamento, listarReconciliacoes,
  criarReconciliacao, atualizarDivergencias, aceitarCustoDeles,
  CAMPOS_EXCEL, TIPOS_DIVERGENCIA, tipoDivergenciaInfo,
  type MapeamentoExcel, type Divergencia, type Reconciliacao, type FicheiroLido,
} from '@/lib/ccReconciliacao'

// As divergências misturam moedas (custo em EUR, preço em AED), por isso mostram
// o valor como número simples, sem símbolo de moeda.
function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TabReconciliacao({ conta, onMudou }: {
  conta: ContaComSaldo; onMudou: () => void
}) {
  const { perfil } = useAuth()
  const [mapa, setMapa] = useState<MapeamentoExcel>({})
  const [historico, setHistorico] = useState<Reconciliacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const [ficheiro, setFicheiro] = useState<(FicheiroLido & { nome: string }) | null>(null)
  const [preview, setPreview] = useState<Divergencia[] | null>(null)
  const [aProcessar, setAProcessar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    const [m, h] = await Promise.all([obterMapeamentoConta(conta.id), listarReconciliacoes(conta.id)])
    setMapa(m); setHistorico(h); setCarregando(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [conta.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function aoEscolherFicheiro(file: File | null) {
    setErro(null); setMsg(null); setPreview(null)
    if (!file) { setFicheiro(null); return }
    try {
      const lido = await lerFicheiro(file)
      setFicheiro({ ...lido, nome: file.name })
      setMapa((m) => sugerirMapeamento(lido.headers, m))
    } catch (e) {
      setErro('Não foi possível ler o ficheiro: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function comparar() {
    if (!ficheiro) return
    setErro(null); setMsg(null); setAProcessar(true)
    try {
      const linhas = normalizarLinhas(ficheiro.linhas, mapa)
      const [consigs, movs] = await Promise.all([listarConsignacoes(conta.id), movimentosDaConta(conta.id)])
      setPreview(compararComExcel(linhas, consigs, movs))
      setMsg(`${linhas.length} linha(s) lida(s) do ficheiro.`)
    } catch (e) {
      setErro('Falha ao comparar: ' + (e instanceof Error ? e.message : String(e)))
    }
    setAProcessar(false)
  }

  async function guardarMapa() {
    setErro(null)
    const { error } = await guardarMapeamento(conta.id, mapa)
    setMsg(error ? null : 'Mapeamento guardado.')
    if (error) setErro(error.message)
  }

  async function guardarReconciliacao() {
    if (!ficheiro || !preview) return
    setAProcessar(true); setErro(null)
    const linhas = normalizarLinhas(ficheiro.linhas, mapa)
    const { error } = await criarReconciliacao(
      conta.id,
      { ficheiro_nome: ficheiro.nome, linhas_total: linhas.length, divergencias: preview },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    )
    setAProcessar(false)
    if (error) { setErro(error.message); return }
    setFicheiro(null); setPreview(null)
    setMsg('Reconciliação guardada.')
    carregar()
  }

  const ultima = historico[0] ?? null

  return (
    <div>
      {carregando ? <p style={c.estado}>A carregar...</p> : (
        <>
          {ultima && (
            <div style={c.cabecalho}>
              Última importação: <strong>{formatarData(ultima.data_import)}</strong> ·{' '}
              {ultima.estado === 'resolvida'
                ? <span style={{ color: '#065F46' }}>fechada (0 divergências por resolver)</span>
                : <span style={{ color: '#B45309' }}>{ultima.divergencias.filter((d) => d.estado === 'aberta').length} divergência(s) por resolver</span>}
            </div>
          )}

          {/* Importar */}
          <div style={c.card}>
            <div style={c.cardTitulo}>Importar Excel da Laserix</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => aoEscolherFicheiro(e.target.files?.[0] ?? null)} style={{ fontSize: 14 }} />
            {msg && <div style={c.msg}>{msg}</div>}
            {erro && <div style={c.erro}>{erro}</div>}

            {ficheiro && (
              <>
                <div style={c.mapaTitulo}>Mapeamento de colunas <span style={c.opc}>(qual coluna do ficheiro corresponde a cada campo)</span></div>
                <div style={c.mapaGrelha}>
                  {CAMPOS_EXCEL.map((campo) => (
                    <label key={campo.chave} style={c.campo}>
                      <span style={c.rotulo}>{campo.label}</span>
                      <select
                        value={mapa[campo.chave] ?? ''}
                        onChange={(e) => setMapa((m) => ({ ...m, [campo.chave]: e.target.value || undefined }))}
                        style={c.input}
                      >
                        <option value="">—</option>
                        {ficheiro.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <div style={c.acoes}>
                  <button style={c.btnPrimario} disabled={aProcessar} onClick={comparar}>
                    {aProcessar ? 'A comparar...' : 'Comparar e gerar divergências'}
                  </button>
                  <button style={c.btnSecundario} onClick={guardarMapa}>Guardar mapeamento</button>
                </div>
              </>
            )}
          </div>

          {/* Pré-visualização das divergências antes de guardar */}
          {preview && (
            <div style={c.card}>
              <div style={c.cardTitulo}>Divergências encontradas: {preview.length}</div>
              {preview.length === 0 ? (
                <p style={{ color: '#065F46', fontWeight: 600 }}>✓ Sem divergências — os registos batem certo com o ficheiro.</p>
              ) : (
                <>
                  <div style={c.resumoTipos}>
                    {TIPOS_DIVERGENCIA.map((t) => {
                      const n = preview.filter((d) => d.tipo === t.valor).length
                      if (!n) return null
                      return <span key={t.valor} style={{ ...c.tipoChip, color: t.cor, background: t.bg }}>{t.label}: {n}</span>
                    })}
                  </div>
                  <ListaDivergencias divs={preview} soLeitura />
                </>
              )}
              <div style={c.acoes}>
                <button style={c.btnPrimario} disabled={aProcessar} onClick={guardarReconciliacao}>
                  {aProcessar ? 'A guardar...' : 'Guardar reconciliação'}
                </button>
                <button style={c.btnSecundario} onClick={() => setPreview(null)}>Descartar</button>
              </div>
            </div>
          )}

          {/* Revisão da última reconciliação guardada */}
          {ultima && !preview && (
            <RevisaoReconciliacao key={ultima.id} recon={ultima} onMudou={() => { carregar(); onMudou() }} />
          )}

          {/* Histórico */}
          {historico.length > 1 && (
            <div style={c.card}>
              <div style={c.cardTitulo}>Importações anteriores</div>
              {historico.slice(1).map((r) => (
                <div key={r.id} style={c.histLinha}>
                  <span>{formatarData(r.data_import)} · {r.ficheiro_nome ?? '—'} · {r.linhas_total ?? 0} linhas</span>
                  <span style={{ color: r.estado === 'resolvida' ? '#065F46' : '#B45309' }}>
                    {r.estado === 'resolvida' ? 'fechada' : `${r.divergencias.filter((d) => d.estado === 'aberta').length} por resolver`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Revisão editável da reconciliação ───────────────────────────────────────

function RevisaoReconciliacao({ recon, onMudou }: { recon: Reconciliacao; onMudou: () => void }) {
  // O estado inicia com as divergências guardadas; a lista é remontada (key) ao
  // mudar de reconciliação, por isso não é preciso sincronizar por efeito.
  const [divs, setDivs] = useState<Divergencia[]>(recon.divergencias)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function atualizar(i: number, patch: Partial<Divergencia>) {
    setDivs((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  async function guardar(novos?: Divergencia[]) {
    setAGuardar(true); setErro(null)
    const { error } = await atualizarDivergencias(recon.id, novos ?? divs)
    setAGuardar(false)
    if (error) { setErro(error.message); return }
    onMudou()
  }

  async function acaoAceitarCusto(i: number) {
    const d = divs[i]
    if (!d.consignacao_id || d.valor_deles == null) return
    setAGuardar(true); setErro(null)
    const { error } = await aceitarCustoDeles(d.consignacao_id, d.valor_deles)
    if (error) { setErro(error.message); setAGuardar(false); return }
    const novos = divs.map((x, idx) => (idx === i ? { ...x, estado: 'resolvida' as const, nota: (x.nota ?? '') + ' [custo aceite]' } : x))
    setDivs(novos)
    await guardar(novos)
  }

  async function acaoDevolvida(i: number) {
    const d = divs[i]
    if (!d.consignacao_id) return
    setAGuardar(true); setErro(null)
    const { error } = await marcarDevolucao(d.consignacao_id)
    if (error) { setErro(error.message); setAGuardar(false); return }
    const novos = divs.map((x, idx) => (idx === i ? { ...x, estado: 'resolvida' as const, nota: (x.nota ?? '') + ' [marcada devolvida]' } : x))
    setDivs(novos)
    await guardar(novos)
  }

  const abertas = divs.filter((d) => d.estado === 'aberta').length

  return (
    <div style={c.card}>
      <div style={c.cardTitulo}>
        Revisão — {recon.ficheiro_nome ?? 'importação'} ({abertas} por resolver de {divs.length})
      </div>
      {erro && <div style={c.erro}>{erro}</div>}
      {divs.length === 0 ? (
        <p style={{ color: '#065F46', fontWeight: 600 }}>✓ Esta importação não tinha divergências.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {divs.map((d, i) => {
              const info = tipoDivergenciaInfo(d.tipo)
              return (
                <div key={i} style={{ ...c.divCard, opacity: d.estado === 'resolvida' ? 0.6 : 1 }}>
                  <div style={c.divTopo}>
                    <span style={{ ...c.tipoChip, color: info.cor, background: info.bg }}>{info.label}</span>
                    <span style={c.divSerie}>SN: <strong>{d.numero_serie}</strong>{d.modelo ? ` · ${d.modelo}` : ''}</span>
                    <span style={c.divValores}>
                      deles: <strong>{fmtNum(d.valor_deles)}</strong>
                      {' · '}nosso: <strong>{fmtNum(d.valor_nosso)}</strong>
                    </span>
                  </div>
                  <div style={c.divAcoes}>
                    <input
                      placeholder="Nota da resolução..."
                      value={d.nota ?? ''}
                      onChange={(e) => atualizar(i, { nota: e.target.value })}
                      style={{ ...c.input, flex: 1, minWidth: 160 }}
                    />
                    {d.tipo === 'custo_diferente' && d.estado === 'aberta' && (
                      <button style={c.acaoBtn} disabled={aGuardar} onClick={() => acaoAceitarCusto(i)}>Aceitar o deles</button>
                    )}
                    {d.tipo === 'nao_listada' && d.estado === 'aberta' && (
                      <button style={c.acaoBtn} disabled={aGuardar} onClick={() => acaoDevolvida(i)}>Marcar devolvida</button>
                    )}
                    <button
                      style={d.estado === 'aberta' ? c.acaoBtn : c.acaoBtnGhost}
                      disabled={aGuardar}
                      onClick={() => atualizar(i, { estado: d.estado === 'aberta' ? 'resolvida' : 'aberta' })}
                    >
                      {d.estado === 'aberta' ? 'Resolver' : 'Reabrir'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={c.acoes}>
            <button style={c.btnPrimario} disabled={aGuardar} onClick={() => guardar()}>
              {aGuardar ? 'A guardar...' : 'Guardar alterações'}
            </button>
            <span style={c.previa}>{abertas === 0 ? 'Todas resolvidas → a reconciliação fecha ao guardar.' : `${abertas} por resolver.`}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Lista só-leitura (pré-visualização) ─────────────────────────────────────

function ListaDivergencias({ divs }: { divs: Divergencia[]; soLeitura: true }) {
  return (
    <div style={c.tabela}>
      <div style={{ ...c.linha, ...c.cab }}>
        <span>Tipo</span><span>Nº série</span><span>Modelo</span>
        <span style={{ textAlign: 'right' }}>Deles</span><span style={{ textAlign: 'right' }}>Nosso</span>
      </div>
      {divs.map((d, i) => {
        const info = tipoDivergenciaInfo(d.tipo)
        return (
          <div key={i} style={c.linha}>
            <span><span style={{ ...c.tipoChip, color: info.cor, background: info.bg }}>{info.label}</span></span>
            <span>{d.numero_serie}</span>
            <span style={{ color: 'var(--muted)' }}>{d.modelo ?? '—'}</span>
            <span style={{ textAlign: 'right' }}>{fmtNum(d.valor_deles)}</span>
            <span style={{ textAlign: 'right' }}>{fmtNum(d.valor_nosso)}</span>
          </div>
        )
      })}
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  estado: { color: 'var(--muted)', padding: 12 },
  cabecalho: { background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 12 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 },
  cardTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  msg: { background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 10px', fontSize: 13 },
  mapaTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginTop: 4 },
  mapaGrelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 },
  opc: { color: 'var(--muted)', fontWeight: 400, fontSize: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  acoes: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnSecundario: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  resumoTipos: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tipoChip: { display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.2fr 0.9fr 0.9fr', gap: 8, padding: '8px', fontSize: 13, borderBottom: '1px solid #f3f3f3', alignItems: 'center', minWidth: 560 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  divCard: { border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  divTopo: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 },
  divSerie: { color: 'var(--foreground)' },
  divValores: { color: 'var(--muted)', fontSize: 12.5 },
  divAcoes: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  acaoBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  acaoBtnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  histLinha: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f3f3f3' },
  previa: { fontSize: 13, color: 'var(--muted)' },
}
