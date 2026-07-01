'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { pesquisarPecas } from '@/lib/pecas'
import { listarClientesCompleto } from '@/lib/clientes'
import {
  criarReparacao, criarItens, criarMovimento,
  listarFornecedoresReparacao, criarFornecedorReparacao, descontarStockPeca,
} from '@/lib/reparacaoPecas'
import type { Peca } from '@/types/peca'
import type { Cliente } from '@/types/cliente'
import type { FornecedorReparacao, TipoGarantia, ReparacaoPeca } from '@/types/reparacaoPeca'
import {
  TIPOS_GARANTIA, RESPONSAVEIS_PAGAMENTO, RESPONSAVEL_POR_GARANTIA,
} from '@/types/reparacaoPeca'

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

type ItemForm = { descricao: string; quantidade: string }

export default function NovaReparacaoPage() {
  const router = useRouter()
  const { perfil, isAdmin } = useAuth()

  // S1 — tipo/dono
  const [tipoDono, setTipoDono] = useState<'nossa' | 'cliente'>('nossa')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteBusca, setClienteBusca] = useState('')
  const [clienteId, setClienteId] = useState<string | null>(null)

  // S2 — identificação da peça
  const [peca, setPeca] = useState('')
  const [pecaId, setPecaId] = useState<string | null>(null)
  const [pecaSugestoes, setPecaSugestoes] = useState<Peca[]>([])
  const [temSn, setTemSn] = useState(false)
  const [snAvariado, setSnAvariado] = useState('')
  const [equipamentoSn, setEquipamentoSn] = useState('')
  const [qrCode, setQrCode] = useState('')

  // S3 — itens sem SN
  const [itens, setItens] = useState<ItemForm[]>([{ descricao: '', quantidade: '1' }])

  // S4 — fornecedor
  const [fornecedores, setFornecedores] = useState<FornecedorReparacao[]>([])
  const [fornecedorSel, setFornecedorSel] = useState('') // nome ou '__outro__'
  const [fornecedorOutro, setFornecedorOutro] = useState('')
  const [dataSaida, setDataSaida] = useState(hoje())

  // S5 — garantia/pagamento
  const [tipoGarantia, setTipoGarantia] = useState<TipoGarantia | ''>('')
  const [responsavel, setResponsavel] = useState('')
  const [valorReparacao, setValorReparacao] = useState('')

  // S6 — substituta
  const [substitutaEnviada, setSubstitutaEnviada] = useState(false)
  const [substitutaPeca, setSubstitutaPeca] = useState('')
  const [substitutaPecaId, setSubstitutaPecaId] = useState<string | null>(null)
  const [substitutaSugestoes, setSubstitutaSugestoes] = useState<Peca[]>([])
  const [substitutaSn, setSubstitutaSn] = useState('')

  // S7 — notas
  const [notas, setNotas] = useState('')

  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    listarClientesCompleto().then(setClientes)
    listarFornecedoresReparacao().then(setFornecedores)
  }, [])

  // Autocomplete de peça (stock)
  const buscaPecaRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function procurarPeca(q: string, alvo: 'principal' | 'substituta') {
    if (buscaPecaRef.current) clearTimeout(buscaPecaRef.current)
    buscaPecaRef.current = setTimeout(async () => {
      const res = q.trim().length >= 2 ? await pesquisarPecas(q) : []
      if (alvo === 'principal') setPecaSugestoes(res)
      else setSubstitutaSugestoes(res)
    }, 250)
  }

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase()
    if (!q) return []
    return clientes.filter((cl) => cl.nome.toLowerCase().includes(q)).slice(0, 8)
  }, [clientes, clienteBusca])

  function escolherGarantia(g: TipoGarantia | '') {
    setTipoGarantia(g)
    if (g) setResponsavel(RESPONSAVEL_POR_GARANTIA[g])
  }

  function atualizarItem(i: number, campo: keyof ItemForm, valor: string) {
    setItens((arr) => arr.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)))
  }
  function adicionarItem() {
    setItens((arr) => [...arr, { descricao: '', quantidade: '1' }])
  }
  function removerItem(i: number) {
    setItens((arr) => arr.filter((_, idx) => idx !== i))
  }

  async function submeter() {
    setErro(null)
    if (!peca.trim() && !(!temSn && itens.some((i) => i.descricao.trim()))) {
      return setErro('Indica a peça (ou pelo menos um item sem SN).')
    }
    if (tipoDono === 'cliente' && !clienteId && !clienteBusca.trim()) {
      return setErro('Indica o cliente.')
    }
    const fornecedorFinal =
      fornecedorSel === '__outro__' ? fornecedorOutro.trim() : fornecedorSel
    if (!fornecedorFinal) return setErro('Indica o fornecedor de reparação.')

    setAGuardar(true)

    // Cliente (se novo fornecedor "outro", grava-o também)
    if (fornecedorSel === '__outro__' && fornecedorOutro.trim()) {
      await criarFornecedorReparacao(fornecedorOutro.trim())
    }

    const clienteNome =
      tipoDono === 'cliente'
        ? (clientes.find((cl) => cl.id === clienteId)?.nome ?? clienteBusca.trim())
        : null

    const garantiaLabel = tipoGarantia
      ? TIPOS_GARANTIA.find((t) => t.valor === tipoGarantia)?.label ?? null
      : null

    const { data, error } = await criarReparacao({
      tipo_dono: tipoDono,
      cliente_id: tipoDono === 'cliente' ? clienteId : null,
      cliente_nome: clienteNome,
      peca: peca.trim() || null,
      peca_id: pecaId,
      tem_sn: temSn,
      sn_avariado: temSn ? snAvariado.trim() || null : null,
      serial_number: temSn ? snAvariado.trim() || null : null,
      equipamento_sn: equipamentoSn.trim() || null,
      qr_code: qrCode.trim() || null,
      fornecedor: fornecedorFinal,
      data_saida: dataSaida || hoje(),
      tipo_garantia: tipoGarantia || null,
      garantia: garantiaLabel,
      responsavel_pagamento: (responsavel || null) as ReparacaoPeca['responsavel_pagamento'],
      valor_reparacao: valorReparacao.trim() ? Number(valorReparacao) : null,
      substituta_enviada: tipoDono === 'cliente' ? substitutaEnviada : false,
      substituta_peca_id: substitutaEnviada ? substitutaPecaId : null,
      substituta_sn: substitutaEnviada ? substitutaSn.trim() || null : null,
      notas: notas.trim() || null,
      status: 'em_reparacao',
      criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
    })

    if (error || !data) {
      setAGuardar(false)
      return setErro('Erro a registar: ' + (error?.message ?? 'desconhecido'))
    }
    const id = (data as { id: string }).id

    // Itens sem SN
    if (!temSn) {
      const itensValidos = itens
        .filter((i) => i.descricao.trim())
        .map((i) => ({ descricao: i.descricao.trim(), quantidade_saida: Number(i.quantidade) || 1 }))
      if (itensValidos.length) await criarItens(id, itensValidos)
    }

    // Movimento de saída
    await criarMovimento({
      reparacao_id: id, tipo: 'saida', data: dataSaida || hoje(),
      sn: temSn ? snAvariado.trim() || null : null,
      notas: notas.trim() || null,
      criado_por: perfil?.id ?? null, criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
    })
    // Movimento de substituta enviada + desconto do stock (sai definitivamente)
    if (tipoDono === 'cliente' && substitutaEnviada) {
      await criarMovimento({
        reparacao_id: id, tipo: 'substituta_enviada', data: dataSaida || hoje(),
        sn: substitutaSn.trim() || null,
        criado_por: perfil?.id ?? null, criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
      })
      if (substitutaPecaId) await descontarStockPeca(substitutaPecaId, 1)
    }

    router.push(`/logistico/reparacao-pecas/${id}`)
  }

  if (!isAdmin) {
    return (
      <main style={s.page}>
        <div style={s.cabecalho}>
          <h1 style={s.titulo}>Nova Reparação</h1>
          <Link href="/logistico/reparacao-pecas" style={s.voltar}>← Voltar</Link>
        </div>
        <p style={s.nota}>Só administradores podem registar reparações.</p>
      </main>
    )
  }

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <h1 style={s.titulo}>Nova Reparação</h1>
        <Link href="/logistico/reparacao-pecas" style={s.voltar}>← Voltar</Link>
      </div>

      {erro && <div style={s.erro}>{erro}</div>}

      {/* S1 — Tipo e Dono */}
      <section style={s.card}>
        <div style={s.cardTitulo}>1. Tipo e Dono</div>
        <div style={s.toggleRow}>
          <button type="button" style={{ ...s.toggle, ...(tipoDono === 'nossa' ? s.toggleAtivo : {}) }} onClick={() => setTipoDono('nossa')}>Peça Nossa</button>
          <button type="button" style={{ ...s.toggle, ...(tipoDono === 'cliente' ? s.toggleAtivo : {}) }} onClick={() => setTipoDono('cliente')}>Peça de Cliente</button>
        </div>
        {tipoDono === 'cliente' && (
          <div style={{ position: 'relative' }}>
            <label style={s.label}>Cliente</label>
            <input
              style={s.input}
              placeholder="Nome do cliente"
              value={clienteBusca}
              onChange={(e) => { setClienteBusca(e.target.value); setClienteId(null) }}
            />
            {clienteId === null && clientesFiltrados.length > 0 && (
              <div style={s.dropdown}>
                {clientesFiltrados.map((cl) => (
                  <button type="button" key={cl.id} style={s.dropItem} onClick={() => { setClienteId(cl.id); setClienteBusca(cl.nome) }}>
                    {cl.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* S2 — Identificação da Peça */}
      <section style={s.card}>
        <div style={s.cardTitulo}>2. Identificação da Peça</div>
        <div style={{ position: 'relative' }}>
          <label style={s.label}>Peça (procura no stock ou escreve)</label>
          <input
            style={s.input}
            placeholder="Ex: Fonte MGL"
            value={peca}
            onChange={(e) => { setPeca(e.target.value); setPecaId(null); procurarPeca(e.target.value, 'principal') }}
          />
          {pecaId === null && pecaSugestoes.length > 0 && (
            <div style={s.dropdown}>
              {pecaSugestoes.map((p) => (
                <button type="button" key={p.id} style={s.dropItem} onClick={() => { setPeca(p.nome); setPecaId(p.id); setPecaSugestoes([]) }}>
                  {p.nome}{p.marca ? ` · ${p.marca}` : ''}{p.serial_number ? ` · S/N ${p.serial_number}` : ''}
                </button>
              ))}
            </div>
          )}
          {pecaId && <div style={s.ok}>✓ Ligada ao stock de peças</div>}
        </div>

        <label style={s.check}>
          <input type="checkbox" checked={temSn} onChange={(e) => setTemSn(e.target.checked)} />
          Esta peça tem Serial Number?
        </label>
        {temSn && (
          <div>
            <label style={s.label}>SN da peça avariada</label>
            <input style={s.input} value={snAvariado} onChange={(e) => setSnAvariado(e.target.value)} />
          </div>
        )}

        <label style={s.label}>SN do equipamento a que pertence (opcional)</label>
        <input style={s.input} value={equipamentoSn} onChange={(e) => setEquipamentoSn(e.target.value)} />

        <label style={s.label}>QR Code (opcional)</label>
        <input style={s.input} value={qrCode} onChange={(e) => setQrCode(e.target.value)} />
      </section>

      {/* S3 — Itens sem SN */}
      {!temSn && (
        <section style={s.card}>
          <div style={s.cardTitulo}>3. Peças sem SN (vários itens)</div>
          <p style={s.nota}>Ex.: “Fibra 18mm × 3”. Adiciona uma linha por tipo de peça.</p>
          {itens.map((it, i) => (
            <div key={i} style={s.itemLinha}>
              <input style={{ ...s.input, flex: 1 }} placeholder="Descrição (ex: Fibra 18mm)" value={it.descricao} onChange={(e) => atualizarItem(i, 'descricao', e.target.value)} />
              <input style={{ ...s.input, width: 80 }} type="number" inputMode="numeric" min={1} value={it.quantidade} onChange={(e) => atualizarItem(i, 'quantidade', e.target.value)} />
              {itens.length > 1 && <button type="button" style={s.btnRemover} onClick={() => removerItem(i)} aria-label="Remover">✕</button>}
            </div>
          ))}
          <button type="button" style={s.btnGhost} onClick={adicionarItem}>+ Adicionar item</button>
        </section>
      )}

      {/* S4 — Fornecedor */}
      <section style={s.card}>
        <div style={s.cardTitulo}>4. Fornecedor de Reparação</div>
        <label style={s.label}>Fornecedor</label>
        <select style={s.input} value={fornecedorSel} onChange={(e) => setFornecedorSel(e.target.value)}>
          <option value="">— escolher —</option>
          {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
          <option value="__outro__">Outro...</option>
        </select>
        {fornecedorSel === '__outro__' && (
          <input style={{ ...s.input, marginTop: 8 }} placeholder="Nome do fornecedor" value={fornecedorOutro} onChange={(e) => setFornecedorOutro(e.target.value)} />
        )}
        <label style={s.label}>Data de saída</label>
        <input style={s.input} type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} />
      </section>

      {/* S5 — Garantia e Pagamento */}
      <section style={s.card}>
        <div style={s.cardTitulo}>5. Garantia e Pagamento</div>
        <label style={s.label}>Tipo de garantia</label>
        <select style={s.input} value={tipoGarantia} onChange={(e) => escolherGarantia(e.target.value as TipoGarantia | '')}>
          <option value="">— escolher —</option>
          {TIPOS_GARANTIA.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>
        <label style={s.label}>Responsável pelo pagamento</label>
        <select style={s.input} value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
          <option value="">— escolher —</option>
          {RESPONSAVEIS_PAGAMENTO.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
        </select>
        <label style={s.label}>Valor de reparação estimado (€)</label>
        <input style={s.input} type="number" inputMode="decimal" step="0.01" value={valorReparacao} onChange={(e) => setValorReparacao(e.target.value)} />
      </section>

      {/* S6 — Peça Substituta */}
      {tipoDono === 'cliente' && (
        <section style={s.card}>
          <div style={s.cardTitulo}>6. Peça Substituta</div>
          <label style={s.check}>
            <input type="checkbox" checked={substitutaEnviada} onChange={(e) => setSubstitutaEnviada(e.target.checked)} />
            Enviámos peça substituta em avanço?
          </label>
          {substitutaEnviada && (
            <>
              <div style={{ position: 'relative' }}>
                <label style={s.label}>Peça substituta (do stock)</label>
                <input style={s.input} placeholder="Procurar no stock" value={substitutaPeca} onChange={(e) => { setSubstitutaPeca(e.target.value); setSubstitutaPecaId(null); procurarPeca(e.target.value, 'substituta') }} />
                {substitutaPecaId === null && substitutaSugestoes.length > 0 && (
                  <div style={s.dropdown}>
                    {substitutaSugestoes.map((p) => (
                      <button type="button" key={p.id} style={s.dropItem} onClick={() => { setSubstitutaPeca(p.nome); setSubstitutaPecaId(p.id); setSubstitutaSugestoes([]) }}>
                        {p.nome}{p.serial_number ? ` · S/N ${p.serial_number}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label style={s.label}>SN da substituta (se aplicável)</label>
              <input style={s.input} value={substitutaSn} onChange={(e) => setSubstitutaSn(e.target.value)} />
              <p style={s.notaAviso}>A peça substituta saiu do stock definitivamente.</p>
            </>
          )}
        </section>
      )}

      {/* S7 — Notas */}
      <section style={s.card}>
        <div style={s.cardTitulo}>7. Notas</div>
        <textarea style={s.textarea} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </section>

      <button style={{ ...s.btnPrimario, opacity: aGuardar ? 0.6 : 1 }} disabled={aGuardar} onClick={submeter}>
        {aGuardar ? 'A guardar...' : 'Registar Saída para Reparação'}
      </button>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 640, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitulo: { fontWeight: 700, color: 'var(--primary)', marginBottom: 10 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 70, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', resize: 'vertical' },
  check: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  toggleRow: { display: 'flex', gap: 8 },
  toggle: { flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontWeight: 600, cursor: 'pointer', color: 'var(--foreground)' },
  toggleAtivo: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 220, overflowY: 'auto' },
  dropItem: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f2f2f2' },
  itemLinha: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' },
  ok: { fontSize: 13, color: '#2e7d32', marginTop: 4 },
  nota: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  notaAviso: { fontSize: 13, color: '#9a5b00', background: '#fdf2e3', border: '1px solid #f0c884', borderRadius: 8, padding: '8px 10px', marginTop: 8 },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginBottom: 12, color: '#c62828' },
  btnPrimario: { width: '100%', marginTop: 6, padding: 14, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  btnRemover: { background: '#fff', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontWeight: 700 },
}
