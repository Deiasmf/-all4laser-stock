'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import { formatarEuro, nomeMes, parseNumeroPt } from '@/lib/alugueres'
import type { Aluguer } from '@/types/aluguer'

const BUCKET_FATURAS = 'faturas-alugueres'

// Faturação de um mês (tabela alugueres_faturacao_mensal). Espelha a Lista.
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

function fatVazia(aluguerId: string, mes: string): Fat {
  return {
    id: null, aluguer_id: aluguerId, mes, valor_a_faturar: null,
    nao_faturar: false, validado: false, pago: false, fatura_url: null, fatura_caminho: null,
    fatura_nome: null, fatura_enviada_em: null, fatura_enviada_para: null,
  }
}

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAte(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const alvo = new Date(y, m - 1, d).getTime()
  const h = new Date()
  const hoje = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime()
  return Math.round((alvo - hoje) / 86400000)
}

// Soma k meses a uma data 'YYYY-MM-DD' (mantém o dia; ajusta se o mês for curto)
function adicionarMeses(iso: string, k: number): string {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  dt.setMonth(dt.getMonth() + k)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// ─── Contrato = conjunto de registos mensais do mesmo aluguer ────────────────
// Os contratos de vários meses são guardados como N registos (1 por mês), todos
// criados na mesma instrução (mesmo created_at) com o mesmo serial. Agrupamos
// por (cliente, serial, created_at) para reconstruir o contrato.
type Contrato = {
  chave: string
  cliente_id: string | null
  cliente_nome: string | null
  serial_number: string | null
  marca: string | null
  modelo: string | null
  meses: Aluguer[]        // ordenados por data_entrega asc
  inicio: string | null   // primeiro mês
  fim: string | null      // último mês (data_entrega)
  nMeses: number
  valorMes: number
  marcadoVenda: boolean    // sinalizado para avançar para venda
}

type EstadoContrato = { chave: 'ativo' | 'a_expirar' | 'expirado' | 'terminado'; label: string; cor: string; bg: string }

function estadoContrato(ct: Contrato): EstadoContrato {
  const hoje = hojeISO()
  const ultimo = ct.meses[ct.meses.length - 1]
  // Terminado: o último mês já foi recolhido.
  if (ultimo?.data_recolha && ultimo.data_recolha.slice(0, 10) <= hoje) {
    return { chave: 'terminado', label: 'Terminado', cor: '#374151', bg: '#E5E7EB' }
  }
  const fim = ct.fim
  if (!fim) return { chave: 'ativo', label: 'Ativo', cor: '#065F46', bg: '#D1FAE5' }
  if (fim < hoje) return { chave: 'expirado', label: 'Expirado', cor: '#991B1B', bg: '#FEE2E2' }
  if (diasAte(fim) <= 90) return { chave: 'a_expirar', label: 'A expirar', cor: '#92400E', bg: '#FEF3C7' }
  return { chave: 'ativo', label: 'Ativo', cor: '#065F46', bg: '#D1FAE5' }
}

type Ordenacao = 'fim-asc' | 'inicio-desc' | 'cliente-asc' | 'valor-desc'

const colunasExport: ColunaExport<Contrato>[] = [
  { cabecalho: 'Cliente', valor: (ct) => ct.cliente_nome ?? '' },
  { cabecalho: 'Serial Number', valor: (ct) => ct.serial_number ?? '' },
  { cabecalho: 'Equipamento', valor: (ct) => [ct.marca, ct.modelo].filter(Boolean).join(' ') },
  { cabecalho: 'Início', valor: (ct) => formatarData(ct.inicio) },
  { cabecalho: 'Meses', valor: (ct) => String(ct.nMeses) },
  { cabecalho: 'Fim', valor: (ct) => formatarData(ct.fim) },
  { cabecalho: 'Valor mensal', valor: (ct) => formatarEuro(ct.valorMes) },
  { cabecalho: 'Estado', valor: (ct) => estadoContrato(ct).label },
]

export default function AlugueresInternacional() {
  const { isAdmin, perfil } = useAuth()
  const podeFaturar = !!perfil
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [faturacao, setFaturacao] = useState<Map<string, Fat>>(new Map())
  const [pesquisa, setPesquisa] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [ordenar, setOrdenar] = useState<Ordenacao>('fim-asc')
  const [carregando, setCarregando] = useState(true)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [finalizarCt, setFinalizarCt] = useState<Contrato | null>(null)
  const [renovarCt, setRenovarCt] = useState<Contrato | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('alugueres').select('*').eq('nacional', false)
      .order('data_entrega', { ascending: true })
    const lista = (data as Aluguer[]) ?? []
    setAlugueres(lista)
    const ids = lista.map((a) => a.id)
    if (ids.length) {
      const { data: fats } = await supabase
        .from('alugueres_faturacao_mensal').select('*').in('aluguer_id', ids)
      const m = new Map<string, Fat>()
      for (const f of (fats as Fat[]) ?? []) m.set(`${f.aluguer_id}|${f.mes}`, f)
      setFaturacao(m)
    } else {
      setFaturacao(new Map())
    }
    setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  // Reconstrói os contratos a partir dos registos mensais.
  const contratos = useMemo<Contrato[]>(() => {
    const m = new Map<string, Aluguer[]>()
    for (const a of alugueres) {
      const k = `${a.cliente_id ?? a.cliente_nome ?? ''}|${a.serial_number ?? ''}|${a.created_at}`
      const arr = m.get(k)
      if (arr) arr.push(a)
      else m.set(k, [a])
    }
    return [...m.entries()].map(([chave, meses]) => {
      const ord = [...meses].sort((x, y) => (x.data_entrega ?? '').localeCompare(y.data_entrega ?? ''))
      const primeiro = ord[0]
      const ultimo = ord[ord.length - 1]
      return {
        chave,
        cliente_id: primeiro.cliente_id,
        cliente_nome: primeiro.cliente_nome,
        serial_number: primeiro.serial_number,
        marca: primeiro.marca,
        modelo: primeiro.modelo,
        meses: ord,
        inicio: primeiro.data_entrega ? primeiro.data_entrega.slice(0, 10) : null,
        fim: ultimo.data_entrega ? ultimo.data_entrega.slice(0, 10) : null,
        nMeses: ord.length,
        valorMes: primeiro.valor ?? 0,
        marcadoVenda: ord.some((a) => !!a.marcado_venda_em),
      }
    })
  }, [alugueres])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    const lista = contratos
      .filter((ct) => !fEstado || estadoContrato(ct).chave === fEstado)
      .filter((ct) =>
        !q ||
        (ct.cliente_nome ?? '').toLowerCase().includes(q) ||
        (ct.serial_number ?? '').toLowerCase().includes(q) ||
        (ct.modelo ?? '').toLowerCase().includes(q) ||
        (ct.marca ?? '').toLowerCase().includes(q)
      )
    return [...lista].sort((a, b) => {
      switch (ordenar) {
        case 'fim-asc': return (a.fim ?? '9999').localeCompare(b.fim ?? '9999')
        case 'inicio-desc': return (b.inicio ?? '').localeCompare(a.inicio ?? '')
        case 'cliente-asc': return (a.cliente_nome ?? '').localeCompare(b.cliente_nome ?? '', 'pt')
        case 'valor-desc': return b.valorMes - a.valorMes
        default: return 0
      }
    })
  }, [contratos, pesquisa, fEstado, ordenar])

  const emVigor = filtrados.filter((ct) => estadoContrato(ct).chave !== 'terminado')
  const mensalTotal = emVigor.reduce((acc, ct) => acc + ct.valorMes, 0)

  // Nº de meses pagos / por pagar de um contrato (ignora "não faturar").
  function contagemPagos(ct: Contrato) {
    let pagos = 0, porPagar = 0
    for (const a of ct.meses) {
      const mes = (a.data_entrega ?? '').slice(0, 7)
      const f = faturacao.get(`${a.id}|${mes}`)
      if (f?.nao_faturar) continue
      if (f?.pago) pagos++
      else porPagar++
    }
    return { pagos, porPagar }
  }

  function toggle(chave: string) {
    setAbertos((prev) => {
      const n = new Set(prev)
      if (n.has(chave)) n.delete(chave); else n.add(chave)
      return n
    })
  }

  // Upsert da faturação de um mês (otimista + persistência imediata).
  async function atualizarFaturacao(aluguerId: string, mes: string, patch: Partial<Fat>) {
    const chave = `${aluguerId}|${mes}`
    const atual = faturacao.get(chave) ?? fatVazia(aluguerId, mes)
    setFaturacao((prev) => new Map(prev).set(chave, { ...atual, ...patch }))
    if (atual.id) {
      const { data, error } = await supabase
        .from('alugueres_faturacao_mensal')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', atual.id).select().single()
      if (error) return alert('Erro a guardar: ' + error.message)
      setFaturacao((prev) => new Map(prev).set(chave, data as Fat))
    } else {
      const { data, error } = await supabase
        .from('alugueres_faturacao_mensal')
        .insert({ aluguer_id: aluguerId, mes, ...patch }).select().single()
      if (error) return alert('Erro a guardar: ' + error.message)
      setFaturacao((prev) => new Map(prev).set(chave, data as Fat))
    }
  }

  // Avançar para venda: só sinaliza o contrato e notifica por email (não mexe no
  // inventário).
  async function avancarVenda(ct: Contrato) {
    if (!window.confirm(`Sinalizar o contrato de ${ct.cliente_nome ?? 'cliente'} (${ct.serial_number ?? '—'}) para avançar para venda? Será enviado um aviso por email.`)) return
    const ids = ct.meses.map((a) => a.id)
    const { error } = await supabase
      .from('alugueres')
      .update({ marcado_venda_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) { alert('Erro a sinalizar: ' + error.message); return }
    try {
      await fetch('/api/alugueres/avancar-venda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNome: ct.cliente_nome ?? '—',
          equipamento: [ct.marca, ct.modelo].filter(Boolean).join(' ') || '—',
          serial: ct.serial_number ?? '—',
          fim: formatarData(ct.fim),
          porNome: perfil?.nome ?? '',
        }),
      })
    } catch { /* o aviso por email é best-effort; a sinalização já ficou guardada */ }
    await carregar()
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Alugueres · Internacional</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isAdmin && <Link href="/alugueres" style={c.btnAdd}>+ Adicionar</Link>}
          <Link href="/" style={c.voltar}>← Stock</Link>
        </div>
      </div>
      <AlugueresNav />

      <div style={c.filtros}>
        <input
          placeholder="Procurar cliente, SN, modelo..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.inputPesq}
        />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.inputSel} title="Filtrar por estado">
          <option value="">Todos os estados</option>
          <option value="ativo">Ativo</option>
          <option value="a_expirar">A expirar (≤90 dias)</option>
          <option value="expirado">Expirado</option>
          <option value="terminado">Terminado</option>
        </select>
        <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as Ordenacao)} style={c.inputSel} title="Ordenar">
          <option value="fim-asc">Fim (mais próximo)</option>
          <option value="inicio-desc">Início (mais recente)</option>
          <option value="cliente-asc">Cliente (A → Z)</option>
          <option value="valor-desc">Valor (maior → menor)</option>
        </select>
        <BotaoExportar nome="alugueres-internacional" colunas={colunasExport} linhas={filtrados} />
      </div>

      <div style={c.resumo}>
        <span>{filtrados.length} contrato(s) · <strong>{emVigor.length}</strong> em vigor</span>
        <span>Valor mensal (em vigor): <strong>{formatarEuro(mensalTotal)}</strong></span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <div style={c.vazio}>
          <p style={{ margin: 0, fontWeight: 600 }}>Sem alugueres internacionais.</p>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Os alugueres de clientes fora de Portugal aparecem aqui automaticamente.
            Regista um novo em <Link href="/alugueres" style={c.link}>Registar</Link>.
          </p>
        </div>
      ) : (
        <div style={c.lista}>
          {filtrados.map((ct) => {
            const est = estadoContrato(ct)
            const aberto = abertos.has(ct.chave)
            const { pagos, porPagar } = contagemPagos(ct)
            return (
              <div key={ct.chave} style={c.contrato}>
                <button style={c.contratoCab} onClick={() => toggle(ct.chave)}>
                  <span style={c.chevron}>{aberto ? '▼' : '▸'}</span>
                  <span style={c.contratoCliente}>{ct.cliente_nome ?? '—'}</span>
                  <span style={c.contratoEquip}>{[ct.marca, ct.modelo].filter(Boolean).join(' ') || '—'} · {ct.serial_number ?? '—'}</span>
                  <span style={c.contratoMeta}>{formatarData(ct.inicio)} → {formatarData(ct.fim)} · {ct.nMeses} mês(es)</span>
                  <span style={c.contratoValor}>{formatarEuro(ct.valorMes)}/mês</span>
                  {porPagar > 0
                    ? <span style={c.chipPorPagar}>🔴 {porPagar} por pagar</span>
                    : <span style={c.chipPago}>✓ {pagos} pagos</span>}
                  {ct.marcadoVenda && <span style={c.badgeVenda}>🏷️ Venda</span>}
                  <span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>
                </button>

                {aberto && (
                  <div style={c.mesesTabela}>
                    <div style={{ ...c.mesLinha, ...c.mesCab }}>
                      <span>Mês</span>
                      <span>Valor a faturar</span>
                      <span>Fatura</span>
                      <span style={{ textAlign: 'center' }}>Pago</span>
                    </div>
                    {ct.meses.map((a) => {
                      const mes = (a.data_entrega ?? '').slice(0, 7)
                      const fat = faturacao.get(`${a.id}|${mes}`) ?? fatVazia(a.id, mes)
                      return (
                        <div key={a.id} style={c.mesLinha}>
                          <span style={{ textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
                          <span style={c.celula}>
                            <CelulaFaturar valorTotal={a.valor ?? 0} fat={fat} podeEditar={podeFaturar} onChange={(p) => atualizarFaturacao(a.id, mes, p)} />
                          </span>
                          <span style={c.celula}>
                            <CelulaFatura aluguerId={a.id} mes={mes} fat={fat} podeEditar={podeFaturar} onChange={(p) => atualizarFaturacao(a.id, mes, p)} />
                          </span>
                          <span style={{ ...c.celula, justifyContent: 'center' }}>
                            <EstadoPago fat={fat} podeEditar={podeFaturar} onChange={(p) => atualizarFaturacao(a.id, mes, p)} />
                          </span>
                        </div>
                      )
                    })}

                    {podeFaturar && (
                      <div style={c.acoesContrato}>
                        <span style={c.acoesLabel}>Fim de contrato:</span>
                        {est.chave !== 'terminado' ? (
                          <>
                            <button style={c.btnFinalizar} onClick={() => setFinalizarCt(ct)}>✓ Finalizar contrato</button>
                            <button style={c.btnRenovar} onClick={() => setRenovarCt(ct)}>🔄 Renovar</button>
                            <button style={c.btnVenda} onClick={() => avancarVenda(ct)} disabled={ct.marcadoVenda}>
                              {ct.marcadoVenda ? '🏷️ Sinalizado p/ venda' : '🏷️ Avançar para venda'}
                            </button>
                          </>
                        ) : (
                          <span style={c.semDef}>Contrato terminado{ct.marcadoVenda ? ' · sinalizado para venda' : ''}.</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {finalizarCt && (
        <ModalFinalizar contrato={finalizarCt} onFechar={() => setFinalizarCt(null)} onFeito={async () => { setFinalizarCt(null); await carregar() }} />
      )}
      {renovarCt && (
        <ModalRenovar
          contrato={renovarCt}
          autor={{ id: perfil?.id ?? null, nome: perfil?.nome ?? null }}
          onFechar={() => setRenovarCt(null)}
          onFeito={async () => { setRenovarCt(null); await carregar() }}
        />
      )}

      <p style={c.dica}>Para registar um contrato internacional usa o separador Registar; para editar os dados do aluguer, a Lista.</p>
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

  let modo: '' | 'total' | 'outro' | 'nao' = ''
  if (naoFaturar) modo = 'nao'
  else if (definido) modo = fat.valor_a_faturar === valorTotal ? 'total' : 'outro'

  const [editarOutro, setEditarOutro] = useState(false)
  const [manual, setManual] = useState(definido ? String(fat.valor_a_faturar) : '')
  const mostrarInput = modo === 'outro' || editarOutro

  if (!podeEditar) {
    if (naoFaturar) return <span style={c.badgeCinza}>Não faturar</span>
    if (definido) return <span style={c.valorVerde}>{formatarEuro(fat.valor_a_faturar!)}</span>
    return <span style={c.semDef}>—</span>
  }

  function aplicar(patch: Partial<Fat>) { onChange(patch); setEditarOutro(false) }

  function aoMudar(v: string) {
    if (v === 'outro') { setManual(definido ? String(fat.valor_a_faturar) : ''); setEditarOutro(true); return }
    if (v === 'total') return aplicar({ valor_a_faturar: valorTotal, nao_faturar: false })
    if (v === 'nao') return aplicar({ valor_a_faturar: null, nao_faturar: true })
    aplicar({ valor_a_faturar: null, nao_faturar: false })
  }

  function guardarManual() {
    const v = parseNumeroPt(manual)
    if (v === null) { setEditarOutro(false); return }
    aplicar({ valor_a_faturar: v, nao_faturar: false })
  }

  const estiloSelect = naoFaturar ? c.selectCinza : definido ? c.selectVerde : c.selectFaturar

  return (
    <span style={c.faturarLinha}>
      <select style={estiloSelect} value={mostrarInput ? 'outro' : modo} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">— definir —</option>
        <option value="total">Valor total ({formatarEuro(valorTotal)})</option>
        <option value="outro">Outro valor…</option>
        <option value="nao">Não faturar</option>
      </select>
      {mostrarInput && (
        <input
          style={c.inputManual} type="number" inputMode="decimal" placeholder="€" autoFocus
          value={manual} onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardarManual() }} onBlur={guardarManual}
        />
      )}
    </span>
  )
}

// ------------------------------------------------------------- CÉLULA: FATURA
function CelulaFatura({
  aluguerId, mes, fat, podeEditar, onChange,
}: {
  aluguerId: string
  mes: string
  fat: Fat
  podeEditar: boolean
  onChange: (patch: Partial<Fat>) => void
}) {
  const [aCarregar, setACarregar] = useState(false)
  const temFatura = !!fat.fatura_url

  async function carregar(file: File) {
    setACarregar(true)
    const caminho = `${aluguerId}/${mes}/${Date.now()}-${nomeSeguro(file.name)}`
    const { error: erroUp } = await supabase.storage.from(BUCKET_FATURAS).upload(caminho, file)
    if (erroUp) { setACarregar(false); alert('Erro a carregar a fatura: ' + erroUp.message); return }
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
    return (
      <span style={c.faturaLinha}>
        <a href={fat.fatura_url!} target="_blank" rel="noopener noreferrer" style={c.faturaLink}>
          📄 {fat.fatura_nome ?? 'fatura'}
        </a>
        {podeEditar && <button style={c.chipApagar} onClick={remover} title="Remover fatura">×</button>}
      </span>
    )
  }

  if (!podeEditar) return <span style={c.semDef}>—</span>

  return (
    <label style={c.btnAnexar}>
      {aCarregar ? '...' : '📎 Anexar'}
      <input
        type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = '' }}
      />
    </label>
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
  if (!podeEditar) return <span style={pago ? c.pagoVerde : c.pagoVermelho}>{pago ? 'Pago' : 'Não pago'}</span>
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

// -------------------------------------------------------- MODAL: FINALIZAR
function ModalFinalizar({
  contrato, onFechar, onFeito,
}: {
  contrato: Contrato
  onFechar: () => void
  onFeito: () => void | Promise<void>
}) {
  const ultimo = contrato.meses[contrato.meses.length - 1]
  const [data, setData] = useState(hojeISO())
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar() {
    setErro(null)
    setAGuardar(true)
    const { error } = await supabase.from('alugueres')
      .update({ data_recolha: data || hojeISO(), updated_at: new Date().toISOString() })
      .eq('id', ultimo.id)
    setAGuardar(false)
    if (error) return setErro('Erro ao finalizar: ' + error.message)
    await onFeito()
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>Finalizar contrato</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>
        {erro && <div style={c.erro}>{erro}</div>}
        <p style={c.envInfo}>
          <strong>Cliente:</strong> {contrato.cliente_nome ?? '—'}<br />
          <strong>Equipamento:</strong> {[contrato.marca, contrato.modelo].filter(Boolean).join(' ') || '—'} · {contrato.serial_number ?? '—'}
        </p>
        <label style={c.label}>Data de recolha do equipamento</label>
        <input style={c.input} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <span style={c.envNota}>O contrato passa a “Terminado” e o equipamento fica recolhido.</span>
        <div style={c.modalAcoes}>
          <button onClick={onFechar} style={c.btnGhost}>Cancelar</button>
          <button onClick={guardar} disabled={aGuardar} style={c.btnPrimario}>{aGuardar ? 'A guardar...' : 'Finalizar'}</button>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------- MODAL: RENOVAR
function ModalRenovar({
  contrato, autor, onFechar, onFeito,
}: {
  contrato: Contrato
  autor: { id: string | null; nome: string | null }
  onFechar: () => void
  onFeito: () => void | Promise<void>
}) {
  const ultimo = contrato.meses[contrato.meses.length - 1]
  const [nMeses, setNMeses] = useState('12')
  const [valor, setValor] = useState(contrato.valorMes ? String(contrato.valorMes) : '')
  const [trocar, setTrocar] = useState(false)
  const [serial, setSerial] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar() {
    setErro(null)
    const n = Math.max(1, Math.min(48, Math.round(Number(nMeses) || 0)))
    if (!n) return setErro('Indica o número de meses.')
    const valorNum = valor.trim() ? parseNumeroPt(valor) : null
    if (valor.trim() && valorNum === null) return setErro('O valor não é válido.')
    if (trocar && !serial.trim()) return setErro('Indica o serial do novo equipamento.')

    const base = (ultimo.data_entrega ?? hojeISO()).slice(0, 10)
    const equip = trocar
      ? { serial_number: serial.trim(), marca: marca.trim() || null, modelo: modelo.trim() || null, ano: null as string | null, equipamento_id: null as string | null }
      : { serial_number: contrato.serial_number, marca: contrato.marca, modelo: contrato.modelo, ano: ultimo.ano, equipamento_id: ultimo.equipamento_id }

    const linhas = Array.from({ length: n }, (_, k) => ({
      cliente_id: contrato.cliente_id,
      cliente_nome: contrato.cliente_nome,
      ...equip,
      tipo_aluguer: `${n} meses`,
      valor: valorNum,
      metodo_pagamento: null,
      nacional: false,
      data_entrega: adicionarMeses(base, k + 1),
      data_recolha: null,
      recolha_aplicavel: k === n - 1,
      criado_por: autor.id,
      criado_por_nome: autor.nome,
    }))

    setAGuardar(true)
    const { error } = await supabase.from('alugueres').insert(linhas)
    setAGuardar(false)
    if (error) return setErro('Erro a renovar: ' + error.message)
    await onFeito()
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>Renovar contrato</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>
        {erro && <div style={c.erro}>{erro}</div>}
        <p style={c.envInfo}>
          <strong>Cliente:</strong> {contrato.cliente_nome ?? '—'}<br />
          Continua a seguir a <strong>{formatarData(contrato.fim)}</strong>.
        </p>
        <div style={c.linha2}>
          <div>
            <label style={c.label}>Número de meses</label>
            <input style={c.input} type="number" min={1} value={nMeses} onChange={(e) => setNMeses(e.target.value)} />
          </div>
          <div>
            <label style={c.label}>Valor mensal (€)</label>
            <input style={c.input} type="number" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
        </div>

        <label style={c.checkLinha}>
          <input type="checkbox" checked={trocar} onChange={(e) => setTrocar(e.target.checked)} />
          Trocar de equipamento
        </label>

        {trocar ? (
          <>
            <label style={c.label}>Serial do novo equipamento</label>
            <input style={c.input} value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Serial number" />
            <div style={c.linha2}>
              <div>
                <label style={c.label}>Marca</label>
                <input style={c.input} value={marca} onChange={(e) => setMarca(e.target.value)} />
              </div>
              <div>
                <label style={c.label}>Modelo</label>
                <input style={c.input} value={modelo} onChange={(e) => setModelo(e.target.value)} />
              </div>
            </div>
          </>
        ) : (
          <span style={c.envNota}>Mantém o mesmo equipamento: {[contrato.marca, contrato.modelo].filter(Boolean).join(' ') || '—'} · {contrato.serial_number ?? '—'}</span>
        )}

        <div style={c.modalAcoes}>
          <button onClick={onFechar} style={c.btnGhost}>Cancelar</button>
          <button onClick={guardar} disabled={aGuardar} style={c.btnPrimario}>{aGuardar ? 'A criar...' : 'Renovar'}</button>
        </div>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  btnAdd: { background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' },
  link: { color: 'var(--primary)', fontWeight: 600 },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputPesq: { flex: 1, minWidth: 160, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  inputSel: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, background: '#fff', cursor: 'pointer' },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  vazio: { background: '#fff', border: '1px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center' },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 12, textAlign: 'center' },

  // Lista de contratos (accordion)
  lista: { display: 'flex', flexDirection: 'column', gap: 10 },
  contrato: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  contratoCab: { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap', font: 'inherit' },
  chevron: { color: 'var(--muted)', fontSize: 12, flexShrink: 0 },
  contratoCliente: { fontWeight: 700, fontSize: 15 },
  contratoEquip: { color: 'var(--muted)', fontSize: 13 },
  contratoMeta: { color: 'var(--muted)', fontSize: 13, marginLeft: 'auto' },
  contratoValor: { fontWeight: 700, fontSize: 14 },
  chipPorPagar: { border: '1px solid #c62828', background: '#ffebee', color: '#c62828', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' },
  chipPago: { border: '1px solid #1b873f', background: '#e8f5ec', color: '#1b873f', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' },
  badge: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  badgeVenda: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap', color: '#5B21B6', background: '#EDE9FE' },

  // Ações de fim de contrato
  acoesContrato: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 8px 4px', borderTop: '1px dashed var(--border)', marginTop: 4 },
  acoesLabel: { fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginRight: 4 },
  btnFinalizar: { background: '#fff', color: '#065F46', border: '1px solid #065F46', borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnRenovar: { background: '#fff', color: '#1E40AF', border: '1px solid #1E40AF', borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnVenda: { background: '#fff', color: '#5B21B6', border: '1px solid #5B21B6', borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },

  // Tabela de meses (expandida)
  mesesTabela: { borderTop: '1px solid #f0f0f0', padding: 8, background: '#fafafa', overflowX: 'auto' },
  mesLinha: { display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1.8fr 0.9fr', gap: 10, padding: '8px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 620 },
  mesCab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  celula: { display: 'flex', alignItems: 'center', minWidth: 0 },

  // Células de faturação (espelham a Lista)
  faturarLinha: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' },
  selectFaturar: { padding: '5px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, background: '#fff', color: 'var(--muted)', cursor: 'pointer', maxWidth: '100%', minWidth: 0 },
  selectVerde: { padding: '5px 8px', border: '1px solid #1b873f', borderRadius: 6, fontSize: 13, background: '#fff', color: '#1b873f', fontWeight: 700, cursor: 'pointer', maxWidth: '100%', minWidth: 0 },
  selectCinza: { padding: '5px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, background: '#f3f3f3', color: 'var(--muted)', fontWeight: 600, cursor: 'pointer', maxWidth: '100%', minWidth: 0 },
  inputManual: { width: 72, padding: '5px 6px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 },
  valorVerde: { color: '#1b873f', fontWeight: 700, fontSize: 14 },
  badgeCinza: { background: '#eee', color: 'var(--muted)', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 },
  semDef: { color: 'var(--muted)' },
  faturaLinha: { display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' },
  faturaLink: { fontSize: 13, color: 'var(--foreground)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 },
  chipApagar: { width: 20, height: 20, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.12)', color: 'var(--danger, #c62828)', fontSize: 14, lineHeight: 1, cursor: 'pointer', flexShrink: 0 },
  btnAnexar: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  pagoVerde: { border: '1px solid #1b873f', background: '#e8f5ec', color: '#1b873f', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1 },
  pagoVermelho: { border: '1px solid #c62828', background: '#ffebee', color: '#c62828', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1 },

  // Modais
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  modalCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, marginBottom: 8 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14, fontWeight: 600 },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  envInfo: { fontSize: 14, color: 'var(--foreground)', marginTop: 8, lineHeight: 1.6 },
  envNota: { fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'block' },
}
