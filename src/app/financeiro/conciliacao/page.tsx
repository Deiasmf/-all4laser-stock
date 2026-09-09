'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { readSheet } from 'read-excel-file/browser'
import { useAuth } from '@/lib/auth'
import {
  listarContas, processarFolhas, importarMovimentos, listarLotes, ehFolhaExtrato, formatarValor,
  type ContaBancaria, type MovExtrato, type ResultadoImport, type LoteImport,
} from '@/lib/conciliacaoBancaria'

type Folha = { nome: string; linhas: unknown[][] }

export default function ConciliacaoPage() {
  const { perfil } = useAuth()
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [ficheiroNome, setFicheiroNome] = useState('')
  const [folhas, setFolhas] = useState<Folha[]>([])
  const [movimentos, setMovimentos] = useState<MovExtrato[]>([])
  const [mapPorConta, setMapPorConta] = useState<Record<string, unknown>>({})
  const [folhasLidas, setFolhasLidas] = useState<string[]>([])
  const [erros, setErros] = useState<string[]>([])
  const [aLer, setALer] = useState(false)
  const [aImportar, setAImportar] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport | null>(null)
  const [lotes, setLotes] = useState<LoteImport[]>([])

  const moedaDaConta = useCallback((id: string) => contas.find((c) => c.id === id)?.moeda ?? 'EUR', [contas])

  const carregarLotes = useCallback(async () => { setLotes(await listarLotes()) }, [])
  useEffect(() => { listarContas().then(setContas) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregarLotes() }, [carregarLotes])

  const analisar = useCallback(async (fs: Folha[], cts: ContaBancaria[]) => {
    const r = await processarFolhas(fs, cts)
    setMovimentos(r.movimentos)
    setMapPorConta(r.mapPorConta)
    setFolhasLidas(r.folhasLidas)
    setErros(r.erros)
  }, [])

  async function aoCarregarFicheiro(file: File | undefined) {
    if (!file) return
    setResultado(null); setALer(true); setMovimentos([]); setErros([])
    setFicheiroNome(file.name)
    try {
      const fs: Folha[] = []
      if (/\.csv$/i.test(file.name)) {
        const txt = await file.text()
        const linhas = txt.split(/\r?\n/).map((l) => l.split(/[;\t]/).map((c) => c.trim()))
        fs.push({ nome: file.name, linhas })
      } else {
        // Ler todas as folhas de uma vez rebentaria a memória (o ficheiro tem
        // folhas gigantes). Descobrimos os NOMES sem ler dados (o erro de folha
        // inexistente traz a lista) e lemos só as folhas do extrato, por nome.
        let nomes: string[] = []
        try {
          await readSheet(file, '__inexistente_folha_a4l__')
        } catch (e) {
          const ex = e as { name?: string; sheets?: string[] }
          if (ex?.name === 'SheetNotFoundError' && Array.isArray(ex.sheets)) nomes = ex.sheets
          else throw e
        }
        const alvo = nomes.filter(ehFolhaExtrato)
        if (alvo.length === 0) {
          setErros([`Não encontrei folhas de extrato (esperava algo como "… BPI EUR" / "… BPI USD"). Folhas no ficheiro: ${nomes.join(', ')}`])
          setALer(false); return
        }
        for (const nome of alvo) {
          const linhas = (await readSheet(file, nome)) as unknown[][]
          fs.push({ nome, linhas })
        }
      }
      setFolhas(fs)
      await analisar(fs, contas)
    } catch (e) {
      setErros([`Erro a ler o ficheiro: ${e instanceof Error ? e.message : String(e)}`])
    }
    setALer(false)
  }

  async function executarImport() {
    if (novosTotal === 0) return
    setAImportar(true)
    const r = await importarMovimentos(movimentos, mapPorConta as Record<string, never>, ficheiroNome, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setResultado(r)
    await carregarLotes()
    if (folhas.length) await analisar(folhas, contas)  // refresca "já existe"
    setAImportar(false)
  }

  const porConta = useMemo(() => {
    const ids = Array.from(new Set(movimentos.map((m) => m.conta_id)))
    return ids.map((id) => {
      const ms = movimentos.filter((m) => m.conta_id === id)
      return {
        id, nome: ms[0]?.conta_nome ?? '', moeda: moedaDaConta(id),
        total: ms.length,
        novos: ms.filter((m) => !m.jaExiste).length,
        repetidos: ms.filter((m) => m.jaExiste).length,
        porConciliar: ms.filter((m) => !m.jaExiste && m.estado === 'por_conciliar').length,
        ignorados: ms.filter((m) => !m.jaExiste && m.estado === 'ignorado').length,
      }
    })
  }, [movimentos, moedaDaConta])
  const novosTotal = useMemo(() => movimentos.filter((m) => !m.jaExiste).length, [movimentos])

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>🏦 Conciliação Bancária</h1>
          <p style={c.sub}>Importa o extrato do banco e concilia os recebimentos com as faturas.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/financeiro/conciliacao/controlo" style={{ ...c.btnPrim, background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)' }}>📊 Controlo</Link>
          <Link href="/financeiro/conciliacao/fila" style={c.btnPrim}>Conciliar recebimentos →</Link>
        </div>
      </div>

      {/* Contas */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Contas bancárias</div>
        <div style={c.resumo}>
          {contas.map((cc) => (
            <span key={cc.id} style={c.chipConta}>{cc.banco ? cc.banco + ' · ' : ''}{cc.nome} <span style={c.muted}>({cc.moeda})</span></span>
          ))}
          {contas.length === 0 && <span style={c.muted}>Sem contas ativas.</span>}
        </div>
      </section>

      {/* Importar */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Importar extrato</div>
        <ol style={c.passos}>
          <li>Exporta/abre o extrato BPI (Excel <code style={c.code}>.xlsx</code> ou CSV).</li>
          <li>Carrega o ficheiro. As folhas <strong>EUR</strong> e <strong>USD</strong> são associadas às contas certas automaticamente.</li>
          <li>Confirma a pré-visualização e clica <strong>Importar</strong>. Reimportar o mesmo período não duplica.</li>
        </ol>
        <div style={c.acoesTopo}>
          <label style={c.btnPrim}>
            📄 Carregar extrato (.xlsx / .csv)
            <input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={(e) => aoCarregarFicheiro(e.target.files?.[0])} />
          </label>
          {ficheiroNome && <span style={c.muted}>{ficheiroNome}</span>}
          {aLer && <span style={c.muted}>A ler o ficheiro…</span>}
        </div>
        {folhasLidas.length > 0 && <p style={c.nota}>Folhas lidas: {folhasLidas.join(', ')}.</p>}
        <p style={c.aviso2}>
          O <strong>sinal</strong> do valor define o sentido (entrada/saída). Só os <strong>créditos</strong> (recebimentos)
          entram na fila de conciliação; os débitos e o que bate uma regra de auto-ignorar ficam já como <em>ignorado</em>.
        </p>
      </section>

      {/* Erros */}
      {erros.length > 0 && (
        <section style={{ ...c.card, borderColor: '#FCA5A5' }}>
          <div style={{ ...c.cardTitulo, color: '#B91C1C' }}>Avisos</div>
          <ul style={c.erros}>{erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </section>
      )}

      {/* Pré-visualização */}
      {movimentos.length > 0 && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Pré-visualização</div>
          <div style={c.resumo}>
            {porConta.map((p) => (
              <div key={p.id} style={c.blocoConta}>
                <div style={c.blocoContaNome}>{p.nome} <span style={c.muted}>({p.moeda})</span></div>
                <div style={c.chips}>
                  <Chip cor="#1E40AF" bg="#DBEAFE" n={p.total} txt="linhas" />
                  <Chip cor="#065F46" bg="#D1FAE5" n={p.novos} txt="novos" />
                  <Chip cor="#6B7280" bg="#F3F4F6" n={p.repetidos} txt="repetidos" />
                  <Chip cor="#065F46" bg="#ECFDF5" n={p.porConciliar} txt="a conciliar" />
                  <Chip cor="#92400E" bg="#FEF3C7" n={p.ignorados} txt="ignorados" />
                </div>
              </div>
            ))}
          </div>

          {resultado && (
            <div style={{ ...c.resultado, ...(resultado.erro ? c.resErro : {}) }}>
              {resultado.erro
                ? `⚠️ Erro na importação: ${resultado.erro}`
                : '✅ ' + resultado.porConta.map((p) => `${p.conta_nome}: ${p.novos} novo(s), ${p.repetidos} repetido(s)`).join(' · ')}
            </div>
          )}

          <div style={c.tabela}>
            <div style={{ ...c.linha, ...c.cab }}>
              <span>Conta</span>
              <span>Data</span>
              <span>Descritivo</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
              <span style={{ textAlign: 'center' }}>Estado</span>
            </div>
            {movimentos.slice(0, 200).map((m, i) => (
              <div key={m.hash + i} style={{ ...c.linha, ...(m.jaExiste ? c.linhaRepetida : {}) }}>
                <span style={c.muted}>{m.conta_nome}</span>
                <span style={c.muted}>{m.data}</span>
                <span title={m.observacoes ?? undefined}>
                  {m.descritivo}
                  {m.observacoes && <span style={c.obs}> · {m.observacoes}</span>}
                </span>
                <span style={{ textAlign: 'right', color: m.sentido === 'credito' ? '#065F46' : '#B91C1C', fontWeight: 600 }}>
                  {m.sentido === 'credito' ? '+' : '−'}{formatarValor(m.valor, moedaDaConta(m.conta_id))}
                </span>
                <span style={{ textAlign: 'center' }}><EstadoBadge m={m} /></span>
              </div>
            ))}
          </div>
          {movimentos.length > 200 && <p style={c.nota}>A mostrar 200 de {movimentos.length}. A importação processa todas.</p>}

          <div style={{ marginTop: 12 }}>
            <button style={c.btnPrim} disabled={aImportar || novosTotal === 0} onClick={executarImport}>
              {aImportar ? 'A importar…' : `Importar ${novosTotal} movimento(s) novo(s)`}
            </button>
            {novosTotal === 0 && <p style={c.nota}>Nada novo para importar (todos os movimentos deste ficheiro já existem).</p>}
          </div>
        </section>
      )}

      {/* Histórico */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Últimas importações</div>
        {lotes.length === 0 ? (
          <p style={c.muted}>Ainda sem importações.</p>
        ) : (
          <div style={c.tabela}>
            <div style={{ ...c.linhaLote, ...c.cab }}>
              <span>Quando</span>
              <span>Ficheiro</span>
              <span>Período</span>
              <span style={{ textAlign: 'right' }}>Novos / Repetidos</span>
            </div>
            {lotes.map((l) => (
              <div key={l.id} style={c.linhaLote}>
                <span style={c.muted}>{new Date(l.created_at).toLocaleString('pt-PT')}</span>
                <span style={c.muted}>{l.ficheiro_nome ?? '—'}</span>
                <span style={c.muted}>{l.periodo_inicio ?? '?'} → {l.periodo_fim ?? '?'}</span>
                <span style={{ textAlign: 'right' }}><strong style={{ color: '#065F46' }}>{l.novos}</strong> / <span style={c.muted}>{l.repetidos}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function Chip({ n, txt, cor, bg }: { n: number; txt: string; cor: string; bg: string }) {
  return <span style={{ ...c.chip, color: cor, background: bg }}><strong>{n}</strong> {txt}</span>
}
function EstadoBadge({ m }: { m: MovExtrato }) {
  if (m.jaExiste) return <span style={{ ...c.badge, color: '#6B7280', background: '#F3F4F6' }}>já existe</span>
  if (m.estado === 'ignorado') return <span style={{ ...c.badge, color: '#92400E', background: '#FEF3C7' }}>ignorar{m.ignorar_categoria ? ` · ${m.ignorar_categoria}` : ''}</span>
  return <span style={{ ...c.badge, color: '#065F46', background: '#D1FAE5' }}>a conciliar</span>
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  passos: { margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--foreground)', display: 'flex', flexDirection: 'column', gap: 4 },
  nota: { fontSize: 12.5, color: 'var(--muted)', margin: 0 },
  code: { background: '#f1f2f5', padding: '2px 6px', borderRadius: 6, fontSize: 12 },
  acoesTopo: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' },
  aviso2: { fontSize: 12.5, color: 'var(--muted)', background: '#F9FAFB', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px', margin: 0 },
  erros: { margin: 0, paddingLeft: 18, fontSize: 13, color: '#B91C1C', display: 'flex', flexDirection: 'column', gap: 2 },
  resumo: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: { fontSize: 12.5, borderRadius: 999, padding: '3px 10px', fontWeight: 600 },
  chipConta: { fontSize: 13, borderRadius: 999, padding: '4px 12px', fontWeight: 600, background: '#EEF2FF', color: '#3730A3' },
  blocoConta: { border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 },
  blocoContaNome: { fontWeight: 700, fontSize: 13.5, color: 'var(--primary)' },
  resultado: { background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  resErro: { background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1fr 0.8fr 3fr 1fr 1fr', gap: 8, padding: '9px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 820 },
  linhaRepetida: { opacity: 0.5 },
  obs: { color: '#6D28D9', fontSize: 12 },
  linhaLote: { display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1.6fr 1fr', gap: 8, padding: '9px 8px', fontSize: 13, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 620 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
}
