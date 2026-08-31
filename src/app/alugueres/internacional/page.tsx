'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import { formatarEuro, nomeMes, parseNumeroPt } from '@/lib/alugueres'
import {
  carregarContratosIntl, guardarContratoIntl, apagarContratoIntl, atualizarFaturacaoContrato,
  mesesInclusive,
  type ContratoIntl, type ContratoEquip, type ContratoFat,
} from '@/lib/contratosInternacionais'

const BUCKET_FATURAS = 'faturas-alugueres'

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

function equipTexto(e: ContratoEquip) {
  return `${[e.marca, e.modelo].filter(Boolean).join(' ') || '—'} · ${e.serial_number ?? '—'}`
}
function seriaisTexto(ct: ContratoIntl) {
  return ct.equipamentos.map((e) => e.serial_number ?? '—').join(' + ') || '—'
}

type EstadoContrato = { chave: 'ativo' | 'a_expirar' | 'expirado'; label: string; cor: string; bg: string }
function estadoContrato(ct: ContratoIntl): EstadoContrato {
  const hoje = hojeISO()
  const fim = ct.data_fim
  if (!fim) return { chave: 'ativo', label: 'Ativo', cor: '#065F46', bg: '#D1FAE5' }
  if (fim < hoje) return { chave: 'expirado', label: 'Expirado', cor: '#991B1B', bg: '#FEE2E2' }
  if (diasAte(fim) <= 90) return { chave: 'a_expirar', label: 'A expirar', cor: '#92400E', bg: '#FEF3C7' }
  return { chave: 'ativo', label: 'Ativo', cor: '#065F46', bg: '#D1FAE5' }
}

function contagemPagos(ct: ContratoIntl) {
  let pagos = 0, porPagar = 0
  for (const f of ct.faturacao) {
    if (f.nao_faturar) continue
    if (f.pago) pagos++; else porPagar++
  }
  return { pagos, porPagar }
}

type Ordenacao = 'fim-asc' | 'inicio-desc' | 'cliente-asc' | 'valor-desc'

const colunasExport: ColunaExport<ContratoIntl>[] = [
  { cabecalho: 'Cliente', valor: (ct) => ct.cliente_nome ?? '' },
  { cabecalho: 'Equipamentos', valor: (ct) => ct.equipamentos.map(equipTexto).join(' | ') },
  { cabecalho: 'Início', valor: (ct) => formatarData(ct.data_inicio) },
  { cabecalho: 'Fim', valor: (ct) => formatarData(ct.data_fim) },
  { cabecalho: 'Meses', valor: (ct) => String(ct.faturacao.length) },
  { cabecalho: 'Valor mensal', valor: (ct) => formatarEuro(ct.valor_mensal ?? 0) },
  { cabecalho: 'Estado', valor: (ct) => estadoContrato(ct).label },
]

export default function AlugueresInternacional() {
  const { isAdmin, perfil } = useAuth()
  const podeFaturar = !!perfil
  const [contratos, setContratos] = useState<ContratoIntl[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [ordenar, setOrdenar] = useState<Ordenacao>('fim-asc')
  const [carregando, setCarregando] = useState(true)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<'novo' | ContratoIntl | null>(null)

  const carregar = useCallback(async () => {
    setContratos(await carregarContratosIntl())
    setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    const lista = contratos
      .filter((ct) => !fEstado || estadoContrato(ct).chave === fEstado)
      .filter((ct) =>
        !q ||
        (ct.cliente_nome ?? '').toLowerCase().includes(q) ||
        ct.equipamentos.some((e) =>
          (e.serial_number ?? '').toLowerCase().includes(q) ||
          (e.modelo ?? '').toLowerCase().includes(q) ||
          (e.marca ?? '').toLowerCase().includes(q))
      )
    return [...lista].sort((a, b) => {
      switch (ordenar) {
        case 'fim-asc': return (a.data_fim ?? '9999').localeCompare(b.data_fim ?? '9999')
        case 'inicio-desc': return (b.data_inicio ?? '').localeCompare(a.data_inicio ?? '')
        case 'cliente-asc': return (a.cliente_nome ?? '').localeCompare(b.cliente_nome ?? '', 'pt')
        case 'valor-desc': return (b.valor_mensal ?? 0) - (a.valor_mensal ?? 0)
        default: return 0
      }
    })
  }, [contratos, pesquisa, fEstado, ordenar])

  const emVigor = filtrados.filter((ct) => estadoContrato(ct).chave !== 'expirado')
  const mensalTotal = emVigor.reduce((acc, ct) => acc + (ct.valor_mensal ?? 0), 0)

  function toggle(id: string) {
    setAbertos((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Atualiza a faturação de um mês (otimista + persistência).
  async function atualizarFat(contratoId: string, mes: string, patch: Partial<ContratoFat>) {
    setContratos((prev) => prev.map((ct) => ct.id !== contratoId ? ct : {
      ...ct,
      faturacao: (() => {
        const existe = ct.faturacao.some((f) => f.mes === mes)
        return existe
          ? ct.faturacao.map((f) => f.mes === mes ? { ...f, ...patch } : f)
          : [...ct.faturacao, { id: null, contrato_id: contratoId, mes, valor_a_faturar: null, nao_faturar: false, pago: false, validado: false, fatura_url: null, fatura_caminho: null, fatura_nome: null, fatura_enviada_em: null, fatura_enviada_para: null, ...patch }].sort((a, b) => a.mes.localeCompare(b.mes))
      })(),
    }))
    const { error } = await atualizarFaturacaoContrato(contratoId, mes, patch)
    if (error) { alert('Erro a guardar: ' + error.message); await carregar() }
  }

  async function apagar(ct: ContratoIntl) {
    if (!window.confirm(`Apagar o contrato de ${ct.cliente_nome ?? 'cliente'} (${seriaisTexto(ct)})? Remove também a faturação mensal deste contrato.`)) return
    const { error } = await apagarContratoIntl(ct.id)
    if (error) { alert('Erro a apagar: ' + error.message); return }
    await carregar()
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Alugueres · Internacional</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isAdmin && <button onClick={() => setModal('novo')} style={c.btnAdd}>+ Novo contrato</button>}
          <Link href="/" style={c.voltar}>← Stock</Link>
        </div>
      </div>
      <AlugueresNav />

      <div style={c.filtros}>
        <input placeholder="Procurar cliente, SN, modelo..." value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} style={c.inputPesq} />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.inputSel} title="Filtrar por estado">
          <option value="">Todos os estados</option>
          <option value="ativo">Ativo</option>
          <option value="a_expirar">A expirar (≤90 dias)</option>
          <option value="expirado">Expirado</option>
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
          <p style={{ margin: 0, fontWeight: 600 }}>Sem contratos internacionais.</p>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Cria um em <strong>+ Novo contrato</strong> — junta o laser e o Zimmer, define o valor mensal do conjunto e as datas.
          </p>
        </div>
      ) : (
        <div style={c.lista}>
          {filtrados.map((ct) => {
            const est = estadoContrato(ct)
            const aberto = abertos.has(ct.id)
            const { pagos, porPagar } = contagemPagos(ct)
            return (
              <div key={ct.id} style={c.contrato}>
                <button style={c.contratoCab} onClick={() => toggle(ct.id)}>
                  <span style={c.chevron}>{aberto ? '▼' : '▸'}</span>
                  <span style={c.contratoCliente}>{ct.cliente_nome ?? '—'}</span>
                  <span style={c.contratoEquip}>{seriaisTexto(ct)}</span>
                  <span style={c.contratoMeta}>{formatarData(ct.data_inicio)} → {formatarData(ct.data_fim)} · {ct.faturacao.length} mês(es)</span>
                  <span style={c.contratoValor}>{formatarEuro(ct.valor_mensal ?? 0)}/mês</span>
                  {porPagar > 0
                    ? <span style={c.chipPorPagar}>🔴 {porPagar} por pagar</span>
                    : <span style={c.chipPago}>✓ {pagos} pagos</span>}
                  <span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>
                </button>

                {aberto && (
                  <div style={c.corpo}>
                    <div style={c.equipBox}>
                      <span style={c.equipTitulo}>Equipamentos ({ct.equipamentos.length}):</span>
                      {ct.equipamentos.length
                        ? ct.equipamentos.map((e, i) => <span key={e.id ?? i} style={c.equipChip}>{equipTexto(e)}</span>)
                        : <span style={c.semDef}>—</span>}
                    </div>
                    {ct.observacoes && <div style={c.obs}><strong>Observações:</strong> {ct.observacoes}</div>}

                    <div style={c.mesesTabela}>
                      <div style={{ ...c.mesLinha, ...c.mesCab }}>
                        <span>Mês</span><span>Valor a faturar</span><span>Fatura</span>
                        <span style={{ textAlign: 'center' }}>Pago</span>
                      </div>
                      {ct.faturacao.map((f) => (
                        <div key={f.mes} style={c.mesLinha}>
                          <span style={{ textTransform: 'capitalize' }}>{nomeMes(f.mes)}</span>
                          <span style={c.celula}>
                            <CelulaFaturar valorTotal={ct.valor_mensal ?? 0} fat={f} podeEditar={podeFaturar} onChange={(p) => atualizarFat(ct.id, f.mes, p)} />
                          </span>
                          <span style={c.celula}>
                            <CelulaFatura contratoId={ct.id} mes={f.mes} fat={f} podeEditar={podeFaturar} onChange={(p) => atualizarFat(ct.id, f.mes, p)} />
                          </span>
                          <span style={{ ...c.celula, justifyContent: 'center' }}>
                            <EstadoPago fat={f} podeEditar={podeFaturar} onChange={(p) => atualizarFat(ct.id, f.mes, p)} />
                          </span>
                        </div>
                      ))}
                      {ct.faturacao.length === 0 && <p style={c.semDef}>Sem meses — define as datas de início e fim no contrato.</p>}

                      {podeFaturar && (
                        <div style={c.acoesContrato}>
                          <button style={c.btnEditar} onClick={() => setModal(ct)}>✏️ Editar contrato</button>
                          <button style={c.btnApagar} onClick={() => apagar(ct)}>🗑 Apagar</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ModalContrato
          contrato={modal === 'novo' ? null : modal}
          autor={{ id: perfil?.id ?? null, nome: perfil?.nome ?? null }}
          onFechar={() => setModal(null)}
          onFeito={async () => { setModal(null); await carregar() }}
        />
      )}

      <p style={c.dica}>Cada contrato junta o laser + o Zimmer com um valor mensal pelo conjunto. As faturas mensais (pago/não pago) ficam dentro de cada contrato.</p>
    </main>
  )
}

// ------------------------------------------------------ CÉLULA: VALOR A FATURAR
function CelulaFaturar({ valorTotal, fat, podeEditar, onChange }: {
  valorTotal: number; fat: ContratoFat; podeEditar: boolean; onChange: (patch: Partial<ContratoFat>) => void
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

  function aplicar(patch: Partial<ContratoFat>) { onChange(patch); setEditarOutro(false) }
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
        <input style={c.inputManual} type="number" inputMode="decimal" placeholder="€" autoFocus
          value={manual} onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardarManual() }} onBlur={guardarManual} />
      )}
    </span>
  )
}

// ------------------------------------------------------------- CÉLULA: FATURA
function CelulaFatura({ contratoId, mes, fat, podeEditar, onChange }: {
  contratoId: string; mes: string; fat: ContratoFat; podeEditar: boolean; onChange: (patch: Partial<ContratoFat>) => void
}) {
  const [aCarregar, setACarregar] = useState(false)
  const temFatura = !!fat.fatura_url

  async function carregar(file: File) {
    setACarregar(true)
    const caminho = `contrato/${contratoId}/${mes}/${Date.now()}-${nomeSeguro(file.name)}`
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
        <a href={fat.fatura_url!} target="_blank" rel="noopener noreferrer" style={c.faturaLink}>📄 {fat.fatura_nome ?? 'fatura'}</a>
        {podeEditar && <button style={c.chipApagar} onClick={remover} title="Remover fatura">×</button>}
      </span>
    )
  }
  if (!podeEditar) return <span style={c.semDef}>—</span>
  return (
    <label style={c.btnAnexar}>
      {aCarregar ? '...' : '📎 Anexar'}
      <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = '' }} />
    </label>
  )
}

// -------------------------------------------------------------- CÉLULA: PAGO
function EstadoPago({ fat, podeEditar, onChange }: {
  fat: ContratoFat; podeEditar: boolean; onChange: (patch: Partial<ContratoFat>) => void
}) {
  const pago = !!fat.pago
  if (!podeEditar) return <span style={pago ? c.pagoVerde : c.pagoVermelho}>{pago ? 'Pago' : 'Não pago'}</span>
  return (
    <button type="button" style={pago ? c.pagoVerde : c.pagoVermelho}
      onClick={() => onChange({ pago: !pago })}
      title={pago ? 'Pago — clica para marcar como não pago' : 'Não pago — clica para marcar como pago'}>
      {pago ? 'Pago' : 'Não pago'}
    </button>
  )
}

// ------------------------------------------------ MODAL: CONTRATO (criar/editar)
type EquipLinha = ContratoEquip & { _k: number }

function ModalContrato({ contrato, autor, onFechar, onFeito }: {
  contrato: ContratoIntl | null
  autor: { id: string | null; nome: string | null }
  onFechar: () => void
  onFeito: () => Promise<void>
}) {
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([])
  const [clienteNome, setClienteNome] = useState(contrato?.cliente_nome ?? '')
  const [clienteId, setClienteId] = useState<string | null>(contrato?.cliente_id ?? null)
  const [equipas, setEquipas] = useState<EquipLinha[]>(
    contrato && contrato.equipamentos.length
      ? contrato.equipamentos.map((e, i) => ({ ...e, _k: i }))
      : [{ _k: 0, equipamento_id: null, serial_number: '', marca: null, modelo: null, ano: null }]
  )
  const [valor, setValor] = useState(contrato?.valor_mensal != null ? String(contrato.valor_mensal) : '')
  const [inicio, setInicio] = useState(contrato?.data_inicio ?? '')
  const [fim, setFim] = useState(contrato?.data_fim ?? '')
  const [obs, setObs] = useState(contrato?.observacoes ?? '')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('clientes').select('id, nome').order('nome').limit(5000)
      .then(({ data }) => setClientes((data as { id: string; nome: string }[]) ?? []))
  }, [])

  function aoMudarCliente(nome: string) {
    setClienteNome(nome)
    const m = clientes.find((cl) => cl.nome.trim().toLowerCase() === nome.trim().toLowerCase())
    setClienteId(m?.id ?? null)
  }

  function alterarEquip(k: number, patch: Partial<EquipLinha>) {
    setEquipas((prev) => prev.map((e) => e._k === k ? { ...e, ...patch } : e))
  }
  function adicionarEquip() {
    setEquipas((prev) => [...prev, { _k: (prev.at(-1)?._k ?? 0) + 1, equipamento_id: null, serial_number: '', marca: null, modelo: null, ano: null }])
  }
  function removerEquip(k: number) {
    setEquipas((prev) => prev.length > 1 ? prev.filter((e) => e._k !== k) : prev)
  }
  // Procura o serial no stock e preenche marca/modelo/ano.
  async function procurarEquip(k: number, serial: string) {
    const q = serial.trim()
    if (q.length < 2) return
    const { data } = await supabase.from('equipamentos')
      .select('id, marca, modelo, ano, serial_number')
      .ilike('serial_number', `%${q}%`).limit(8)
    const exato = ((data as { id: string; marca: string | null; modelo: string | null; ano: string | null; serial_number: string | null }[]) ?? [])
      .find((e) => (e.serial_number ?? '').trim().toLowerCase() === q.toLowerCase())
    if (exato) alterarEquip(k, { equipamento_id: exato.id, marca: exato.marca, modelo: exato.modelo, ano: exato.ano })
  }

  const nMeses = inicio && fim && fim >= inicio ? mesesInclusive(inicio, fim) : 0

  async function guardar() {
    setErro(null)
    if (!clienteNome.trim()) return setErro('Indica o cliente.')
    const equips = equipas.filter((e) => (e.serial_number ?? '').trim())
    if (!equips.length) return setErro('Indica pelo menos um equipamento (serial).')
    if (!inicio) return setErro('Indica a data de início.')
    if (!fim) return setErro('Indica a data de fim.')
    if (fim < inicio) return setErro('A data de fim não pode ser anterior ao início.')
    const n = mesesInclusive(inicio, fim)
    if (n < 1 || n > 120) return setErro('O intervalo de datas é inválido.')
    const valorNum = valor.trim() ? parseNumeroPt(valor) : null
    if (valor.trim() && valorNum === null) return setErro('O valor mensal não é válido.')

    setAGuardar(true)
    const { error } = await guardarContratoIntl({
      id: contrato?.id ?? null,
      cliente_id: clienteId,
      cliente_nome: clienteNome.trim(),
      valor_mensal: valorNum,
      data_inicio: inicio,
      data_fim: fim,
      observacoes: obs.trim() || null,
      equipamentos: equips.map((e) => ({
        equipamento_id: e.equipamento_id,
        serial_number: (e.serial_number ?? '').trim(),
        marca: e.marca, modelo: e.modelo, ano: e.ano,
      })),
    }, autor)
    setAGuardar(false)
    if (error) return setErro('Erro a guardar: ' + error.message)
    await onFeito()
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>{contrato ? 'Editar contrato' : 'Novo contrato internacional'}</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>
        {erro && <div style={c.erro}>{erro}</div>}

        <label style={c.label}>Cliente</label>
        <input style={c.input} list="lista-clientes-intl" value={clienteNome}
          onChange={(e) => aoMudarCliente(e.target.value)} placeholder="Nome do cliente" />
        <datalist id="lista-clientes-intl">
          {clientes.map((cl) => <option key={cl.id} value={cl.nome} />)}
        </datalist>
        {clienteNome.trim() && !clienteId && <span style={c.envNota}>Não ligado a um cliente registado (fica só como texto).</span>}

        <label style={c.label}>Equipamentos (laser + Zimmer)</label>
        {equipas.map((e) => (
          <div key={e._k} style={c.equipRow}>
            <input style={{ ...c.input, flex: 1 }} value={e.serial_number ?? ''} placeholder="Serial number"
              onChange={(ev) => alterarEquip(e._k, { serial_number: ev.target.value })}
              onBlur={(ev) => procurarEquip(e._k, ev.target.value)} />
            <span style={c.equipInfo}>{[e.marca, e.modelo].filter(Boolean).join(' ') || '—'}</span>
            {equipas.length > 1 && <button style={c.btnRemoverEquip} onClick={() => removerEquip(e._k)} title="Remover">×</button>}
          </div>
        ))}
        <button style={c.btnAddEquip} onClick={adicionarEquip}>+ Adicionar equipamento</button>

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Valor mensal (€) — do conjunto</label>
            <input style={c.input} type="number" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
          </div>
          <div />
        </div>

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Data de início</label>
            <input style={c.input} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label style={c.label}>Data de fim</label>
            <input style={c.input} type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>

        <label style={c.label}>Observações</label>
        <textarea style={{ ...c.input, minHeight: 64, fontFamily: 'inherit' }} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Notas do contrato (opcional)" />

        <p style={c.envInfo}>
          {nMeses > 0
            ? <>Vai gerar <strong>{nMeses}</strong> fatura(s) mensal(is) de {formatarData(inicio)} a {formatarData(fim)}.</>
            : 'Indica as datas de início e fim para gerar os meses.'}
          {contrato && <><br /><span style={c.envNota}>Os meses que se mantiverem no intervalo preservam o estado de pagamento/fatura.</span></>}
        </p>

        <div style={c.modalAcoes}>
          <button onClick={onFechar} style={c.btnGhost}>Cancelar</button>
          <button onClick={guardar} disabled={aGuardar || nMeses < 1} style={c.btnPrimario}>
            {aGuardar ? 'A guardar...' : contrato ? 'Guardar alterações' : 'Criar contrato'}
          </button>
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
  btnAdd: { background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' },
  link: { color: 'var(--primary)', fontWeight: 600 },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputPesq: { flex: 1, minWidth: 160, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  inputSel: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, background: '#fff', cursor: 'pointer' },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  vazio: { background: '#fff', border: '1px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center' },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 12, textAlign: 'center' },

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

  corpo: { borderTop: '1px solid #f0f0f0', padding: 8, background: '#fafafa' },
  equipBox: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '4px 6px 8px' },
  equipTitulo: { fontSize: 12, fontWeight: 700, color: 'var(--muted)' },
  equipChip: { background: '#eef1f6', borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 600 },
  obs: { padding: '4px 6px 8px', fontSize: 13, color: 'var(--foreground)' },

  acoesContrato: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 8px 4px', borderTop: '1px dashed var(--border)', marginTop: 4 },
  btnEditar: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnApagar: { background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },

  mesesTabela: { borderTop: '1px solid #f0f0f0', padding: 8, background: '#fafafa', overflowX: 'auto' },
  mesLinha: { display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1.8fr 0.9fr', gap: 10, padding: '8px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 620 },
  mesCab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  celula: { display: 'flex', alignItems: 'center', minWidth: 0 },

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

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  modalCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, marginBottom: 8 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  equipRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
  equipInfo: { fontSize: 12.5, color: 'var(--muted)', minWidth: 90, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  btnRemoverEquip: { width: 30, height: 30, borderRadius: 8, border: '1px solid #FCA5A5', background: '#fff', color: '#B91C1C', fontSize: 16, cursor: 'pointer', flexShrink: 0 },
  btnAddEquip: { alignSelf: 'flex-start', background: '#fff', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 2 },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  envInfo: { fontSize: 14, color: 'var(--foreground)', marginTop: 8, lineHeight: 1.6 },
  envNota: { fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'block' },
}
