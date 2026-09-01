'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import { formatarEuro, somar } from '@/lib/alugueres'
import { listarClientesPicker, type EntidadeOpc } from '@/lib/contasCorrentes'
import {
  carregarSituacaoAlugueres, carregarDisponiveis, guardarFichaSituacao, apagarFichaSituacao,
  procurarEquipamentosEmStock, colocarEmAluguer, terminarAluguer,
  STATUS_ALUGUER_NAC, STATUS_ALUGUER_INT,
  classificar, inicioEfetivo, duracaoTexto, diasAte, alertaDe,
  type SituacaoAluguer, type Disponiveis, type EquipDisponivel, type FichaPatch, type Mercado, type EquipEmStock,
} from '@/lib/situacaoAlugueres'

type Tab = 'nacionais' | 'internacionais' | 'por-classificar' | 'disponiveis'
type Ordenacao = 'inicio-desc' | 'inicio-asc' | 'fim-asc' | 'valor-desc'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function useEcraEstreito(limite = 960) {
  const [estreito, setEstreito] = useState(false)
  useEffect(() => {
    const v = () => setEstreito(window.innerWidth < limite)
    v(); window.addEventListener('resize', v)
    return () => window.removeEventListener('resize', v)
  }, [limite])
  return estreito
}

// Texto derivado (com fallback ao que existe no equipamento)
function clienteTexto(s: SituacaoAluguer) { return s.cliente_nome || s.destino || '—' }
function localizacaoTexto(s: SituacaoAluguer) {
  if (s.localizacao) return s.localizacao
  const cid = [s.cliente_cidade, s.cliente_pais].filter(Boolean).join(', ')
  return cid || s.destino || '—'
}
function fimTexto(s: SituacaoAluguer) {
  if (s.renovacao_automatica) return 'Renovação mensal'
  return s.data_fim_prevista ? formatarData(s.data_fim_prevista) : '—'
}

const colunasExport: ColunaExport<SituacaoAluguer>[] = [
  { cabecalho: 'Serial', valor: (l) => l.serial_number ?? '' },
  { cabecalho: 'Marca', valor: (l) => l.marca ?? '' },
  { cabecalho: 'Modelo', valor: (l) => l.modelo ?? '' },
  { cabecalho: 'Mercado', valor: (l) => ({ nacional: 'Nacional', internacional: 'Internacional', 'por-classificar': 'Por classificar' }[classificar(l)]) },
  { cabecalho: 'Cliente', valor: (l) => clienteTexto(l) },
  { cabecalho: 'Localização', valor: (l) => localizacaoTexto(l) },
  { cabecalho: 'Início', valor: (l) => formatarData(inicioEfetivo(l)) },
  { cabecalho: 'Duração', valor: (l) => duracaoTexto(inicioEfetivo(l)) },
  { cabecalho: 'Fim previsto', valor: (l) => fimTexto(l) },
  { cabecalho: 'Valor mensal', valor: (l) => (l.valor_mensal != null ? formatarEuro(l.valor_mensal) : '') },
]

const colunasDispExport: ColunaExport<EquipDisponivel>[] = [
  { cabecalho: 'Serial', valor: (l) => l.serial_number ?? '' },
  { cabecalho: 'Marca', valor: (l) => l.marca ?? '' },
  { cabecalho: 'Modelo', valor: (l) => l.modelo ?? '' },
  { cabecalho: 'Modelo aluguer', valor: (l) => l.modelo_aluguer ?? '' },
  { cabecalho: 'Estado', valor: (l) => l.status },
]

export default function SituacaoAtualPage() {
  const { perfil } = useAuth()
  const estreito = useEcraEstreito()
  const [tab, setTab] = useState<Tab>('nacionais')
  const [alugueres, setAlugueres] = useState<SituacaoAluguer[]>([])
  const [disponiveis, setDisponiveis] = useState<Disponiveis>({ livres: [], indisponiveis: [] })
  const [carregando, setCarregando] = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const [ordenar, setOrdenar] = useState<Ordenacao>('inicio-desc')
  const [editar, setEditar] = useState<SituacaoAluguer | null>(null)
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [a, d] = await Promise.all([carregarSituacaoAlugueres(), carregarDisponiveis()])
    setAlugueres(a); setDisponiveis(d); setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const nacionais = useMemo(() => alugueres.filter((a) => classificar(a) === 'nacional'), [alugueres])
  const internacionais = useMemo(() => alugueres.filter((a) => classificar(a) === 'internacional'), [alugueres])
  const porClassificar = useMemo(() => alugueres.filter((a) => classificar(a) === 'por-classificar'), [alugueres])

  function filtrarOrdenar(lista: SituacaoAluguer[]): SituacaoAluguer[] {
    const q = pesquisa.trim().toLowerCase()
    const f = !q ? lista : lista.filter((s) =>
      [s.marca, s.modelo, s.serial_number, clienteTexto(s), localizacaoTexto(s), s.cliente_pais]
        .some((v) => (v ?? '').toLowerCase().includes(q)))
    const ini = (s: SituacaoAluguer) => inicioEfetivo(s) ?? ''
    return [...f].sort((a, b) => {
      switch (ordenar) {
        case 'inicio-asc': return ini(a).localeCompare(ini(b))
        case 'inicio-desc': return ini(b).localeCompare(ini(a))
        case 'fim-asc': return (a.data_fim_prevista ?? '9999').localeCompare(b.data_fim_prevista ?? '9999')
        case 'valor-desc': return (b.valor_mensal ?? 0) - (a.valor_mensal ?? 0)
        default: return 0
      }
    })
  }

  const listaAtual = tab === 'nacionais' ? filtrarOrdenar(nacionais)
    : tab === 'internacionais' ? filtrarOrdenar(internacionais)
    : tab === 'por-classificar' ? filtrarOrdenar(porClassificar) : []

  const dispFiltrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    const filtra = (l: EquipDisponivel[]) => !q ? l : l.filter((e) =>
      [e.marca, e.modelo, e.serial_number, e.modelo_aluguer, e.status].some((v) => (v ?? '').toLowerCase().includes(q)))
    return { livres: filtra(disponiveis.livres), indisponiveis: filtra(disponiveis.indisponiveis) }
  }, [disponiveis, pesquisa])

  function aoGuardarFicha(atualizado: SituacaoAluguer) {
    setAlugueres((prev) => prev.map((a) => (a.equipamento_id === atualizado.equipamento_id ? atualizado : a)))
    setEditar(null)
  }

  // Ação rápida na zona "Por classificar": define o mercado num clique.
  async function definirMercado(s: SituacaoAluguer, mercado: Mercado) {
    setAlugueres((prev) => prev.map((a) => (a.equipamento_id === s.equipamento_id ? { ...a, mercado } : a)))
    const { error } = await guardarFichaSituacao(s.equipamento_id, { mercado }, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    if (error) {
      setAlugueres((prev) => prev.map((a) => (a.equipamento_id === s.equipamento_id ? { ...a, mercado: s.mercado } : a)))
      alert('Não foi possível guardar a classificação: ' + error.message)
    }
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Situação atual</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={c.btnNovo} onClick={() => setNovo(true)}>＋ Novo aluguer</button>
          <Link href="/" style={c.voltar}>← Stock</Link>
        </div>
      </div>
      <AlugueresNav />

      {/* Resumo geral */}
      <div style={c.resumoGeral}>
        <div style={c.rgItem}><span style={c.rgNum}>{alugueres.length}</span><span style={c.rgLbl}>em aluguer</span></div>
        <div style={c.rgSep} />
        <div style={c.rgItem}><span style={c.rgNum}>{nacionais.length}</span><span style={c.rgLbl}>🇵🇹 nacionais</span></div>
        <div style={c.rgItem}><span style={c.rgNum}>{internacionais.length}</span><span style={c.rgLbl}>🌍 internacionais</span></div>
        {porClassificar.length > 0 && (
          <div style={c.rgItem}><span style={{ ...c.rgNum, color: '#B45309' }}>{porClassificar.length}</span><span style={c.rgLbl}>⚠ por classificar</span></div>
        )}
        <div style={c.rgSep} />
        <div style={c.rgItem}><span style={{ ...c.rgNum, color: '#00A87A' }}>{disponiveis.livres.length}</span><span style={c.rgLbl}>disponíveis</span></div>
        {disponiveis.indisponiveis.length > 0 && (
          <div style={c.rgItem}><span style={{ ...c.rgNum, color: '#B45309' }}>{disponiveis.indisponiveis.length}</span><span style={c.rgLbl}>indisponíveis</span></div>
        )}
      </div>

      {/* Aviso destacado: alugueres por classificar */}
      {porClassificar.length > 0 && tab !== 'por-classificar' && (
        <button style={c.bannerPC} onClick={() => setTab('por-classificar')}>
          ⚠ {porClassificar.length} aluguer(es) por classificar — sem país do cliente nem mercado definido. Não aparecem em Nacionais nem Internacionais. Clica para resolver.
        </button>
      )}

      {/* Tabs */}
      <div style={c.tabs}>
        <button style={{ ...c.tab, ...(tab === 'nacionais' ? c.tabAtiva : {}) }} onClick={() => setTab('nacionais')}>🇵🇹 Nacionais ({nacionais.length})</button>
        <button style={{ ...c.tab, ...(tab === 'internacionais' ? c.tabAtiva : {}) }} onClick={() => setTab('internacionais')}>🌍 Internacionais ({internacionais.length})</button>
        {porClassificar.length > 0 && (
          <button style={{ ...c.tab, ...c.tabPC, ...(tab === 'por-classificar' ? c.tabPCAtiva : {}) }} onClick={() => setTab('por-classificar')}>⚠ Por classificar ({porClassificar.length})</button>
        )}
        <button style={{ ...c.tab, ...(tab === 'disponiveis' ? c.tabAtiva : {}) }} onClick={() => setTab('disponiveis')}>📦 Disponíveis ({disponiveis.livres.length})</button>
      </div>

      {/* Filtros */}
      <div style={c.filtros}>
        <input placeholder="Procurar marca, modelo, cliente, país..." value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} style={c.inputPesq} />
        {tab !== 'disponiveis' && (
          <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as Ordenacao)} style={c.select} title="Ordenar">
            <option value="inicio-desc">Início (mais recente)</option>
            <option value="inicio-asc">Início (mais antigo)</option>
            <option value="fim-asc">Fim previsto (mais próximo)</option>
            <option value="valor-desc">Valor mensal (maior)</option>
          </select>
        )}
        {tab === 'nacionais' && <BotaoExportar nome="alugueres-nacionais" colunas={colunasExport} linhas={listaAtual} />}
        {tab === 'internacionais' && <BotaoExportar nome="alugueres-internacionais" colunas={colunasExport} linhas={listaAtual} />}
        {tab === 'disponiveis' && <BotaoExportar nome="frota-disponivel" colunas={colunasDispExport} linhas={dispFiltrados.livres} />}
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : tab === 'disponiveis' ? (
        <SeccaoDisponiveis dados={dispFiltrados} estreito={estreito} />
      ) : tab === 'por-classificar' ? (
        <ZonaPorClassificar lista={listaAtual} onEditar={setEditar} onDefinir={definirMercado} />
      ) : (
        <QuadroAlugueres lista={listaAtual} estreito={estreito} onEditar={setEditar} />
      )}

      {editar && (
        <ModalFicha
          situacao={editar}
          onFechar={() => setEditar(null)}
          onGuardado={aoGuardarFicha}
          onTerminado={() => { setEditar(null); carregar() }}
        />
      )}

      {novo && (
        <ModalNovoAluguer onFechar={() => setNovo(false)} onCriado={() => { setNovo(false); carregar() }} />
      )}
    </main>
  )
}

// ─────────────────────────────────────────────── QUADRO DE ALUGUERES ─────────
function QuadroAlugueres({ lista, estreito, onEditar }: {
  lista: SituacaoAluguer[]; estreito: boolean; onEditar: (s: SituacaoAluguer) => void
}) {
  const totalMensal = somar(lista, (l) => l.valor_mensal)
  const semValor = lista.filter((l) => l.valor_mensal == null).length

  if (lista.length === 0) return <p style={c.estado}>Nenhum equipamento em aluguer nesta vista.</p>

  return (
    <>
      <div style={c.totais}>
        <span><strong>{lista.length}</strong> equipamento(s)</span>
        <span>Valor mensal: <strong>{formatarEuro(totalMensal)}</strong>{semValor > 0 && <span style={c.avisoTotais}> ({semValor} sem valor definido)</span>}</span>
      </div>

      {estreito ? (
        <div style={c.cartoes}>{lista.map((s) => <CartaoAluguer key={s.equipamento_id} s={s} onEditar={onEditar} />)}</div>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Equipamento</span><span>Cliente</span><span>Localização</span>
            <span>Início</span><span>Duração</span><span>Fim previsto</span>
            <span style={{ textAlign: 'right' }}>Mensal</span>
          </div>
          {lista.map((s) => {
            const alerta = alertaDe(s)
            return (
              <div key={s.equipamento_id}
                style={{ ...c.linha, ...c.linhaClicavel, ...(alerta === 'vencido' ? c.linhaVencido : alerta === 'a-terminar' ? c.linhaTerminar : {}) }}
                onClick={() => onEditar(s)} title="Clica para completar/editar os dados do aluguer">
                <span style={c.equip}>
                  <span style={c.equipSn}>{s.serial_number ?? '—'}</span>
                  <span style={c.equipMarca}>{[s.marca, s.modelo].filter(Boolean).join(' ') || '—'}</span>
                </span>
                <span>{clienteTexto(s)}</span>
                <span>{localizacaoTexto(s)}</span>
                <span>{formatarData(inicioEfetivo(s))}</span>
                <span>{duracaoTexto(inicioEfetivo(s))}</span>
                <span>{fimTexto(s)}{alerta && <BadgeAlerta s={s} alerta={alerta} />}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{s.valor_mensal != null ? formatarEuro(s.valor_mensal) : '—'}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────── POR CLASSIFICAR ─────────────
function ZonaPorClassificar({ lista, onEditar, onDefinir }: {
  lista: SituacaoAluguer[]; onEditar: (s: SituacaoAluguer) => void; onDefinir: (s: SituacaoAluguer, m: Mercado) => void
}) {
  if (lista.length === 0) return <p style={c.estado}>Nada por classificar. 🎉 Todos os alugueres têm mercado definido.</p>
  return (
    <>
      <p style={c.pcIntro}>
        Estes alugueres não têm país do cliente nem mercado definido, por isso <strong>não aparecem em Nacionais nem Internacionais</strong>.
        Define o mercado num clique (ou abre o detalhe para ligar o cliente / afinar).
      </p>
      <div style={c.cartoes}>
        {lista.map((s) => (
          <div key={s.equipamento_id} style={c.pcCartao}>
            <div style={c.pcTopo}>
              <span style={c.equipSn}>{s.serial_number ?? '—'}</span>
              <span style={c.equipMarca}>{[s.marca, s.modelo].filter(Boolean).join(' ') || '—'}</span>
            </div>
            <div style={c.pcDestino}>
              <span style={c.cartaoLabel}>Destino registado:</span> <strong>{s.destino || '—'}</strong>
            </div>
            <div style={c.pcAcoes}>
              <button style={c.pcBtnNac} onClick={() => onDefinir(s, 'nacional')}>🇵🇹 Nacional</button>
              <button style={c.pcBtnInt} onClick={() => onDefinir(s, 'internacional')}>🌍 Internacional</button>
              <button style={c.pcBtnDet} onClick={() => onEditar(s)}>Detalhe / ligar cliente →</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function BadgeAlerta({ s, alerta }: { s: SituacaoAluguer; alerta: 'vencido' | 'a-terminar' }) {
  const dias = diasAte(s.data_fim_prevista)
  if (alerta === 'vencido') return <span style={c.badgeVencido} title="Fim ultrapassado sem renovação">⚠ vencido {dias != null ? `há ${-dias}d` : ''}</span>
  return <span style={c.badgeTerminar} title="Termina em breve">⏰ {dias}d</span>
}

function CartaoAluguer({ s, onEditar }: { s: SituacaoAluguer; onEditar: (s: SituacaoAluguer) => void }) {
  const alerta = alertaDe(s)
  return (
    <div style={{ ...c.cartao, ...c.linhaClicavel, ...(alerta === 'vencido' ? c.linhaVencido : alerta === 'a-terminar' ? c.linhaTerminar : {}) }}
      onClick={() => onEditar(s)}>
      <div style={c.cartaoTopo}>
        <span style={c.equipSn}>{s.serial_number ?? '—'}</span>
        {alerta && <BadgeAlerta s={s} alerta={alerta} />}
      </div>
      <div style={c.equipMarca}>{[s.marca, s.modelo].filter(Boolean).join(' ') || '—'}</div>
      <div style={c.cartaoLinha}><span style={c.cartaoLabel}>Cliente</span><span>{clienteTexto(s)}</span></div>
      <div style={c.cartaoLinha}><span style={c.cartaoLabel}>Localização</span><span>{localizacaoTexto(s)}</span></div>
      <div style={c.cartaoLinha}><span style={c.cartaoLabel}>Início</span><span>{formatarData(inicioEfetivo(s))} · {duracaoTexto(inicioEfetivo(s))}</span></div>
      <div style={c.cartaoLinha}><span style={c.cartaoLabel}>Fim previsto</span><span>{fimTexto(s)}</span></div>
      <div style={c.cartaoLinha}><span style={c.cartaoLabel}>Valor mensal</span><span style={{ fontWeight: 700 }}>{s.valor_mensal != null ? formatarEuro(s.valor_mensal) : '—'}</span></div>
    </div>
  )
}

// ─────────────────────────────────────────────── DISPONÍVEIS ─────────────────
function SeccaoDisponiveis({ dados, estreito }: { dados: Disponiveis; estreito: boolean }) {
  return (
    <>
      <GrupoDisp titulo="Livres para alugar" cor="#00A87A" itens={dados.livres} estreito={estreito} vazio="Nenhum equipamento da frota de aluguer livre neste momento." />
      {dados.indisponiveis.length > 0 && (
        <GrupoDisp titulo="Indisponíveis (em reacondicionamento)" cor="#B45309" itens={dados.indisponiveis} estreito={estreito} vazio="" />
      )}
      <p style={c.rodape}>Frota de aluguer = equipamentos dos modelos do catálogo de aluguer. Os que estão em aluguer aparecem nos quadros Nacionais / Internacionais.</p>
    </>
  )
}

function GrupoDisp({ titulo, cor, itens, estreito, vazio }: {
  titulo: string; cor: string; itens: EquipDisponivel[]; estreito: boolean; vazio: string
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...c.grupoDispCab, color: cor }}>{titulo} · {itens.length}</div>
      {itens.length === 0 ? (
        vazio ? <p style={c.estado}>{vazio}</p> : null
      ) : estreito ? (
        <div style={c.cartoes}>
          {itens.map((e) => (
            <Link key={e.id} href={`/equipamentos/${e.id}`} style={{ ...c.cartao, textDecoration: 'none', color: 'inherit' }}>
              <div style={c.cartaoTopo}><span style={c.equipSn}>{e.serial_number ?? '—'}</span><span style={c.dispEstado}>{e.status}</span></div>
              <div style={c.equipMarca}>{[e.marca, e.modelo].filter(Boolean).join(' ') || '—'}</div>
              <div style={c.cartaoLinha}><span style={c.cartaoLabel}>Modelo aluguer</span><span>{e.modelo_aluguer ?? '—'}</span></div>
            </Link>
          ))}
        </div>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linhaDisp, ...c.cab }}><span>Equipamento</span><span>Modelo aluguer</span><span>Estado</span></div>
          {itens.map((e) => (
            <Link key={e.id} href={`/equipamentos/${e.id}`} style={{ ...c.linhaDisp, ...c.linhaClicavel, textDecoration: 'none', color: 'inherit' }}>
              <span style={c.equip}>
                <span style={c.equipSn}>{e.serial_number ?? '—'}</span>
                <span style={c.equipMarca}>{[e.marca, e.modelo].filter(Boolean).join(' ') || '—'}</span>
              </span>
              <span>{e.modelo_aluguer ?? '—'}</span>
              <span style={c.dispEstado}>{e.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────── MODAL FICHA ─────────────────
function ModalFicha({ situacao, onFechar, onGuardado, onTerminado }: {
  situacao: SituacaoAluguer; onFechar: () => void; onGuardado: (s: SituacaoAluguer) => void; onTerminado: () => void
}) {
  const { perfil } = useAuth()
  const [clientes, setClientes] = useState<EntidadeOpc[]>([])
  const [clienteId, setClienteId] = useState(situacao.cliente_id ?? '')
  const [clienteNome, setClienteNome] = useState(situacao.cliente_nome ?? '')
  const [mercado, setMercado] = useState<'' | Mercado>(situacao.mercado ?? '')
  const [inicio, setInicio] = useState(situacao.data_inicio ?? situacao.data_saida ?? '')
  const [renovacao, setRenovacao] = useState(situacao.renovacao_automatica)
  const [fim, setFim] = useState(situacao.data_fim_prevista ?? '')
  const [valor, setValor] = useState(situacao.valor_mensal != null ? String(situacao.valor_mensal) : '')
  const [local, setLocal] = useState(situacao.localizacao ?? '')
  const [notas, setNotas] = useState(situacao.notas ?? '')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarClientesPicker().then(setClientes) }, [])

  // Ao escrever/escolher o nome, tenta ligar a um cliente existente.
  function aoMudarCliente(nome: string) {
    setClienteNome(nome)
    const m = clientes.find((c2) => c2.nome.toLowerCase() === nome.trim().toLowerCase())
    setClienteId(m?.id ?? '')
  }

  // País do cliente escolhido (para o texto "Automático") — do picker ou da própria ficha.
  const paisClienteEscolhido = (clientes.find((c2) => c2.id === clienteId)?.pais ?? (clienteId ? situacao.cliente_pais : null) ?? '').trim() || null
  const paisClienteEhPT = ['portugal', 'pt'].includes((paisClienteEscolhido ?? '').toLowerCase())

  async function guardar() {
    setErro(null)
    if (fim && inicio && fim < inicio) return setErro('O fim previsto não pode ser anterior ao início.')
    const valorNum = valor.trim() ? Number(valor.replace(',', '.')) : null
    if (valorNum != null && (isNaN(valorNum) || valorNum < 0)) return setErro('Valor mensal inválido.')
    setAGuardar(true)
    const patch: FichaPatch = {
      cliente_id: clienteId || null,
      mercado: mercado || null,
      data_inicio: inicio || null,
      data_fim_prevista: renovacao ? null : (fim || null),
      renovacao_automatica: renovacao,
      valor_mensal: valorNum,
      localizacao: local.trim() || null,
      notas: notas.trim() || null,
    }
    const { error } = await guardarFichaSituacao(situacao.equipamento_id, patch, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setAGuardar(false)
    if (error) return setErro('Erro ao guardar: ' + error.message)
    // Reflete localmente (inclui nome/país do cliente escolhido)
    const cli = clientes.find((c2) => c2.id === clienteId)
    onGuardado({
      ...situacao, ...patch,
      cliente_nome: cli?.nome ?? (clienteId ? clienteNome : null),
      cliente_pais: cli?.pais ?? (clienteId ? situacao.cliente_pais : null),
      cliente_cidade: cli?.cidade ?? (clienteId ? situacao.cliente_cidade : null),
      mercado: mercado || null,
      renovacao_automatica: renovacao, valor_mensal: valorNum,
      localizacao: local.trim() || null, notas: notas.trim() || null,
    })
  }

  async function limpar() {
    if (!window.confirm('Limpar os dados deste aluguer (incluindo a classificação de mercado)? O equipamento continua em aluguer, mas passa a "Por classificar" até ser reclassificado.')) return
    setAGuardar(true)
    await apagarFichaSituacao(situacao.equipamento_id)
    setAGuardar(false)
    onGuardado({
      ...situacao, situacao_id: null, cliente_id: null, cliente_nome: null, cliente_pais: null, cliente_cidade: null, mercado: null,
      data_inicio: null, data_fim_prevista: null, renovacao_automatica: false, valor_mensal: null, localizacao: null, notas: null,
    })
  }

  async function terminar() {
    const nome = [situacao.marca, situacao.modelo].filter(Boolean).join(' ') || 'este equipamento'
    if (!window.confirm(`Terminar o aluguer de ${nome} (${situacao.serial_number ?? '—'})?\n\nO equipamento volta a "Em stock" (fica disponível para alugar) e os dados deste aluguer são removidos.`)) return
    setErro(null)
    setAGuardar(true)
    const r = await terminarAluguer(situacao.equipamento_id)
    setAGuardar(false)
    if (r?.error) return setErro('Erro ao terminar: ' + r.error.message)
    onTerminado()
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>Detalhe do aluguer</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>

        <p style={c.envInfo}>
          <strong>{[situacao.marca, situacao.modelo].filter(Boolean).join(' ') || '—'}</strong> · {situacao.serial_number ?? '—'}
          {situacao.destino && <><br /><span style={{ color: 'var(--muted)' }}>Destino registado: {situacao.destino}</span></>}
        </p>

        {erro && <div style={c.erro}>{erro}</div>}

        <label style={c.label}>Cliente</label>
        <input style={c.input} list="clientes-picker" value={clienteNome} onChange={(e) => aoMudarCliente(e.target.value)}
          placeholder="Escolher cliente da lista (opcional)" />
        <datalist id="clientes-picker">
          {clientes.map((c2) => <option key={c2.id} value={c2.nome} />)}
        </datalist>
        {clienteNome && !clienteId && <span style={c.notaLigacao}>Este nome não está ligado a um cliente registado (fica só como texto).</span>}

        <label style={c.label}>Mercado (quadro)</label>
        <select style={c.input} value={mercado} onChange={(e) => setMercado(e.target.value as '' | Mercado)}>
          <option value="">Automático — pelo país do cliente{paisClienteEscolhido ? ` (${paisClienteEscolhido} → ${paisClienteEhPT ? 'Nacional' : 'Internacional'})` : ' (sem país → Por classificar)'}</option>
          <option value="nacional">🇵🇹 Nacional (forçar)</option>
          <option value="internacional">🌍 Internacional (forçar)</option>
        </select>

        <label style={c.label}>Localização (cidade / país)</label>
        <input style={c.input} value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Porto, Portugal" />

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Início</label>
            <input style={c.input} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label style={c.label}>Valor mensal (€)</label>
            <input style={c.input} type="number" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
          </div>
        </div>

        <label style={c.checkLinha}>
          <input type="checkbox" checked={renovacao} onChange={(e) => setRenovacao(e.target.checked)} />
          Renovação automática / mensal (sem data de fim)
        </label>

        {!renovacao && (
          <>
            <label style={c.label}>Fim previsto</label>
            <input style={c.input} type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </>
        )}

        <label style={c.label}>Notas</label>
        <textarea style={{ ...c.input, minHeight: 70, fontFamily: 'inherit' }} value={notas} onChange={(e) => setNotas(e.target.value)} />

        <div style={c.linksCruzados}>
          <Link href={`/equipamentos/${situacao.equipamento_id}`} style={c.linkCruzado}>Abrir ficha do equipamento →</Link>
          <Link href="/alugueres/equipamento" style={c.linkCruzado}>Rentabilidade acumulada →</Link>
        </div>

        <div style={c.modalAcoes}>
          <div style={c.modalAcoesEsq}>
            <button onClick={terminar} disabled={aGuardar} style={c.btnGhostDanger}>Terminar aluguer</button>
            {situacao.situacao_id && <button onClick={limpar} disabled={aGuardar} style={c.btnGhost}>Limpar</button>}
          </div>
          <button onClick={onFechar} style={c.btnGhost}>Cancelar</button>
          <button onClick={guardar} disabled={aGuardar} style={c.btnPrimario}>{aGuardar ? 'A guardar...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────── NOVO ALUGUER (manual) ───────
function ModalNovoAluguer({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const { perfil } = useAuth()
  const [clientes, setClientes] = useState<EntidadeOpc[]>([])
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<EquipEmStock[]>([])
  const [equip, setEquip] = useState<EquipEmStock | null>(null)
  const [clienteId, setClienteId] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [mercado, setMercado] = useState<'' | Mercado>('')
  const [inicio, setInicio] = useState(() => new Date().toISOString().slice(0, 10))
  const [renovacao, setRenovacao] = useState(false)
  const [fim, setFim] = useState('')
  const [valor, setValor] = useState('')
  const [local, setLocal] = useState('')
  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarClientesPicker().then(setClientes) }, [])

  // Pesquisa de equipamentos "Em stock" (com pequeno atraso). Só enquanto não há escolhido.
  useEffect(() => {
    if (equip) return
    let ativo = true
    const t = setTimeout(() => {
      procurarEquipamentosEmStock(busca).then((r) => { if (ativo) setResultados(r) })
    }, 250)
    return () => { ativo = false; clearTimeout(t) }
  }, [busca, equip])

  function aoMudarCliente(nome: string) {
    setClienteNome(nome)
    const m = clientes.find((c2) => c2.nome.toLowerCase() === nome.trim().toLowerCase())
    setClienteId(m?.id ?? '')
  }

  const paisCliente = (clientes.find((c2) => c2.id === clienteId)?.pais ?? '').trim() || null
  const paisEhPT = ['portugal', 'pt'].includes((paisCliente ?? '').toLowerCase())

  async function criar() {
    setErro(null)
    if (!equip) return setErro('Escolhe primeiro o equipamento a colocar em aluguer.')
    if (fim && inicio && fim < inicio) return setErro('O fim previsto não pode ser anterior ao início.')
    const valorNum = valor.trim() ? Number(valor.replace(',', '.')) : null
    if (valorNum != null && (isNaN(valorNum) || valorNum < 0)) return setErro('Valor mensal inválido.')

    // Status do equipamento: pelo mercado forçado, senão pelo país do cliente, senão nacional.
    const status = mercado === 'internacional' ? STATUS_ALUGUER_INT
      : mercado === 'nacional' ? STATUS_ALUGUER_NAC
      : paisCliente ? (paisEhPT ? STATUS_ALUGUER_NAC : STATUS_ALUGUER_INT)
      : STATUS_ALUGUER_NAC

    const patch: FichaPatch = {
      cliente_id: clienteId || null,
      mercado: mercado || null,
      data_inicio: inicio || null,
      data_fim_prevista: renovacao ? null : (fim || null),
      renovacao_automatica: renovacao,
      valor_mensal: valorNum,
      localizacao: local.trim() || null,
      notas: notas.trim() || null,
    }
    setAGuardar(true)
    const r = await colocarEmAluguer(equip.id, status, patch, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setAGuardar(false)
    if (r?.error) return setErro('Erro ao criar o aluguer: ' + r.error.message)
    onCriado()
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>Novo aluguer</h2>
          <button onClick={onFechar} style={c.fechar} aria-label="Fechar">✕</button>
        </div>

        {erro && <div style={c.erro}>{erro}</div>}

        <label style={c.label}>Equipamento (do stock)</label>
        {equip ? (
          <div style={c.equipEscolhido}>
            <span>
              <strong>{equip.serial_number ?? '—'}</strong>
              <span style={{ color: 'var(--muted)' }}> · {[equip.marca, equip.modelo].filter(Boolean).join(' ') || '—'}</span>
            </span>
            <button style={c.btnGhost} onClick={() => { setEquip(null); setBusca('') }}>Trocar</button>
          </div>
        ) : (
          <>
            <input style={c.input} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar por serial, marca ou modelo..." autoFocus />
            <div style={c.pickerLista}>
              {resultados.length === 0 ? (
                <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 13 }}>Nenhum equipamento &quot;Em stock&quot; encontrado.</div>
              ) : resultados.map((e) => (
                <button key={e.id} style={c.pickerItem} onClick={() => setEquip(e)}>
                  <strong>{e.serial_number ?? '—'}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{[e.marca, e.modelo, e.ano].filter(Boolean).join(' · ') || '—'}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <label style={c.label}>Cliente</label>
        <input style={c.input} list="clientes-picker-novo" value={clienteNome} onChange={(e) => aoMudarCliente(e.target.value)}
          placeholder="Escolher cliente da lista (opcional)" />
        <datalist id="clientes-picker-novo">
          {clientes.map((c2) => <option key={c2.id} value={c2.nome} />)}
        </datalist>
        {clienteNome && !clienteId && <span style={c.notaLigacao}>Este nome não está ligado a um cliente registado (fica só como texto).</span>}

        <label style={c.label}>Mercado (quadro)</label>
        <select style={c.input} value={mercado} onChange={(e) => setMercado(e.target.value as '' | Mercado)}>
          <option value="">Automático — pelo país do cliente{paisCliente ? ` (${paisCliente} → ${paisEhPT ? 'Nacional' : 'Internacional'})` : ' (sem país → Por classificar)'}</option>
          <option value="nacional">🇵🇹 Nacional (forçar)</option>
          <option value="internacional">🌍 Internacional (forçar)</option>
        </select>

        <label style={c.label}>Localização (cidade / país)</label>
        <input style={c.input} value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Porto, Portugal" />

        <div style={c.linha2}>
          <div>
            <label style={c.label}>Início</label>
            <input style={c.input} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label style={c.label}>Valor mensal (€)</label>
            <input style={c.input} type="number" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
          </div>
        </div>

        <label style={c.checkLinha}>
          <input type="checkbox" checked={renovacao} onChange={(e) => setRenovacao(e.target.checked)} />
          Renovação automática / mensal (sem data de fim)
        </label>

        {!renovacao && (
          <>
            <label style={c.label}>Fim previsto</label>
            <input style={c.input} type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </>
        )}

        <label style={c.label}>Notas</label>
        <textarea style={{ ...c.input, minHeight: 70, fontFamily: 'inherit' }} value={notas} onChange={(e) => setNotas(e.target.value)} />

        <div style={c.modalAcoes}>
          <button onClick={onFechar} style={c.btnGhost}>Cancelar</button>
          <button onClick={criar} disabled={aGuardar || !equip} style={c.btnPrimario}>{aGuardar ? 'A criar...' : 'Colocar em aluguer'}</button>
        </div>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  resumoGeral: { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', background: 'var(--accent-bg, #eef1f6)', borderRadius: 12, padding: '12px 18px', marginBottom: 14 },
  rgItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 },
  rgNum: { fontSize: 22, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 },
  rgLbl: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  rgSep: { width: 1, alignSelf: 'stretch', background: 'var(--border)' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  tab: { padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--foreground)', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  tabPC: { borderColor: '#F59E0B', color: '#B45309', background: '#FFFBEB' },
  tabPCAtiva: { background: '#B45309', color: '#fff', borderColor: '#B45309' },
  bannerPC: { display: 'block', width: '100%', textAlign: 'left', background: '#FFFBEB', border: '1px solid #F59E0B', color: '#92400E', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' },
  pcIntro: { fontSize: 13.5, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 },
  pcCartao: { border: '1px solid #F59E0B', borderRadius: 12, padding: 14, background: '#FFFDF6', display: 'flex', flexDirection: 'column', gap: 8 },
  pcTopo: { display: 'flex', flexDirection: 'column' },
  pcDestino: { fontSize: 13 },
  pcAcoes: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  pcBtnNac: { background: '#fff', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  pcBtnInt: { background: '#fff', border: '1px solid #2563EB', color: '#2563EB', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  pcBtnDet: { background: 'transparent', border: 'none', color: 'var(--muted)', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputPesq: { flex: 1, minWidth: 200, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  totais: { display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12, fontSize: 14 },
  avisoTotais: { color: 'var(--muted)', fontWeight: 400 },
  estado: { color: 'var(--muted)', padding: 10 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.6fr 1.3fr 1.3fr 1fr 0.9fr 1.3fr 0.9fr', gap: 8, padding: '10px 8px', fontSize: 13, borderBottom: '1px solid #f2f2f2', alignItems: 'center' },
  linhaDisp: { display: 'grid', gridTemplateColumns: '2fr 1.3fr 1fr', gap: 8, padding: '10px 8px', fontSize: 13, borderBottom: '1px solid #f2f2f2', alignItems: 'center' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  linhaClicavel: { cursor: 'pointer' },
  linhaTerminar: { background: '#FFFBEB' },
  linhaVencido: { background: '#FEF2F2' },
  equip: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  equipSn: { fontWeight: 700 },
  equipMarca: { color: 'var(--muted)', fontSize: 12 },
  badgeTerminar: { marginLeft: 6, background: '#FEF3C7', color: '#92400E', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeVencido: { marginLeft: 6, background: '#FEE2E2', color: '#B91C1C', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  cartoes: { display: 'grid', gap: 10 },
  cartao: { border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 4 },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cartaoLinha: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, marginTop: 2 },
  cartaoLabel: { color: 'var(--muted)' },
  grupoDispCab: { fontWeight: 700, fontSize: 14, marginBottom: 8 },
  dispEstado: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' },
  rodape: { marginTop: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 },
  // modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' },
  modalCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' },
  envInfo: { fontSize: 13.5, marginBottom: 10, lineHeight: 1.6 },
  mercadoTag: { fontWeight: 700 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, background: '#fff', color: 'var(--foreground)' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginTop: 12, cursor: 'pointer' },
  notaLigacao: { display: 'block', fontSize: 12, color: '#92400E', marginTop: 4 },
  linksCruzados: { display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 },
  linkCruzado: { color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 },
  erro: { background: 'var(--danger-bg, #fbecea)', color: 'var(--danger, #c0392b)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600, marginBottom: 8 },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, alignItems: 'center', flexWrap: 'wrap' },
  modalAcoesEsq: { display: 'flex', gap: 10, marginRight: 'auto', flexWrap: 'wrap' },
  btnGhost: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnGhostDanger: { background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnNovo: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  // picker de equipamento (novo aluguer)
  pickerLista: { border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', marginTop: 6 },
  pickerItem: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f2f2f2', background: '#fff', width: '100%', textAlign: 'left', font: 'inherit' },
  equipEscolhido: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1px solid var(--primary)', background: 'var(--accent-bg, #eef1f6)', borderRadius: 8, padding: '10px 12px', marginTop: 6 },
}
