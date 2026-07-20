'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import { formatarEuro, mesAtual, nomeMes, somar, parseNumeroPt } from '@/lib/alugueres'
import {
  TIPOS_ALUGUER,
  TIPOS_INTERNACIONAL,
  METODOS_PAGAMENTO,
  type Aluguer,
} from '@/types/aluguer'

const BUCKET_FATURAS = 'faturas-alugueres'

// Faturação de um aluguer num mês específico (tabela alugueres_faturacao_mensal).
// id === null representa uma linha ainda por criar (mês por definir).
type Fat = {
  id: string | null
  aluguer_id: string
  mes: string
  valor_a_faturar: number | null
  nao_faturar: boolean
  validado: boolean
  pago: boolean
  fatura_url: string | null
  fatura_caminho: string | null
  fatura_nome: string | null
  fatura_enviada_em: string | null
  fatura_enviada_para: string | null
}

// Linha da lista = um aluguer ativo num mês + a faturação desse mês
type LinhaMes = { aluguer: Aluguer; fat: Fat }

// Faturação vazia (mês ainda por definir)
function fatVazia(aluguerId: string, mes: string): Fat {
  return {
    id: null, aluguer_id: aluguerId, mes, valor_a_faturar: null,
    nao_faturar: false, validado: false, pago: false, fatura_url: null, fatura_caminho: null,
    fatura_nome: null, fatura_enviada_em: null, fatura_enviada_para: null,
  }
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Limpa o nome do ficheiro (só letras, números, ponto e traço)
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

// Texto do "Valor a Faturar" (espelha a célula da tabela)
function valorAFaturarTexto(fat: Fat): string {
  if (fat.nao_faturar) return 'Não faturar'
  if (fat.valor_a_faturar != null) return formatarEuro(fat.valor_a_faturar)
  return '—'
}

// Colunas para exportação (espelham a tabela do mês mostrado)
const colunasExport: ColunaExport<LinhaMes>[] = [
  { cabecalho: 'Cliente', valor: (l) => l.aluguer.cliente_nome },
  { cabecalho: 'Mercado', valor: (l) => (l.aluguer.nacional ? 'Nacional' : 'Internacional') },
  { cabecalho: 'Serial Number', valor: (l) => l.aluguer.serial_number },
  { cabecalho: 'Marca', valor: (l) => l.aluguer.marca },
  { cabecalho: 'Modelo', valor: (l) => l.aluguer.modelo },
  { cabecalho: 'Entrega', valor: (l) => formatarData(l.aluguer.data_entrega) },
  { cabecalho: 'Valor', valor: (l) => formatarEuro(l.aluguer.valor || 0) },
  { cabecalho: 'Valor a Faturar', valor: (l) => valorAFaturarTexto(l.fat) },
  { cabecalho: 'Fatura', valor: (l) => l.fat.fatura_nome ?? '—' },
  { cabecalho: 'Validado', valor: (l) => (l.fat.validado ? 'Sim' : 'Não') },
  { cabecalho: 'Pago', valor: (l) => (l.fat.pago ? 'Pago' : 'Não pago') },
]

// Opções de ordenação da lista
type Ordenacao = 'cliente-asc' | 'cliente-desc' | 'valor-desc' | 'valor-asc' | 'data-desc' | 'data-asc'

export default function ListaAlugueres() {
  const { isAdmin } = useAuth()
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [faturacao, setFaturacao] = useState<Map<string, Fat>>(new Map())
  const [mes, setMes] = useState(mesAtual())
  const [pesquisa, setPesquisa] = useState('')
  const [ordenar, setOrdenar] = useState<Ordenacao>('cliente-asc')
  const [carregando, setCarregando] = useState(true)
  const [editar, setEditar] = useState<Aluguer | null>(null)
  const [enviarFatura, setEnviarFatura] = useState<{ aluguer: Aluguer; mes: string; fat: Fat } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('alugueres').select('*').order('data_entrega', { ascending: false }),
      supabase.from('alugueres_faturacao_mensal').select('*'),
    ]).then(([ra, rf]) => {
      setAlugueres((ra.data as Aluguer[]) ?? [])
      const m = new Map<string, Fat>()
      for (const f of (rf.data as Fat[]) ?? []) m.set(`${f.aluguer_id}|${f.mes}`, f)
      setFaturacao(m)
      setCarregando(false)
    })
  }, [])

  // Cada aluguer conta no mês da sua DATA DE ENTREGA (independente da recolha)
  const linhas = useMemo<LinhaMes[]>(() => {
    const q = pesquisa.trim().toLowerCase()
    const lista = alugueres
      .filter((a) => (a.data_entrega ?? '').slice(0, 7) === mes)
      .filter((a) => !q || (a.cliente_nome ?? '').toLowerCase().includes(q))
      .map((a) => ({ aluguer: a, fat: faturacao.get(`${a.id}|${mes}`) ?? fatVazia(a.id, mes) }))

    return lista.sort((x, y) => {
      const a = x.aluguer, b = y.aluguer
      switch (ordenar) {
        case 'cliente-asc': return (a.cliente_nome ?? '').localeCompare(b.cliente_nome ?? '', 'pt')
        case 'cliente-desc': return (b.cliente_nome ?? '').localeCompare(a.cliente_nome ?? '', 'pt')
        case 'valor-desc': return (b.valor ?? 0) - (a.valor ?? 0)
        case 'valor-asc': return (a.valor ?? 0) - (b.valor ?? 0)
        case 'data-desc': return (b.data_entrega ?? '').localeCompare(a.data_entrega ?? '')
        case 'data-asc': return (a.data_entrega ?? '').localeCompare(b.data_entrega ?? '')
        default: return 0
      }
    })
  }, [alugueres, faturacao, mes, pesquisa, ordenar])

  const total = somar(linhas, (l) => l.aluguer.valor)

  // Resumo de faturação do mês mostrado
  const totalFaturar = somar(linhas, (l) => (l.fat.nao_faturar ? 0 : l.fat.valor_a_faturar))
  const numNaoFaturar = linhas.filter((l) => l.fat.nao_faturar).length
  const numPorDefinir = linhas.filter((l) => l.fat.valor_a_faturar == null && !l.fat.nao_faturar).length

  // Atualiza a faturação de um aluguer num mês (otimista + persistência imediata).
  // Cria a linha do mês se ainda não existir.
  async function atualizarFaturacao(aluguerId: string, mesX: string, patch: Partial<Fat>) {
    const chave = `${aluguerId}|${mesX}`
    const atual = faturacao.get(chave) ?? fatVazia(aluguerId, mesX)
    setFaturacao((prev) => new Map(prev).set(chave, { ...atual, ...patch }))

    if (atual.id) {
      const { data, error } = await supabase
        .from('alugueres_faturacao_mensal')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', atual.id)
        .select()
        .single()
      if (error) return alert('Erro a guardar: ' + error.message)
      setFaturacao((prev) => new Map(prev).set(chave, data as Fat))
    } else {
      const { data, error } = await supabase
        .from('alugueres_faturacao_mensal')
        .insert({ aluguer_id: aluguerId, mes: mesX, ...patch })
        .select()
        .single()
      if (error) return alert('Erro a guardar: ' + error.message)
      setFaturacao((prev) => new Map(prev).set(chave, data as Fat))
    }
  }

  // Após enviar a fatura com sucesso: marca como enviada e guarda o email no cliente
  async function aoEnviadaFatura(aluguer: Aluguer, mesX: string, email: string) {
    await atualizarFaturacao(aluguer.id, mesX, {
      fatura_enviada_em: new Date().toISOString(),
      fatura_enviada_para: email,
    })
    if (aluguer.cliente_id) {
      await supabase.from('clientes').update({ email }).eq('id', aluguer.cliente_id)
    }
    setEnviarFatura(null)
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
        <select
          value={ordenar}
          onChange={(e) => setOrdenar(e.target.value as Ordenacao)}
          style={c.inputOrden}
          title="Ordenar a lista"
        >
          <option value="cliente-asc">Cliente (A → Z)</option>
          <option value="cliente-desc">Cliente (Z → A)</option>
          <option value="valor-desc">Valor (maior → menor)</option>
          <option value="valor-asc">Valor (menor → maior)</option>
          <option value="data-desc">Data (mais recente)</option>
          <option value="data-asc">Data (mais antiga)</option>
        </select>
        <BotaoExportar nome="alugueres" colunas={colunasExport} linhas={linhas} />
      </div>

      <div style={c.resumo}>
        <span style={{ textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
        <span>{linhas.length} aluguer(es) · <strong>{formatarEuro(total)}</strong></span>
      </div>

      <div style={c.resumoFaturar}>
        <div style={c.resumoFaturarTopo}>
          <span style={c.resumoFaturarLabel}>Total a faturar este mês</span>
          <span style={c.resumoFaturarValor}>{formatarEuro(totalFaturar)}</span>
        </div>
        <div style={c.resumoFaturarLinha}>
          <span>Nº de alugueres: <strong>{linhas.length}</strong></span>
          <span>Não faturar: <strong>{numNaoFaturar}</strong></span>
          <span>Por definir: <strong>{numPorDefinir}</strong></span>
        </div>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : linhas.length === 0 ? (
        <p style={c.estado}>Sem alugueres neste mês.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span style={{ textAlign: 'center' }} title="Validado">✓</span>
            <span>Cliente</span>
            <span>Equipamento</span>
            <span>Entrega</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span>Valor a Faturar</span>
            <span>Fatura</span>
            <span style={{ textAlign: 'center' }}>Pago</span>
          </div>
          {linhas.map((l) => {
            const a = l.aluguer
            return (
              <div
                key={`${a.id}|${mes}`}
                style={{ ...c.linha, ...(isAdmin ? c.linhaClicavel : {}) }}
                onClick={isAdmin ? () => setEditar(a) : undefined}
                title={isAdmin ? 'Clica para editar ou apagar' : undefined}
              >
                <span style={{ ...c.celula, justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <VistoValidado fat={l.fat} podeEditar={isAdmin} onChange={(patch) => atualizarFaturacao(a.id, mes, patch)} />
                </span>
                <span style={{ fontWeight: 600 }}>
                  {a.cliente_nome ?? '—'}
                  {!a.nacional && <span style={c.intl}>Internacional</span>}
                </span>
                <span style={c.equip}>
                  <span style={c.equipSn}>{a.serial_number ?? '—'}</span>
                  <span style={c.equipMarca}>{[a.marca, a.modelo].filter(Boolean).join(' ') || '—'}</span>
                </span>
                <span>{formatarData(a.data_entrega)}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(a.valor || 0)}</span>
                <span style={c.celula} onClick={(e) => e.stopPropagation()}>
                  <CelulaFaturar valorTotal={a.valor ?? 0} fat={l.fat} podeEditar={isAdmin} onChange={(patch) => atualizarFaturacao(a.id, mes, patch)} />
                </span>
                <span style={c.celula} onClick={(e) => e.stopPropagation()}>
                  <CelulaFatura
                    aluguerId={a.id}
                    mes={mes}
                    fat={l.fat}
                    podeEditar={isAdmin}
                    onChange={(patch) => atualizarFaturacao(a.id, mes, patch)}
                    onEnviar={() => setEnviarFatura({ aluguer: a, mes, fat: l.fat })}
                  />
                </span>
                <span style={{ ...c.celula, justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <EstadoPago fat={l.fat} podeEditar={isAdmin} onChange={(patch) => atualizarFaturacao(a.id, mes, patch)} />
                </span>
              </div>
            )
          })}
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

      {enviarFatura && (
        <ModalEnviarFatura
          aluguer={enviarFatura.aluguer}
          mes={enviarFatura.mes}
          fat={enviarFatura.fat}
          onFechar={() => setEnviarFatura(null)}
          onEnviada={aoEnviadaFatura}
        />
      )}
    </main>
  )
}

// ------------------------------------------------------ CÉLULA: VALOR A FATURAR
function CelulaFaturar({
  valorTotal, fat, podeEditar, onChange,
}: {
  valorTotal: number
  fat: Fat
  podeEditar: boolean
  onChange: (patch: Partial<Fat>) => void
}) {
  const definido = fat.valor_a_faturar != null
  const naoFaturar = !!fat.nao_faturar

  // Modo atual a partir dos dados guardados
  let modo: '' | 'total' | '50' | 'outro' | 'nao' = ''
  if (naoFaturar) modo = 'nao'
  else if (definido) {
    if (fat.valor_a_faturar === valorTotal) modo = 'total'
    else if (fat.valor_a_faturar === 50) modo = '50'
    else modo = 'outro'
  }

  const [editarOutro, setEditarOutro] = useState(false)
  const [manual, setManual] = useState(definido ? String(fat.valor_a_faturar) : '')

  const mostrarInput = modo === 'outro' || editarOutro

  // Viewers só veem o resultado, sem controlos
  if (!podeEditar) {
    if (naoFaturar) return <span style={c.badgeCinza}>Não faturar</span>
    if (definido) return <span style={c.valorVerde}>{formatarEuro(fat.valor_a_faturar!)}</span>
    return <span style={c.semDef}>—</span>
  }

  function aplicar(patch: Partial<Fat>) {
    onChange(patch)
    setEditarOutro(false)
  }

  function aoMudar(v: string) {
    if (v === 'outro') {
      setManual(definido ? String(fat.valor_a_faturar) : '')
      setEditarOutro(true)
      return
    }
    if (v === 'total') return aplicar({ valor_a_faturar: valorTotal, nao_faturar: false })
    if (v === '50') return aplicar({ valor_a_faturar: 50, nao_faturar: false })
    if (v === 'nao') return aplicar({ valor_a_faturar: null, nao_faturar: true })
    aplicar({ valor_a_faturar: null, nao_faturar: false }) // "— definir —"
  }

  function guardarManual() {
    const v = parseNumeroPt(manual)
    if (v === null) { setEditarOutro(false); return }
    aplicar({ valor_a_faturar: v, nao_faturar: false })
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
  aluguerId, mes, fat, podeEditar, onChange, onEnviar,
}: {
  aluguerId: string
  mes: string
  fat: Fat
  podeEditar: boolean
  onChange: (patch: Partial<Fat>) => void
  onEnviar: () => void
}) {
  const [aCarregar, setACarregar] = useState(false)
  const temFatura = !!fat.fatura_url

  async function carregar(file: File) {
    setACarregar(true)
    const caminho = `${aluguerId}/${mes}/${Date.now()}-${nomeSeguro(file.name)}`
    const { error: erroUp } = await supabase.storage.from(BUCKET_FATURAS).upload(caminho, file)
    if (erroUp) {
      setACarregar(false)
      alert('Erro a carregar a fatura: ' + erroUp.message)
      return
    }
    const { data: pub } = supabase.storage.from(BUCKET_FATURAS).getPublicUrl(caminho)
    onChange({ fatura_url: pub.publicUrl, fatura_caminho: caminho, fatura_nome: file.name })
    setACarregar(false)
  }

  async function remover() {
    if (!window.confirm(`Remover a fatura “${fat.fatura_nome ?? ''}”?`)) return
    if (fat.fatura_caminho) await supabase.storage.from(BUCKET_FATURAS).remove([fat.fatura_caminho])
    onChange({ fatura_url: null, fatura_caminho: null, fatura_nome: null })
  }

  if (temFatura) {
    const enviada = !!fat.fatura_enviada_em
    return (
      <span style={c.faturaLinha}>
        <a href={fat.fatura_url!} target="_blank" rel="noopener noreferrer" style={c.faturaLink}>
          📄 {fat.fatura_nome ?? 'fatura'}
        </a>
        {podeEditar && (
          <button
            style={enviada ? c.btnEnviada : c.btnEnviar}
            onClick={onEnviar}
            title={
              enviada
                ? `Enviada em ${formatarData(fat.fatura_enviada_em)}${fat.fatura_enviada_para ? ' para ' + fat.fatura_enviada_para : ''} — clica para reenviar`
                : 'Enviar fatura ao cliente por email'
            }
          >
            {enviada ? '✓ Enviada' : '✉️ Enviar'}
          </button>
        )}
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

// ------------------------------------------------------------- CÉLULA: VISTO
function VistoValidado({
  fat, podeEditar, onChange,
}: {
  fat: Fat
  podeEditar: boolean
  onChange: (patch: Partial<Fat>) => void
}) {
  const validado = !!fat.validado
  // Viewers só veem o estado (sem clicar)
  if (!podeEditar) {
    return <span style={validado ? c.vistoVerde : c.vistoCinza} title={validado ? 'Validado' : 'Por validar'}>✓</span>
  }
  return (
    <button
      type="button"
      style={validado ? c.vistoVerde : c.vistoCinza}
      onClick={() => onChange({ validado: !validado })}
      title={validado ? 'Validado — clica para desmarcar' : 'Marcar como validado'}
    >
      ✓
    </button>
  )
}

// -------------------------------------------------------------- CÉLULA: PAGO
function EstadoPago({
  fat, podeEditar, onChange,
}: {
  fat: Fat
  podeEditar: boolean
  onChange: (patch: Partial<Fat>) => void
}) {
  const pago = !!fat.pago
  // Viewers só veem o estado (sem clicar)
  if (!podeEditar) {
    return <span style={pago ? c.pagoVerde : c.pagoVermelho}>{pago ? 'Pago' : 'Não pago'}</span>
  }
  return (
    <button
      type="button"
      style={pago ? c.pagoVerde : c.pagoVermelho}
      onClick={() => onChange({ pago: !pago })}
      title={pago ? 'Pago — clica para marcar como não pago' : 'Não pago — clica para marcar como pago'}
    >
      {pago ? 'Pago' : 'Não pago'}
    </button>
  )
}

// ------------------------------------------------------ ENVIAR FATURA (EMAIL)
function ModalEnviarFatura({
  aluguer, mes, fat, onFechar, onEnviada,
}: {
  aluguer: Aluguer
  mes: string
  fat: Fat
  onFechar: () => void
  onEnviada: (aluguer: Aluguer, mes: string, email: string) => void
}) {
  const [email, setEmail] = useState(fat.fatura_enviada_para ?? '')
  const [aCarregar, setACarregar] = useState(true)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Pré-preencher com o email guardado no cliente (se houver)
  useEffect(() => {
    let ativo = true
    async function buscar() {
      if (aluguer.cliente_id && !fat.fatura_enviada_para) {
        const { data } = await supabase
          .from('clientes')
          .select('email')
          .eq('id', aluguer.cliente_id)
          .single()
        if (ativo && data?.email) setEmail(data.email as string)
      }
      if (ativo) setACarregar(false)
    }
    buscar()
    return () => { ativo = false }
  }, [aluguer.cliente_id, fat.fatura_enviada_para])

  async function enviar() {
    setErro(null)
    const para = email.trim()
    if (!para.includes('@')) return setErro('Indica um email válido.')

    setAEnviar(true)
    try {
      const r = await fetch('/api/alugueres/enviar-fatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para,
          clienteNome: aluguer.cliente_nome ?? 'cliente',
          faturaUrl: fat.fatura_url,
          faturaNome: fat.fatura_nome ?? 'fatura',
        }),
      })
      const dados = await r.json().catch(() => ({}))
      setAEnviar(false)
      if (!r.ok || !dados.enviado) {
        return setErro(dados.motivo ?? 'Não foi possível enviar a fatura.')
      }
      onEnviada(aluguer, mes, para)
    } catch {
      setAEnviar(false)
      setErro('Erro de rede ao enviar.')
    }
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>Enviar fatura por email</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>

        {erro && <div style={c.erro}>{erro}</div>}

        <p style={c.envInfo}>
          <strong>Cliente:</strong> {aluguer.cliente_nome ?? '—'}<br />
          <strong>Mês:</strong> {nomeMes(mes)}<br />
          <strong>Ficheiro:</strong> {fat.fatura_nome ?? 'fatura'} (em anexo)
        </p>

        <label style={c.label}>Email do cliente</label>
        <input
          style={c.input}
          type="email"
          inputMode="email"
          placeholder={aCarregar ? 'A carregar...' : 'cliente@exemplo.com'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <span style={c.envNota}>O email fica guardado no cliente para a próxima vez.</span>

        {fat.fatura_enviada_em && (
          <span style={c.envNota}>
            Já enviada em {formatarData(fat.fatura_enviada_em)}
            {fat.fatura_enviada_para ? ` para ${fat.fatura_enviada_para}` : ''}.
          </span>
        )}

        <div style={c.modalAcoes}>
          <button onClick={onFechar} style={c.btnGhost}>Cancelar</button>
          <button onClick={enviar} disabled={aEnviar} style={c.btnPrimario}>
            {aEnviar ? 'A enviar...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
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
    const valorNum = valor.trim() ? parseNumeroPt(valor) : null
    if (valor.trim() && valorNum === null) return setErro('O valor não é válido.')

    setAGuardar(true)
    const patch = {
      cliente_nome: clienteNome.trim(),
      serial_number: serial.trim(),
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      ano: ano.trim() || null,
      nacional,
      tipo_aluguer: tipo || null,
      valor: valorNum,
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
            <label style={c.label}>Valor mensal (€)</label>
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
  inputOrden: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, background: '#fff', cursor: 'pointer' },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8 },

  // Resumo de faturação do mês
  resumoFaturar: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  resumoFaturarTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  resumoFaturarLabel: { fontSize: 14, fontWeight: 600, color: 'var(--muted)' },
  resumoFaturarValor: { fontSize: 22, fontWeight: 800, color: '#1b873f' },
  resumoFaturarLinha: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' },

  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.5fr 1.3fr 1.4fr 0.9fr 0.75fr 1.25fr 2fr 0.9fr', gap: 10, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 920 },
  linhaClicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  intl: { marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent, #3552eb)', borderRadius: 999, padding: '1px 6px' },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 10, textAlign: 'center' },

  // Célula "Equipamento" (SN + marca/modelo)
  equip: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  equipSn: { fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  equipMarca: { color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  // Célula "Visto" (validado)
  vistoVerde: { width: 26, height: 26, borderRadius: 999, border: 'none', background: '#1b873f', color: '#fff', fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  vistoCinza: { width: 26, height: 26, borderRadius: 999, border: '1px solid #ccc', background: '#fff', color: '#bbb', fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Célula "Pago" (verde = pago, vermelho = por pagar)
  pagoVerde: { border: '1px solid #1b873f', background: '#e8f5ec', color: '#1b873f', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1 },
  pagoVermelho: { border: '1px solid #c62828', background: '#ffebee', color: '#c62828', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1 },

  // Célula "Valor a Faturar"
  celula: { display: 'flex', alignItems: 'center', minWidth: 0 },
  faturarLinha: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' },
  selectFaturar: { padding: '5px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, background: '#fff', color: 'var(--muted)', cursor: 'pointer', maxWidth: '100%', minWidth: 0 },
  selectVerde: { padding: '5px 8px', border: '1px solid #1b873f', borderRadius: 6, fontSize: 13, background: '#fff', color: '#1b873f', fontWeight: 700, cursor: 'pointer', maxWidth: '100%', minWidth: 0 },
  selectCinza: { padding: '5px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, background: '#f3f3f3', color: 'var(--muted)', fontWeight: 600, cursor: 'pointer', maxWidth: '100%', minWidth: 0 },
  inputManual: { width: 72, padding: '5px 6px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 },
  valorVerde: { color: '#1b873f', fontWeight: 700, fontSize: 14 },
  badgeCinza: { background: '#eee', color: 'var(--muted)', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 },
  semDef: { color: 'var(--muted)' },

  // Célula "Fatura"
  faturaLinha: { display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' },
  faturaLink: { fontSize: 13, color: 'var(--foreground)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 },
  chipApagar: { width: 20, height: 20, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.12)', color: 'var(--danger, #c62828)', fontSize: 14, lineHeight: 1, cursor: 'pointer', flexShrink: 0 },
  btnAnexar: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnEnviar: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  btnEnviada: { background: '#e8f5ec', color: '#1b873f', border: '1px solid #1b873f', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  envInfo: { fontSize: 14, color: 'var(--foreground)', marginTop: 8, lineHeight: 1.6 },
  envNota: { fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'block' },

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
