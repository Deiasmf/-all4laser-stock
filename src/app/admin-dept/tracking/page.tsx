'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  listarCarriers, listarEnvios, criarEnvioManual, atualizarEnvio,
  eliminarEnvio, restaurarEnvio, numeroDaOrigem,
  carregarCartaPorte, urlCartaPorte, diasEmTransito,
  type FiltroEnvios, type EnvioInput,
} from '@/lib/tracking'
import {
  ESTADOS_ENVIO, estadoEnvioInfo, TIPOS_TRANSPORTE, tipoTransporteLabel, origemLabel,
  analisarAwb, detetarTransportadoraExpresso, detetarCompanhiaPorPrefixo,
  linkTrackingExpresso, linkAwbCarrier, TRACK_TRACE_AIRCARGO, DIAS_DESTAQUE,
  type Carrier, type ShipmentTracking, type TipoTransporte, type Direcao, type EstadoEnvio,
} from '@/types/tracking'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'
import UploadCartaPorte from './UploadCartaPorte'

const VAZIO: EnvioInput = {
  tracking_number: null, awb: null, awb_check_valido: null, tipo_transporte: 'expresso',
  carrier_id: null, carrier_nome: null, direcao: 'envio', descricao_conteudo: null,
  entidade_tipo: null, cliente_id: null, supplier_id: null, entidade_nome: null,
  estado: 'registado', data_expedicao: null, entrega_prevista: null, entrega_efetiva: null,
  notas: null, aeroporto_origem: null, aeroporto_destino: null, num_volumes: null, peso_kg: null,
}

function linkOrigem(e: ShipmentTracking): string | null {
  if (e.source_type === 'envios_pecas' && e.source_id) return `/logistico/envios-pecas/${e.source_id}`
  if (e.source_type === 'equipamentos' && e.source_id) return `/equipamentos/${e.source_id}`
  return null
}

// Verdadeiro em ecrãs estreitos (telemóvel/tablet) — a lista vira cartões.
function useEcraEstreito(limite = 860) {
  const [estreito, setEstreito] = useState(false)
  useEffect(() => {
    const verificar = () => setEstreito(window.innerWidth < limite)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [limite])
  return estreito
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar…</p>}>
      <TrackingConteudo />
    </Suspense>
  )
}

function TrackingConteudo() {
  const { perfil } = useAuth()
  const searchParams = useSearchParams()
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [lista, setLista] = useState<ShipmentTracking[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const [filtro, setFiltro] = useState<FiltroEnvios>({})
  const [procura, setProcura] = useState(searchParams.get('q') ?? '')
  const [mostrarEliminados, setMostrarEliminados] = useState(false)
  const estreito = useEcraEstreito()

  const [formAberto, setFormAberto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<EnvioInput>(VAZIO)
  const [aGravar, setAGravar] = useState(false)

  const draftKey = editId ? `tracking:${editId}` : 'tracking:novo'
  const { rascunhoRecuperado, descartar, limpar } = useFormDraft<EnvioInput>(
    draftKey, form, (d) => setForm(d), { enabled: formAberto, emptyState: VAZIO }
  )

  const carregar = useCallback(async () => {
    setACarregar(true)
    const f: FiltroEnvios = { ...filtro, procura: procura.trim() || undefined, eliminados: mostrarEliminados }
    const [cs, ls] = await Promise.all([listarCarriers(true), listarEnvios(f)])
    setCarriers(cs)
    setLista(ls)
    setACarregar(false)
  }, [filtro, procura, mostrarEliminados])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const carrierPorId = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers])

  // ── Deteção automática ao escrever tracking/AWB ─────────────────────────────
  function onTrackingChange(v: string) {
    const det = detetarTransportadoraExpresso(v, carriers)
    setForm((f) => ({
      ...f,
      tracking_number: v || null,
      carrier_id: det ? det.id : f.carrier_id,
      carrier_nome: det ? det.nome : f.carrier_nome,
    }))
  }
  function onAwbChange(v: string) {
    const info = analisarAwb(v)
    const comp = info.valido ? detetarCompanhiaPorPrefixo(info.prefixo, carriers) : null
    setForm((f) => ({
      ...f,
      awb: v || null,
      awb_check_valido: info.valido ? info.controloOk : null,
      carrier_id: comp ? comp.id : f.carrier_id,
      carrier_nome: comp ? comp.nome : f.carrier_nome,
    }))
  }

  const awbInfo = useMemo(() => analisarAwb(form.awb), [form.awb])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setFormAberto(true)
  }
  function abrirEdicao(e: ShipmentTracking) {
    setEditId(e.id)
    setForm({
      tracking_number: e.tracking_number, awb: e.awb, awb_check_valido: e.awb_check_valido,
      tipo_transporte: e.tipo_transporte, carrier_id: e.carrier_id, carrier_nome: e.carrier_nome,
      direcao: e.direcao, descricao_conteudo: e.descricao_conteudo, entidade_tipo: e.entidade_tipo,
      cliente_id: e.cliente_id, supplier_id: e.supplier_id, entidade_nome: e.entidade_nome,
      estado: e.estado, data_expedicao: e.data_expedicao, entrega_prevista: e.entrega_prevista,
      entrega_efetiva: e.entrega_efetiva, notas: e.notas, aeroporto_origem: e.aeroporto_origem,
      aeroporto_destino: e.aeroporto_destino, num_volumes: e.num_volumes, peso_kg: e.peso_kg,
    })
    setFormAberto(true)
  }
  function fechar() { setFormAberto(false); setEditId(null); setForm(VAZIO) }

  async function guardar() {
    setAGravar(true)
    const carrier = form.carrier_id ? carrierPorId.get(form.carrier_id) ?? null : null
    const patch: EnvioInput = { ...form, carrier_nome: carrier?.nome ?? form.carrier_nome }
    const res = editId
      ? await atualizarEnvio(editId, patch)
      : await criarEnvioManual(patch, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setAGravar(false)
    if (res.error) { setToast('Erro ao guardar: ' + res.error.message); return }
    limpar(); fechar(); carregar()
  }

  async function apagar(e: ShipmentTracking) {
    const ref = e.tracking_number || e.awb || '(sem nº)'
    const entidade = e.entidade_nome || 'entidade desconhecida'
    let msg = `Eliminar o tracking ${ref} de ${entidade}?\nEsta ação não pode ser desfeita.`
    // Se veio de um documento de origem (sincronizado), avisa da associação.
    if (e.origem !== 'manual' && e.source_id) {
      const num = await numeroDaOrigem(e.source_type, e.source_id)
      const doc = num ?? origemLabel(e.origem)
      msg = `Este tracking está associado a ${doc}.\n\n${msg}\n\nO documento de origem fica intacto (só sem tracking). Podes restaurar depois no filtro "Eliminados".`
    }
    if (!window.confirm(msg)) return
    const { error } = await eliminarEnvio(e.id, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    if (error) { setToast('Erro ao eliminar: ' + error); return }
    setToast('Tracking eliminado.'); carregar()
  }

  async function restaurar(e: ShipmentTracking) {
    const { error } = await restaurarEnvio(e.id)
    if (error) { setToast('Erro ao restaurar: ' + error); return }
    setToast('Tracking restaurado.'); carregar()
  }

  async function verTracking(e: ShipmentTracking) {
    const carrier = e.carrier_id ? carrierPorId.get(e.carrier_id) ?? null : null
    if (e.tipo_transporte === 'carga_aerea') {
      const direto = linkAwbCarrier(carrier, e.awb)
      if (direto) { window.open(direto, '_blank', 'noopener'); return }
      if (e.awb) {
        try { await navigator.clipboard.writeText(e.awb); setToast('AWB copiada — colar no campo de pesquisa') }
        catch { setToast('Copia a AWB manualmente: ' + e.awb) }
      }
      window.open(TRACK_TRACE_AIRCARGO, '_blank', 'noopener')
      return
    }
    const link = linkTrackingExpresso(carrier, e.tracking_number)
    if (link) window.open(link, '_blank', 'noopener')
    else setToast('Sem link de seguimento para esta transportadora.')
  }

  async function abrirCarta(e: ShipmentTracking) {
    const url = await urlCartaPorte(e)
    if (url) window.open(url, '_blank', 'noopener')
    else setToast('Sem carta de porte anexada.')
  }
  async function anexarCarta(e: ShipmentTracking, file: File) {
    const r = await carregarCartaPorte(e.id, file)
    if (!r.ok) { setToast('Erro ao anexar: ' + (r.motivo ?? '')); return }
    setToast('Carta de porte anexada.'); carregar()
  }

  function destaque(e: ShipmentTracking): boolean {
    if (e.origem_anulada) return false
    if (e.estado === 'problema') return true
    if (['registado', 'em_transito'].includes(e.estado)) {
      const dias = diasEmTransito(e.data_expedicao)
      const limite = e.tipo_transporte === 'carga_aerea' ? DIAS_DESTAQUE.carga_aerea : DIAS_DESTAQUE.expresso
      if (dias !== null && dias >= limite) return true
    }
    return false
  }

  const carriersExpresso = carriers.filter((c) => c.tipo === 'expresso')
  const carriersAereas = carriers.filter((c) => c.tipo === 'companhia_aerea')

  // Botões de ação por linha/cartão (reutilizado na tabela e nos cartões mobile).
  const acoes = (e: ShipmentTracking) => (
    mostrarEliminados ? (
      <>
        <button style={c.btnMini} title="Restaurar" onClick={() => restaurar(e)}>♻️</button>
        {e.deleted_by_nome && (
          <span style={c.eliminadoInfo} title={e.deleted_at ? new Date(e.deleted_at).toLocaleString('pt-PT') : ''}>
            por {e.deleted_by_nome}
          </span>
        )}
      </>
    ) : (
      <>
        <button style={c.btnMini} title="Ver tracking" onClick={() => verTracking(e)}>🔎</button>
        <button style={c.btnMini} title="Editar" onClick={() => abrirEdicao(e)}>✏️</button>
        <button style={c.btnMini} title="Abrir carta de porte" onClick={() => abrirCarta(e)}>📄</button>
        <label style={c.btnMini} title="Anexar carta de porte">📎
          <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
            onChange={(ev) => { const f = ev.target.files?.[0]; if (f) anexarCarta(e, f) }} />
        </label>
        <button style={c.btnMini} title="Eliminar" onClick={() => apagar(e)}>🗑️</button>
      </>
    )
  )

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <p style={c.subtitulo}>Todos os envios com tracking / AWB / carta de porte. Sincroniza automaticamente a partir dos Envios de Encomendas e dos Equipamentos. <Link href="/admin-dept/tracking/extracoes" style={c.link}>Log de extrações ↗</Link></p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <UploadCartaPorte
            carriers={carriers}
            perfil={{ id: perfil?.id ?? null, nome: perfil?.nome ?? null }}
            onConcluido={(msg) => { setToast(msg); carregar() }}
          />
          <button style={c.btnPrimario} onClick={abrirNovo}>+ Novo envio</button>
        </div>
      </div>

      {/* Filtros */}
      <section style={c.filtros}>
        <input style={c.procura} placeholder="Procurar por tracking, AWB ou entidade…" value={procura} onChange={(e) => setProcura(e.target.value)} />
        <select style={c.select} value={filtro.estado ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, estado: (e.target.value || undefined) as EstadoEnvio | undefined }))}>
          <option value="">Estado: todos</option>
          {ESTADOS_ENVIO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <select style={c.select} value={filtro.tipo ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, tipo: (e.target.value || undefined) as TipoTransporte | undefined }))}>
          <option value="">Tipo: todos</option>
          {TIPOS_TRANSPORTE.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>
        <select style={c.select} value={filtro.direcao ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, direcao: (e.target.value || undefined) as Direcao | undefined }))}>
          <option value="">Direção: todas</option>
          <option value="envio">Envio</option>
          <option value="rececao">Receção</option>
        </select>
        <select style={c.select} value={filtro.carrierId ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, carrierId: e.target.value || undefined }))}>
          <option value="">Transportadora: todas</option>
          {carriers.map((cr) => <option key={cr.id} value={cr.id}>{cr.nome}</option>)}
        </select>
        <input style={c.data} type="date" value={filtro.de ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, de: e.target.value || undefined }))} title="Expedido de" />
        <input style={c.data} type="date" value={filtro.ate ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, ate: e.target.value || undefined }))} title="Expedido até" />
        {(filtro.estado || filtro.tipo || filtro.direcao || filtro.carrierId || filtro.de || filtro.ate || procura) && (
          <button style={c.btnLimpar} onClick={() => { setFiltro({}); setProcura('') }}>Limpar</button>
        )}
        <button
          style={mostrarEliminados ? c.btnToggleOn : c.btnLimpar}
          onClick={() => setMostrarEliminados((v) => !v)}
          title="Ver os trackings eliminados"
        >
          {mostrarEliminados ? '↩ Voltar aos ativos' : '🗑️ Eliminados'}
        </button>
      </section>

      {mostrarEliminados && !aCarregar && lista.length > 0 && (
        <p style={c.avisoEliminados}>A mostrar trackings eliminados. Os documentos de origem ficaram intactos. Podes restaurar (♻️).</p>
      )}

      {/* Lista: tabela (desktop) ou cartões (mobile) */}
      {aCarregar ? (
        <p style={c.muted}>A carregar…</p>
      ) : lista.length === 0 ? (
        <p style={c.muted}>{mostrarEliminados ? 'Sem trackings eliminados.' : 'Sem envios para os filtros escolhidos.'}</p>
      ) : estreito ? (
        <div style={c.cards}>
          {lista.map((e) => {
            const est = estadoEnvioInfo(e.estado)
            const dias = diasEmTransito(e.data_expedicao)
            const org = linkOrigem(e)
            return (
              <div key={e.id} style={{ ...c.card, ...(destaque(e) ? c.cardDestaque : {}), ...(e.origem_anulada ? c.trAnulada : {}) }}>
                <div style={c.cardTitulo}>
                  <span>{e.entidade_nome ?? '—'}</span>
                  <span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>
                </div>
                <div style={c.cardLinha}><span style={c.cardRot}>Transportadora</span><span>{e.carrier_nome ?? '—'}</span></div>
                <div style={c.cardLinha}><span style={c.cardRot}>AWB / Tracking</span><span style={c.mono}>{e.tracking_number || e.awb || '—'}</span></div>
                {e.awb && e.awb_check_valido === false && <div style={c.avisoMini}>⚠ AWB inválida</div>}
                <div style={c.cardMeta}>
                  {tipoTransporteLabel(e.tipo_transporte)} · {e.direcao === 'envio' ? 'Envio ↑' : 'Receção ↓'}
                  {e.descricao_conteudo ? ` · ${e.descricao_conteudo}` : ''}
                  {dias !== null && ['registado', 'em_transito'].includes(e.estado) ? ` · ${dias}d` : ''}
                </div>
                <div style={c.cardMeta}>
                  {org ? <Link href={org} style={c.link}>{origemLabel(e.origem)} ↗</Link> : origemLabel(e.origem)}
                  {e.data_expedicao ? ` · exp. ${e.data_expedicao}` : ''}
                  {e.origem_anulada ? ' · origem anulada' : ''}
                </div>
                <div style={c.cardAcoes}>{acoes(e)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>Entidade</th>
                <th style={c.th}>Transportadora</th>
                <th style={c.th}>AWB / Tracking</th>
                <th style={c.th}>Tipo</th>
                <th style={c.th}>Dir.</th>
                <th style={c.th}>Conteúdo</th>
                <th style={c.th}>Origem</th>
                <th style={c.th}>Estado</th>
                <th style={c.th}>Expedição</th>
                <th style={c.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const est = estadoEnvioInfo(e.estado)
                const dias = diasEmTransito(e.data_expedicao)
                const org = linkOrigem(e)
                return (
                  <tr key={e.id} style={{ ...c.tr, ...(destaque(e) ? c.trDestaque : {}), ...(e.origem_anulada ? c.trAnulada : {}) }}>
                    <td style={c.td}>{e.entidade_nome ?? '—'}</td>
                    <td style={c.td}>{e.carrier_nome ?? '—'}</td>
                    <td style={c.td}>
                      <div style={c.mono}>{e.tracking_number || e.awb || '—'}</div>
                      {e.awb && e.awb_check_valido === false && <div style={c.avisoMini} title="Dígito de controlo da AWB inválido">⚠ AWB inválida</div>}
                    </td>
                    <td style={c.td}>{tipoTransporteLabel(e.tipo_transporte)}</td>
                    <td style={c.td}>{e.direcao === 'envio' ? '↑' : '↓'}</td>
                    <td style={c.td}>{e.descricao_conteudo ?? '—'}</td>
                    <td style={c.td}>
                      {org ? <Link href={org} style={c.link}>{origemLabel(e.origem)} ↗</Link> : origemLabel(e.origem)}
                      {e.origem_anulada && <div style={c.avisoMini}>origem anulada</div>}
                    </td>
                    <td style={c.td}><span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>
                      {dias !== null && ['registado', 'em_transito'].includes(e.estado) && <div style={c.diasMini}>{dias}d</div>}
                    </td>
                    <td style={c.td}>{e.data_expedicao ?? '—'}</td>
                    <td style={c.tdAcoes}>{acoes(e)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Formulário (criar/editar) */}
      {formAberto && (
        <div style={c.overlay} onClick={fechar}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={c.modalTopo}>
              <strong>{editId ? 'Editar envio' : 'Novo envio'}</strong>
              <button style={c.btnFechar} onClick={fechar}>✕</button>
            </div>
            {rascunhoRecuperado && <RascunhoAviso onDescartar={descartar} />}

            <div style={c.grelha}>
              <label style={c.campo}><span style={c.rot}>Tipo</span>
                <select style={c.input} value={form.tipo_transporte} onChange={(e) => setForm((f) => ({ ...f, tipo_transporte: e.target.value as TipoTransporte }))}>
                  {TIPOS_TRANSPORTE.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                </select>
              </label>
              <label style={c.campo}><span style={c.rot}>Direção</span>
                <select style={c.input} value={form.direcao} onChange={(e) => setForm((f) => ({ ...f, direcao: e.target.value as Direcao }))}>
                  <option value="envio">Envio</option>
                  <option value="rececao">Receção</option>
                </select>
              </label>

              {form.tipo_transporte !== 'carga_aerea' && (
                <label style={c.campo}><span style={c.rot}>Nº de tracking</span>
                  <input style={c.input} value={form.tracking_number ?? ''} placeholder="Ex.: 1Z999AA10123456784"
                    onChange={(e) => onTrackingChange(e.target.value)} />
                </label>
              )}
              {form.tipo_transporte !== 'expresso' && (
                <label style={c.campo}><span style={c.rot}>AWB</span>
                  <input style={c.input} value={form.awb ?? ''} placeholder="Ex.: 074-12345678"
                    onChange={(e) => onAwbChange(e.target.value)} />
                  {form.awb && awbInfo.valido && (
                    <span style={awbInfo.controloOk ? c.okMini : c.avisoMini}>
                      {awbInfo.controloOk ? '✓ dígito de controlo válido' : `⚠ dígito de controlo inválido (esperado ${awbInfo.digitoEsperado})`}
                    </span>
                  )}
                  {form.awb && !awbInfo.valido && <span style={c.avisoMini}>⚠ formato XXX-XXXXXXXX não reconhecido</span>}
                </label>
              )}

              <label style={c.campo}><span style={c.rot}>Transportadora / companhia</span>
                <select style={c.input} value={form.carrier_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, carrier_id: e.target.value || null }))}>
                  <option value="">— (auto-detetar)</option>
                  <optgroup label="Expresso">
                    {carriersExpresso.map((cr) => <option key={cr.id} value={cr.id}>{cr.nome}</option>)}
                  </optgroup>
                  <optgroup label="Carga aérea">
                    {carriersAereas.map((cr) => <option key={cr.id} value={cr.id}>{cr.nome}{cr.prefixo_awb ? ` (${cr.prefixo_awb})` : ''}</option>)}
                  </optgroup>
                </select>
              </label>
              <label style={c.campo}><span style={c.rot}>Estado</span>
                <select style={c.input} value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoEnvio }))}>
                  {ESTADOS_ENVIO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                </select>
              </label>

              <label style={c.campo}><span style={c.rot}>Entidade</span>
                <input style={c.input} value={form.entidade_nome ?? ''} placeholder="Cliente ou fornecedor"
                  onChange={(e) => setForm((f) => ({ ...f, entidade_nome: e.target.value || null }))} />
              </label>
              <label style={c.campo}><span style={c.rot}>Tipo de entidade</span>
                <select style={c.input} value={form.entidade_tipo ?? ''} onChange={(e) => setForm((f) => ({ ...f, entidade_tipo: (e.target.value || null) as 'cliente' | 'fornecedor' | null }))}>
                  <option value="">—</option>
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                </select>
              </label>

              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Conteúdo</span>
                <input style={c.input} value={form.descricao_conteudo ?? ''} placeholder="Descrição do que vai no envio"
                  onChange={(e) => setForm((f) => ({ ...f, descricao_conteudo: e.target.value || null }))} />
              </label>

              <label style={c.campo}><span style={c.rot}>Data de expedição</span>
                <input style={c.input} type="date" value={form.data_expedicao ?? ''} onChange={(e) => setForm((f) => ({ ...f, data_expedicao: e.target.value || null }))} />
              </label>
              <label style={c.campo}><span style={c.rot}>Entrega prevista</span>
                <input style={c.input} type="date" value={form.entrega_prevista ?? ''} onChange={(e) => setForm((f) => ({ ...f, entrega_prevista: e.target.value || null }))} />
              </label>

              {form.tipo_transporte === 'carga_aerea' && (
                <>
                  <label style={c.campo}><span style={c.rot}>Aeroporto origem</span>
                    <input style={c.input} value={form.aeroporto_origem ?? ''} placeholder="Ex.: LIS"
                      onChange={(e) => setForm((f) => ({ ...f, aeroporto_origem: e.target.value || null }))} />
                  </label>
                  <label style={c.campo}><span style={c.rot}>Aeroporto destino</span>
                    <input style={c.input} value={form.aeroporto_destino ?? ''} placeholder="Ex.: GRU"
                      onChange={(e) => setForm((f) => ({ ...f, aeroporto_destino: e.target.value || null }))} />
                  </label>
                  <label style={c.campo}><span style={c.rot}>Nº de volumes</span>
                    <input style={c.input} type="number" value={form.num_volumes ?? ''} onChange={(e) => setForm((f) => ({ ...f, num_volumes: e.target.value ? Number(e.target.value) : null }))} />
                  </label>
                  <label style={c.campo}><span style={c.rot}>Peso (kg)</span>
                    <input style={c.input} type="number" value={form.peso_kg ?? ''} onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value ? Number(e.target.value) : null }))} />
                  </label>
                </>
              )}

              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Notas</span>
                <textarea style={{ ...c.input, minHeight: 60 }} value={form.notas ?? ''} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value || null }))} />
              </label>
            </div>

            <div style={c.modalAcoes}>
              <button style={c.btnSecundario} onClick={fechar} disabled={aGravar}>Cancelar</button>
              <button style={c.btnPrimario} onClick={guardar} disabled={aGravar}>{aGravar ? 'A guardar…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1280, margin: '0 auto' },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  subtitulo: { color: 'var(--muted)', fontSize: 13, maxWidth: 720 },
  filtros: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  procura: { flex: '1 1 240px', minWidth: 200, padding: '8px 10px', border: '1px solid var(--borda, #d1d5db)', borderRadius: 8, font: 'inherit' },
  select: { padding: '8px 10px', border: '1px solid var(--borda, #d1d5db)', borderRadius: 8, font: 'inherit', background: '#fff' },
  data: { padding: '8px 10px', border: '1px solid var(--borda, #d1d5db)', borderRadius: 8, font: 'inherit' },
  btnLimpar: { padding: '8px 12px', border: '1px solid var(--borda, #d1d5db)', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  btnToggleOn: { padding: '8px 12px', border: '1px solid #111827', borderRadius: 8, background: '#111827', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 700 },
  avisoEliminados: { background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 },
  eliminadoInfo: { fontSize: 12, color: 'var(--muted)', marginLeft: 6 },
  cards: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { border: '1px solid #eee', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: '#fff' },
  cardDestaque: { background: '#FEF3C7', borderColor: '#F59E0B' },
  cardAnulada: { opacity: 0.55 },
  cardTitulo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 },
  cardLinha: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 },
  cardRot: { color: 'var(--muted)', fontWeight: 600 },
  cardMeta: { fontSize: 12, color: 'var(--muted)' },
  cardAcoes: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  trDestaque: { background: '#FEF3C7' },
  trAnulada: { opacity: 0.55, textDecoration: 'line-through' },
  td: { padding: '8px', verticalAlign: 'top' },
  tdAcoes: { padding: '8px', whiteSpace: 'nowrap' },
  mono: { fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
  diasMini: { fontSize: 11, color: 'var(--muted)', marginTop: 2 },
  avisoMini: { fontSize: 11, color: '#B91C1C', marginTop: 2 },
  okMini: { fontSize: 11, color: '#065F46', marginTop: 2 },
  link: { color: '#2563EB', textDecoration: 'none' },
  btnMini: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', marginRight: 4, fontSize: 14 },
  btnPrimario: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSecundario: { padding: '9px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 50 },
  modal: { background: '#fff', borderRadius: 12, padding: 16, width: 'min(720px, 100%)', marginTop: 24 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  btnFechar: { border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
}
