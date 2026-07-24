'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  parseCsv, processar, importar, listarSyncs, descarregarModeloCsv, CABECALHO_CSV,
  type LinhaImport, type SyncRun, type ResultadoImport,
} from '@/lib/keyinvoiceSync'
import { tipoDocInfo, formatarEuro, formatarData } from '@/lib/contasCorrentes'

export default function KeyinvoicePage() {
  const { perfil } = useAuth()
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<LinhaImport[]>([])
  const [erros, setErros] = useState<string[]>([])
  const [aAnalisar, setAAnalisar] = useState(false)
  const [aImportar, setAImportar] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport | null>(null)
  const [syncs, setSyncs] = useState<SyncRun[]>([])

  const carregarSyncs = useCallback(async () => { setSyncs(await listarSyncs()) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregarSyncs() }, [carregarSyncs])

  const contagens = useMemo(() => ({
    total: linhas.length,
    aImportar: linhas.filter((l) => l.associada && !l.jaImportada).length,
    jaImportadas: linhas.filter((l) => l.jaImportada).length,
    semEntidade: linhas.filter((l) => !l.associada).length,
  }), [linhas])

  async function analisar(conteudo: string) {
    setResultado(null)
    setAAnalisar(true)
    const { docs, erros: errosParse } = parseCsv(conteudo)
    const processadas = docs.length > 0 ? await processar(docs) : []
    setLinhas(processadas)
    setErros(errosParse)
    setAAnalisar(false)
  }

  async function aoCarregarFicheiro(file: File | undefined) {
    if (!file) return
    const conteudo = await file.text()
    setTexto(conteudo)
    await analisar(conteudo)
  }

  async function executarImport() {
    if (contagens.aImportar === 0) return
    setAImportar(true)
    const r = await importar(linhas, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setResultado(r)
    await carregarSyncs()
    // Reanalisa para atualizar o estado "já importada".
    if (texto) await analisar(texto)
    setAImportar(false)
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>🔗 Keyinvoice</h1>
          <p style={c.sub}>Importa faturas, recibos e notas de crédito para as Contas Correntes.</p>
        </div>
      </div>

      {/* Instruções */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Como importar</div>
        <ol style={c.passos}>
          <li>Exporta os documentos do Keyinvoice e organiza-os no modelo CSV.</li>
          <li>Carrega o ficheiro (ou cola o conteúdo) e confirma a pré-visualização.</li>
          <li>Clica em <strong>Importar</strong>. Documentos já importados são ignorados automaticamente.</li>
        </ol>
        <p style={c.nota}>
          Colunas: <code style={c.code}>{CABECALHO_CSV}</code>. As entidades são associadas por NIF (ou nome).
        </p>
        <div style={c.acoesTopo}>
          <button style={c.btnSec} onClick={descarregarModeloCsv}>⬇️ Descarregar modelo CSV</button>
          <label style={c.btnPrim}>
            📄 Carregar ficheiro CSV
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => aoCarregarFicheiro(e.target.files?.[0])} />
          </label>
        </div>
        <p style={c.aviso2}>
          A ligação automática à API do Keyinvoice fica para quando houver chave de acesso — o pipeline (associação, idempotência) é o mesmo.
        </p>
      </section>

      {/* Colar conteúdo */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Ou colar o conteúdo CSV</div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={CABECALHO_CSV + '\nfatura;FT2026/101;cliente;Clínica...;500100200;2026-05-10;2026-06-09;1230,00'}
          style={c.textarea}
        />
        <button style={{ ...c.btnPrim, alignSelf: 'flex-start' }} disabled={aAnalisar || !texto.trim()} onClick={() => analisar(texto)}>
          {aAnalisar ? 'A analisar...' : 'Analisar'}
        </button>
      </section>

      {/* Erros de parsing */}
      {erros.length > 0 && (
        <section style={{ ...c.card, borderColor: '#FCA5A5' }}>
          <div style={{ ...c.cardTitulo, color: '#B91C1C' }}>{erros.length} linha(s) com problemas (ignoradas)</div>
          <ul style={c.erros}>{erros.slice(0, 15).map((e, i) => <li key={i}>{e}</li>)}</ul>
          {erros.length > 15 && <p style={c.nota}>… e mais {erros.length - 15}.</p>}
        </section>
      )}

      {/* Pré-visualização */}
      {linhas.length > 0 && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Pré-visualização</div>
          <div style={c.resumo}>
            <Chip cor="#1E40AF" bg="#DBEAFE" n={contagens.total} txt="documentos" />
            <Chip cor="#065F46" bg="#D1FAE5" n={contagens.aImportar} txt="a importar" />
            <Chip cor="#6B7280" bg="#F3F4F6" n={contagens.jaImportadas} txt="já importados" />
            <Chip cor="#92400E" bg="#FEF3C7" n={contagens.semEntidade} txt="sem entidade" />
          </div>

          {resultado && (
            <div style={c.resultado}>
              {resultado.erro
                ? `⚠️ Erro na importação: ${resultado.erro}`
                : `✅ Importados ${resultado.importados}. Ignorados ${resultado.ignorados}. Sem entidade ${resultado.semEntidade}.`}
            </div>
          )}

          <div style={c.tabela}>
            <div style={{ ...c.linha, ...c.cab }}>
              <span>Documento</span>
              <span>Entidade</span>
              <span>Data</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
              <span style={{ textAlign: 'center' }}>Estado</span>
            </div>
            {linhas.slice(0, 200).map((l, i) => (
              <div key={l.keyinvoice_doc_id + i} style={c.linha}>
                <span>{tipoDocInfo(l.tipo_documento).label} {l.numero}</span>
                <span>
                  {l.nome}
                  <span style={c.entTipo}> · {l.entidade_tipo}</span>
                </span>
                <span style={c.muted}>{formatarData(l.data_documento)}</span>
                <span style={{ textAlign: 'right' }}>{formatarEuro(l.valor)}</span>
                <span style={{ textAlign: 'center' }}><EstadoLinha l={l} /></span>
              </div>
            ))}
          </div>
          {linhas.length > 200 && <p style={c.nota}>A mostrar 200 de {linhas.length}. A importação processa todas.</p>}

          <div style={{ marginTop: 12 }}>
            <button style={c.btnPrim} disabled={aImportar || contagens.aImportar === 0} onClick={executarImport}>
              {aImportar ? 'A importar...' : `Importar ${contagens.aImportar} movimento(s)`}
            </button>
            {contagens.semEntidade > 0 && (
              <p style={c.nota}>As linhas “sem entidade” não são importadas — cria o cliente/fornecedor (ou corrige o NIF/nome) e volta a analisar.</p>
            )}
          </div>
        </section>
      )}

      {/* Histórico */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Últimas sincronizações</div>
        {syncs.length === 0 ? (
          <p style={c.muted}>Ainda sem importações.</p>
        ) : (
          <div style={c.tabela}>
            <div style={{ ...c.linhaSync, ...c.cab }}>
              <span>Quando</span>
              <span>Origem</span>
              <span>Estado</span>
              <span>Resumo</span>
            </div>
            {syncs.map((s) => {
              const p = (s.payload ?? {}) as { importados?: number; ignorados?: number; semEntidade?: number; total?: number }
              return (
                <div key={s.id} style={c.linhaSync}>
                  <span style={c.muted}>{new Date(s.created_at).toLocaleString('pt-PT')}</span>
                  <span style={c.muted}>{s.recurso ?? '—'}</span>
                  <span>{s.estado === 'ok' ? '✅ ok' : '⚠️ erro'}</span>
                  <span style={c.muted}>
                    {p.importados ?? 0} importados · {p.ignorados ?? 0} ignorados · {p.semEntidade ?? 0} sem entidade
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function Chip({ n, txt, cor, bg }: { n: number; txt: string; cor: string; bg: string }) {
  return <span style={{ ...c.chip, color: cor, background: bg }}><strong>{n}</strong> {txt}</span>
}

function EstadoLinha({ l }: { l: LinhaImport }) {
  if (l.jaImportada) return <span style={{ ...c.badge, color: '#6B7280', background: '#F3F4F6' }}>Já importado</span>
  if (!l.associada) return <span style={{ ...c.badge, color: '#92400E', background: '#FEF3C7' }}>Sem entidade</span>
  return <span style={{ ...c.badge, color: '#065F46', background: '#D1FAE5' }}>A importar</span>
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
  acoesTopo: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 },
  aviso2: { fontSize: 12.5, color: 'var(--muted)', background: '#F9FAFB', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px', margin: 0 },
  textarea: { width: '100%', minHeight: 120, padding: 12, border: '1px solid var(--border)', borderRadius: 8, font: '13px monospace', boxSizing: 'border-box', resize: 'vertical' },
  erros: { margin: 0, paddingLeft: 18, fontSize: 13, color: '#B91C1C', display: 'flex', flexDirection: 'column', gap: 2 },
  resumo: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: { fontSize: 13, borderRadius: 999, padding: '4px 12px', fontWeight: 600 },
  resultado: { background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.6fr 2fr 1fr 1fr 1.1fr', gap: 8, padding: '9px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 720 },
  linhaSync: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 2.4fr', gap: 8, padding: '9px 8px', fontSize: 13, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 620 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  entTipo: { color: 'var(--muted)', fontSize: 12 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  btnSec: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
