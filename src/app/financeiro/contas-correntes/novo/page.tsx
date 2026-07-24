'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  criarMovimento, listarClientesPicker, listarFornecedoresPicker, tipoDocInfo,
  TIPOS_DOCUMENTO, hojeISO, formatarEuro,
  type EntidadeTipo, type TipoDocumento, type EntidadeOpc,
} from '@/lib/contasCorrentes'

function parseNum(v: string): number {
  const n = Number(v.replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

function NovoMovimentoForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const { perfil } = useAuth()

  const [tipo, setTipo] = useState<EntidadeTipo>((sp.get('tipo') === 'fornecedor' ? 'fornecedor' : 'cliente'))
  const [entidades, setEntidades] = useState<EntidadeOpc[]>([])
  const [entidadeId, setEntidadeId] = useState(sp.get('id') ?? '')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('fatura')
  const [ref, setRef] = useState('')
  const [dataDoc, setDataDoc] = useState(hojeISO())
  const [dataVenc, setDataVenc] = useState('')
  const [valor, setValor] = useState('')
  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carrega a lista de entidades conforme o tipo escolhido.
  useEffect(() => {
    const carregar = tipo === 'cliente' ? listarClientesPicker : listarFornecedoresPicker
    carregar().then(setEntidades)
  }, [tipo])

  // Ao mudar de tipo manualmente, limpa a entidade selecionada (exceto no arranque).
  function mudarTipo(novo: EntidadeTipo) {
    setTipo(novo)
    setEntidadeId('')
  }

  const sentido = tipoDocInfo(tipoDoc).sentido
  const valorNum = parseNum(valor)

  const podeGuardar = useMemo(
    () => !!entidadeId && valorNum > 0 && !!dataDoc,
    [entidadeId, valorNum, dataDoc]
  )

  async function guardar() {
    setErro(null)
    if (!podeGuardar) { setErro('Escolhe a entidade, a data e um valor maior que zero.'); return }
    const ent = entidades.find((e) => e.id === entidadeId)
    setAGuardar(true)
    const { error } = await criarMovimento(
      {
        entidade_tipo: tipo,
        cliente_id: tipo === 'cliente' ? entidadeId : null,
        fornecedor_id: tipo === 'fornecedor' ? entidadeId : null,
        entidade_nome: ent?.nome ?? null,
        tipo_documento: tipoDoc,
        documento_ref: ref,
        data_documento: dataDoc,
        data_vencimento: dataVenc || null,
        valor: valorNum,
        notas,
      },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
    )
    if (error) { setErro('Não foi possível guardar: ' + error.message); setAGuardar(false); return }
    router.push(`/financeiro/contas-correntes/${tipo}/${entidadeId}`)
  }

  return (
    <main style={c.page}>
      <Link href="/financeiro/contas-correntes" style={c.voltar}>← Contas Correntes</Link>
      <h1 style={c.titulo}>Novo movimento</h1>

      {erro && <div style={c.erro}>{erro}</div>}

      <div style={c.card}>
        {/* Tipo de entidade */}
        <div style={c.grupo}>
          <span style={c.rotulo}>Entidade</span>
          <div style={c.segmento}>
            <button type="button" style={{ ...c.segBtn, ...(tipo === 'cliente' ? c.segAtivo : {}) }} onClick={() => mudarTipo('cliente')}>Cliente</button>
            <button type="button" style={{ ...c.segBtn, ...(tipo === 'fornecedor' ? c.segAtivo : {}) }} onClick={() => mudarTipo('fornecedor')}>Fornecedor</button>
          </div>
        </div>

        {/* Entidade específica */}
        <label style={c.campo}>
          <span style={c.rotulo}>{tipo === 'cliente' ? 'Cliente' : 'Fornecedor'}</span>
          <select value={entidadeId} onChange={(e) => setEntidadeId(e.target.value)} style={c.input}>
            <option value="">— escolher —</option>
            {entidades.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </label>

        {/* Documento */}
        <div style={c.grelha2}>
          <label style={c.campo}>
            <span style={c.rotulo}>Tipo de documento</span>
            <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as TipoDocumento)} style={c.input}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </label>
          <label style={c.campo}>
            <span style={c.rotulo}>Nº do documento <span style={c.opc}>(opcional)</span></span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex.: FT 2026/123" style={c.input} />
          </label>
        </div>

        <div style={c.grelha2}>
          <label style={c.campo}>
            <span style={c.rotulo}>Data do documento</span>
            <input type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} style={c.input} />
          </label>
          <label style={c.campo}>
            <span style={c.rotulo}>Data de vencimento <span style={c.opc}>(opcional)</span></span>
            <input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} style={c.input} />
          </label>
        </div>

        {/* Valor */}
        <label style={c.campo}>
          <span style={c.rotulo}>Valor</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" style={{ ...c.input, maxWidth: 240 }} />
          <span style={c.ajuda}>
            {sentido === 'debito'
              ? 'Entra a débito (aumenta o saldo).'
              : 'Entra a crédito (reduz o saldo). É abatido automaticamente às faturas mais antigas.'}
          </span>
        </label>

        <label style={c.campo}>
          <span style={c.rotulo}>Notas <span style={c.opc}>(opcional)</span></span>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 60, resize: 'vertical' }} />
        </label>

        <div style={c.acoes}>
          <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={guardar}>
            {aGuardar ? 'A guardar...' : 'Guardar movimento'}
          </button>
          {valorNum > 0 && (
            <span style={c.previa}>
              {sentido === 'debito' ? 'Débito' : 'Crédito'}: <strong>{formatarEuro(valorNum)}</strong>
            </span>
          )}
        </div>
      </div>
    </main>
  )
}

export default function NovoMovimentoPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>}>
      <NovoMovimentoForm />
    </Suspense>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 680, margin: '0 auto', padding: 20 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 16px' },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 },
  grupo: { display: 'flex', flexDirection: 'column', gap: 6 },
  segmento: { display: 'inline-flex', gap: 4, background: '#f1f2f5', borderRadius: 999, padding: 4, alignSelf: 'flex-start' },
  segBtn: { border: 'none', background: 'transparent', borderRadius: 999, padding: '6px 18px', fontWeight: 600, cursor: 'pointer', color: 'var(--muted)' },
  segAtivo: { background: '#fff', color: 'var(--primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  grelha2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  ajuda: { fontSize: 12, color: 'var(--muted)' },
  acoes: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  previa: { fontSize: 14, color: 'var(--muted)' },
}
