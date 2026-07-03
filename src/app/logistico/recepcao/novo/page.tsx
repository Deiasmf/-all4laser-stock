'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  listarClientesEnvio, criarClienteEnvio, listarFuncionarios,
  type ClienteEnvioOpc,
} from '@/lib/enviosPecas'
import { pesquisarPecas } from '@/lib/pecas'
import { pesquisarEquipamentos, type EquipOpc } from '@/lib/folhasObra'
import { criarProcesso } from '@/lib/processosPecas'
import type { Peca } from '@/types/peca'
import {
  FLUXOS, TIPOS_GARANTIA, RESPONSAVEIS_PAGAMENTO, RESPONSAVEL_POR_GARANTIA, substitutaEhPermanente,
  type TipoFluxo, type TipoGarantia, type ResponsavelPagamento, type ProcessoItemInput,
} from '@/types/processoPeca'

export default function NovoProcessoPage() {
  const router = useRouter()
  const { perfil } = useAuth()

  const [fluxo, setFluxo] = useState<TipoFluxo | null>(null)

  // Cliente
  const [clientes, setClientes] = useState<ClienteEnvioOpc[]>([])
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [avaria, setAvaria] = useState('')

  // Peça
  const [pecaId, setPecaId] = useState<string | null>(null)
  const [pecaDescricao, setPecaDescricao] = useState('')
  const [temSn, setTemSn] = useState(false)
  const [snAvariado, setSnAvariado] = useState('')
  const [equipSn, setEquipSn] = useState('')
  const [equipId, setEquipId] = useState<string | null>(null)
  const [itens, setItens] = useState<ProcessoItemInput[]>([])
  const [itemNome, setItemNome] = useState('')
  const [itemQtd, setItemQtd] = useState('1')

  // Garantia
  const [emGarantia, setEmGarantia] = useState(false)
  const [tipoGarantia, setTipoGarantia] = useState<TipoGarantia>('sem_garantia')
  const [responsavel, setResponsavel] = useState<ResponsavelPagamento>('cliente')
  const [valorEstimado, setValorEstimado] = useState('')

  // Substituta
  const [subPecaId, setSubPecaId] = useState<string | null>(null)
  const [subDescricao, setSubDescricao] = useState('')
  const [subTemSn, setSubTemSn] = useState(false)
  const [subSn, setSubSn] = useState('')

  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarClientesEnvio().then(setClientes) }, [])
  useEffect(() => { listarFuncionarios() }, [])

  const buscarCliente = useCallback(async (q: string): Promise<ClienteEnvioOpc[]> => {
    const t = q.trim().toLowerCase()
    return (t ? clientes.filter((cl) => cl.nome.toLowerCase().includes(t)) : clientes).slice(0, 50)
  }, [clientes])

  async function adicionarCliente(nome: string) {
    const existente = clientes.find((cl) => cl.nome.trim().toLowerCase() === nome.trim().toLowerCase())
    if (existente) { setClienteId(existente.id); setClienteNome(existente.nome); return }
    const novo = await criarClienteEnvio(nome, '', '')
    if (!novo) { setErro('Não foi possível adicionar o cliente.'); return }
    setClientes((p) => [...p, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
    setClienteId(novo.id); setClienteNome(novo.nome)
  }

  function escolherGarantia(g: TipoGarantia) {
    setTipoGarantia(g)
    setResponsavel(RESPONSAVEL_POR_GARANTIA[g])
  }

  function adicionarItem() {
    const nome = itemNome.trim()
    if (!nome) return
    setItens((p) => [...p, { descricao: nome, quantidade: Math.max(1, Number(itemQtd) || 1) }])
    setItemNome(''); setItemQtd('1')
  }

  async function submeter() {
    setErro(null)
    if (!fluxo) { setErro('Escolhe o tipo de processo.'); return }
    if (!clienteNome.trim()) { setErro('Indica o cliente.'); return }
    if (!pecaDescricao.trim()) { setErro('Indica a peça.'); return }
    setAGuardar(true)
    const { data, error } = await criarProcesso(
      {
        tipo_fluxo: fluxo,
        cliente_id: clienteId,
        cliente_nome: clienteNome.trim(),
        peca_id: pecaId,
        peca_descricao: pecaDescricao.trim(),
        tem_sn: temSn,
        sn_avariado: temSn ? (snAvariado.trim() || null) : null,
        equipamento_id: equipId,
        equipamento_sn: equipSn.trim() || null,
        em_garantia: emGarantia,
        tipo_garantia: tipoGarantia,
        responsavel_pagamento: emGarantia ? null : responsavel,
        valor_a_faturar: emGarantia ? null : (valorEstimado.trim() === '' ? null : Number(valorEstimado)),
        substituta_peca_id: subPecaId,
        substituta_descricao: subDescricao.trim() || null,
        sn_substituto: subTemSn ? (subSn.trim() || null) : null,
        substituta_permanente: substitutaEhPermanente(fluxo),
        notas: [avaria.trim() ? `Avaria: ${avaria.trim()}` : '', notas.trim()].filter(Boolean).join('\n') || null,
      },
      temSn ? [] : itens,
      perfil?.id ?? null,
      perfil?.nome ?? perfil?.email ?? null
    )
    setAGuardar(false)
    if (error || !data) { setErro('Erro ao criar o processo: ' + (error?.message ?? '')); return }
    router.push(`/logistico/recepcao/${data.id}`)
  }

  return (
    <main style={f.page}>
      <div style={f.cabecalho}>
        <h1 style={f.titulo}>Novo Processo de Peças</h1>
        <Link href="/logistico/recepcao" style={f.voltar}>← Processos</Link>
      </div>

      {/* PASSO 1 — Tipo de processo */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>1. Tipo de processo</div>
        <div style={f.fluxoGrid}>
          {FLUXOS.map((fl) => (
            <button
              key={fl.valor}
              type="button"
              onClick={() => setFluxo(fl.valor)}
              style={{ ...f.fluxoCard, ...(fluxo === fl.valor ? f.fluxoCardAtivo : {}) }}
            >
              <div style={f.fluxoIcon}>{fl.icon}</div>
              <div style={f.fluxoLabel}>{fl.label}</div>
              <div style={f.fluxoDesc}>{fl.descricao}</div>
            </button>
          ))}
        </div>
      </section>

      {fluxo && (
        <>
          {/* PASSO 2 — Dados gerais */}
          <section style={f.seccao}>
            <div style={f.seccaoTitulo}>2. Dados gerais</div>
            <Campo rotulo="Cliente *">
              <Autocomplete
                valor={clienteNome}
                placeholder="Escolher da lista ou escrever..."
                buscar={buscarCliente}
                onChangeTexto={(v) => { setClienteNome(v); setClienteId(null) }}
                onEscolher={(cl) => { setClienteNome(cl.nome); setClienteId(cl.id) }}
                render={(cl) => `${cl.nome}${cl.pais ? ` · ${cl.pais}` : ''}`}
                chaveTexto={(cl) => cl.nome}
                onTextoNovo={adicionarCliente}
                textoNovoRotulo={(t) => `➕ Adicionar «${t}» como novo cliente`}
              />
            </Campo>
            <Campo rotulo="Descrição da avaria">
              <textarea value={avaria} onChange={(e) => setAvaria(e.target.value)} style={f.textarea} placeholder="O que se passa com a peça..." />
            </Campo>
          </section>

          {/* PASSO 3 — Peça */}
          <section style={f.seccao}>
            <div style={f.seccaoTitulo}>3. Peça</div>
            <Campo rotulo="Peça (procurar no stock ou escrever) *">
              <Autocomplete
                valor={pecaDescricao}
                placeholder="Escreve para procurar..."
                buscar={(q) => pesquisarPecas(q)}
                onChangeTexto={(v) => { setPecaDescricao(v); setPecaId(null) }}
                onEscolher={(p) => { setPecaDescricao(p.nome); setPecaId(p.id); if (p.serial_number) { setTemSn(true); setSnAvariado(p.serial_number) } }}
                render={(p) => `${p.nome}${p.serial_number ? ` · S/N ${p.serial_number}` : ''}${p.marca ? ` · ${p.marca}` : ''}`}
                chaveTexto={(p) => p.nome}
              />
            </Campo>
            <label style={f.checkLinha}>
              <input type="checkbox" checked={temSn} onChange={(e) => setTemSn(e.target.checked)} />
              <span>Esta peça tem Serial Number?</span>
            </label>
            {temSn ? (
              <Campo rotulo="S/N da peça avariada">
                <input value={snAvariado} onChange={(e) => setSnAvariado(e.target.value)} style={f.input} placeholder="Serial number..." />
              </Campo>
            ) : (
              <div>
                <div style={f.rotulo}>Itens (peças sem S/N)</div>
                <div style={f.manualLinha}>
                  <input value={itemNome} onChange={(e) => setItemNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarItem() } }} placeholder="Ex.: Fibra 18mm" style={{ ...f.input, flex: 1 }} />
                  <input type="number" min={1} value={itemQtd} onChange={(e) => setItemQtd(e.target.value)} style={{ ...f.input, width: 90 }} />
                  <button type="button" onClick={adicionarItem} style={f.btnAdd}>Adicionar</button>
                </div>
                {itens.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {itens.map((it, i) => (
                      <div key={i} style={f.itemLinha}>
                        <span>{it.descricao}</span>
                        <span style={f.muted}>× {it.quantidade}</span>
                        <button type="button" onClick={() => setItens((p) => p.filter((_, idx) => idx !== i))} style={f.btnX}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Campo rotulo="Equipamento associado (procurar por S/N — opcional)">
              <div style={{ position: 'relative' }}>
                <input value={equipSn} onChange={(e) => { setEquipSn(e.target.value); setEquipId(null) }} style={f.input} placeholder="S/N do equipamento..." />
                <EquipDropdown valor={equipSn} equipId={equipId} onEscolher={(eq) => { setEquipSn(eq.serial_number ?? ''); setEquipId(eq.id) }} />
              </div>
            </Campo>
          </section>

          {/* PASSO 4 — Garantia */}
          <section style={f.seccao}>
            <div style={f.seccaoTitulo}>4. Garantia</div>
            <label style={f.checkLinha}>
              <input type="checkbox" checked={emGarantia} onChange={(e) => setEmGarantia(e.target.checked)} />
              <span>Dentro de garantia?</span>
            </label>
            <Campo rotulo="Tipo de garantia">
              <select value={tipoGarantia} onChange={(e) => escolherGarantia(e.target.value as TipoGarantia)} style={f.input}>
                {TIPOS_GARANTIA.map((g) => <option key={g.valor} value={g.valor}>{g.label}</option>)}
              </select>
            </Campo>
            {!emGarantia && (
              <div style={f.grid2}>
                <Campo rotulo="Responsável pelo pagamento">
                  <select value={responsavel} onChange={(e) => setResponsavel(e.target.value as ResponsavelPagamento)} style={f.input}>
                    {RESPONSAVEIS_PAGAMENTO.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Valor estimado (€)">
                  <input type="number" step="0.01" value={valorEstimado} onChange={(e) => setValorEstimado(e.target.value)} style={f.input} placeholder="0.00" />
                </Campo>
              </div>
            )}
          </section>

          {/* PASSO 5 — Peça substituta */}
          <section style={f.seccao}>
            <div style={f.seccaoTitulo}>5. Peça substituta</div>
            <div style={f.aviso}>
              {substitutaEhPermanente(fluxo)
                ? '⚠️ Esta peça sai do stock definitivamente.'
                : '🔄 Esta peça é de cortesia e deve ser devolvida.'}
            </div>
            <Campo rotulo="Peça substituta (do stock ou escrever)">
              <Autocomplete
                valor={subDescricao}
                placeholder="Escreve para procurar..."
                buscar={(q) => pesquisarPecas(q)}
                onChangeTexto={(v) => { setSubDescricao(v); setSubPecaId(null) }}
                onEscolher={(p) => { setSubDescricao(p.nome); setSubPecaId(p.id); if (p.serial_number) { setSubTemSn(true); setSubSn(p.serial_number) } }}
                render={(p) => `${p.nome}${p.serial_number ? ` · S/N ${p.serial_number}` : ''}`}
                chaveTexto={(p) => p.nome}
              />
            </Campo>
            <label style={f.checkLinha}>
              <input type="checkbox" checked={subTemSn} onChange={(e) => setSubTemSn(e.target.checked)} />
              <span>A substituta tem Serial Number?</span>
            </label>
            {subTemSn && (
              <Campo rotulo="S/N da substituta">
                <input value={subSn} onChange={(e) => setSubSn(e.target.value)} style={f.input} placeholder="Serial number..." />
              </Campo>
            )}
          </section>

          <section style={f.seccao}>
            <div style={f.seccaoTitulo}>Notas</div>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={f.textarea} />
          </section>

          {erro && <div style={f.erro}>{erro}</div>}

          <div style={f.acoes}>
            <button onClick={submeter} disabled={aGuardar} className="a4l-btn" style={f.btnPrimario}>
              {aGuardar ? 'A criar...' : 'Criar Processo'}
            </button>
          </div>
        </>
      )}
      {!fluxo && <p style={f.ajuda}>Escolhe um tipo de processo acima para continuar.</p>}
    </main>
  )
}

function EquipDropdown({ valor, equipId, onEscolher }: { valor: string; equipId: string | null; onEscolher: (eq: EquipOpc) => void }) {
  const [resultados, setResultados] = useState<EquipOpc[]>([])
  useEffect(() => {
    if (equipId) { setResultados([]); return }
    const t = setTimeout(async () => setResultados(await pesquisarEquipamentos(valor)), 250)
    return () => clearTimeout(t)
  }, [valor, equipId])
  if (equipId || resultados.length === 0) return null
  return (
    <div style={f.dropdown}>
      {resultados.map((eq) => (
        <button key={eq.id} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(eq) }} style={f.opcao}>
          {eq.modelo || '—'}{eq.serial_number ? ` · S/N ${eq.serial_number}` : ''}
        </button>
      ))}
    </div>
  )
}

function Autocomplete<T>({
  valor, placeholder, buscar, onChangeTexto, onEscolher, render, chaveTexto, onTextoNovo, textoNovoRotulo,
}: {
  valor: string
  placeholder?: string
  buscar: (q: string) => Promise<T[]>
  onChangeTexto: (v: string) => void
  onEscolher: (item: T) => void
  render: (item: T) => string
  chaveTexto?: (item: T) => string
  onTextoNovo?: (texto: string) => void
  textoNovoRotulo?: (texto: string) => string
}) {
  const [texto, setTexto] = useState(valor)
  const [resultados, setResultados] = useState<T[]>([])
  const [aberto, setAberto] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTexto(valor) }, [valor])
  useEffect(() => {
    const t = setTimeout(async () => setResultados(await buscar(texto)), 250)
    return () => clearTimeout(t)
  }, [texto, buscar])
  const textoTrim = texto.trim()
  const correspExata = resultados.some((r) => (chaveTexto ? chaveTexto(r) : render(r)).trim().toLowerCase() === textoTrim.toLowerCase())
  const rotuloCriar = onTextoNovo && textoTrim && !correspExata ? (textoNovoRotulo ? textoNovoRotulo(textoTrim) : `Usar «${textoTrim}»`) : null
  return (
    <div style={{ position: 'relative' }}>
      <input value={texto} placeholder={placeholder} onChange={(e) => { setTexto(e.target.value); onChangeTexto(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} style={f.input} />
      {aberto && (resultados.length > 0 || rotuloCriar) && (
        <div style={f.dropdown}>
          {rotuloCriar && <button type="button" onMouseDown={(e) => { e.preventDefault(); onTextoNovo!(textoTrim); setAberto(false) }} style={f.opcaoCriar}>{rotuloCriar}</button>}
          {resultados.map((item, i) => (
            <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(item); setAberto(false) }} style={f.opcao}>{render(item)}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label style={f.campo}><span style={f.rotulo}>{rotulo}</span>{children}</label>
}

const f: Record<string, React.CSSProperties> = {
  page: { maxWidth: 880, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  seccao: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  seccaoTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  fluxoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  fluxoCard: { textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 },
  fluxoCardAtivo: { borderColor: 'var(--primary)', background: 'var(--accent-bg, #ece8fb)' },
  fluxoIcon: { fontSize: 26 },
  fluxoLabel: { fontWeight: 700, color: 'var(--primary-dark)' },
  fluxoDesc: { fontSize: 12.5, color: 'var(--muted)' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 60, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  manualLinha: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  itemLinha: { display: 'grid', gridTemplateColumns: '1fr auto 28px', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 14, borderBottom: '1px solid #f2f2f2' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  btnAdd: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnX: { background: 'transparent', border: 'none', color: '#c62828', fontSize: 18, cursor: 'pointer', lineHeight: 1 },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' },
  opcao: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--foreground)' },
  opcaoCriar: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'var(--background)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--primary)', fontWeight: 600 },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600 },
  ajuda: { fontSize: 13, color: 'var(--muted)' },
  acoes: { display: 'flex', gap: 10 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
}
