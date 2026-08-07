'use client'

// Upload de carta de porte (PDF/foto) com extração AI e criação do envio.
// Aceita vários ficheiros de uma vez, processados em fila — cada um abre o seu
// ecrã de confirmação (documento à esquerda, formulário pré-preenchido à
// direita, badges de confiança por campo). Trata duplicados e extração parcial.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { criarEnvioUpload, carregarCartaPorte, type EnvioInput } from '@/lib/tracking'
import { analisarAwb, TIPOS_TRANSPORTE, ESTADOS_ENVIO, type Carrier, type TipoTransporte, type Direcao, type EstadoEnvio } from '@/types/tracking'
import type { Confianca, RespostaExtracao, EnvioDuplicado } from '@/types/cartaPorte'

const VAZIO: EnvioInput = {
  tracking_number: null, awb: null, awb_check_valido: null, tipo_transporte: 'expresso',
  carrier_id: null, carrier_nome: null, direcao: 'envio', descricao_conteudo: null,
  entidade_tipo: null, cliente_id: null, supplier_id: null, entidade_nome: null,
  estado: 'registado', data_expedicao: null, entrega_prevista: null, entrega_efetiva: null,
  notas: null, aeroporto_origem: null, aeroporto_destino: null, num_volumes: null, peso_kg: null,
}

const TIPOS_ACEITES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const LIMITE_MB = 10

type Atual = {
  file: File
  previewUrl: string
  resposta: RespostaExtracao
  form: EnvioInput
  epSelecionada: string | null   // EP a associar ao confirmar (ponto 10)
}

type Props = {
  carriers: Carrier[]
  perfil: { id: string | null; nome: string | null }
  onConcluido: (msg: string) => void
}

function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*;base64,/, ''))
    r.onerror = () => reject(r.error ?? new Error('Falha ao ler o ficheiro.'))
    r.readAsDataURL(file)
  })
}

function respostaVazia(): RespostaExtracao {
  return {
    ok: true, parcial: true, erro: null, sugestao: { ...VAZIO }, confianca: {},
    extraido: {
      transportadora: null, tipo_transporte: null, tracking_number: null, awb: null,
      remetente_nome: null, remetente_morada: null, remetente_pais: null,
      destinatario_nome: null, destinatario_morada: null, destinatario_pais: null,
      num_volumes: null, peso_kg: null, dimensoes: null, data_expedicao: null, servico: null, confianca: {},
    },
    duplicado: null, sugestoesEp: [], avisos: [],
  }
}

export default function UploadCartaPorte({ carriers, perfil, onConcluido }: Props) {
  const filaRef = useRef<File[]>([])                 // ficheiros por processar
  const ocupadoRef = useRef(false)                   // há extração/confirmação a decorrer
  const [restantes, setRestantes] = useState(0)      // ficheiros ainda em fila (para o rótulo)
  const [totalLote, setTotalLote] = useState(0)      // nº de ficheiros do lote atual
  const [feitos, setFeitos] = useState(0)            // nº já tratados no lote
  const [aExtrair, setAExtrair] = useState(false)
  const [atual, setAtual] = useState<Atual | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const carriersExpresso = carriers.filter((c) => c.tipo === 'expresso')
  const carriersAereas = carriers.filter((c) => c.tipo === 'companhia_aerea')

  // Extrai o próximo ficheiro da fila e abre o ecrã de confirmação.
  const processar = useCallback(async (file: File) => {
    setErro(null)
    setAExtrair(true)
    const previewUrl = URL.createObjectURL(file)
    try {
      const base64 = await lerBase64(file)
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const r = await fetch('/api/tracking/extrair-carta-porte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ base64, contentType: file.type, nome: file.name }),
      })
      const data = (await r.json()) as RespostaExtracao & { erro?: string }
      if (!r.ok) {
        // Erro de auth/validação — não perde o upload: abre formulário manual.
        const vazia = respostaVazia()
        vazia.avisos = [data?.erro || 'Não foi possível extrair — completa manualmente.']
        setAtual({ file, previewUrl, resposta: vazia, form: { ...vazia.sugestao }, epSelecionada: null })
      } else {
        setAtual({ file, previewUrl, resposta: data, form: { ...data.sugestao }, epSelecionada: null })
      }
    } catch {
      const vazia = respostaVazia()
      vazia.avisos = ['Falha de rede na extração — completa manualmente. O documento não se perde.']
      setAtual({ file, previewUrl, resposta: vazia, form: { ...vazia.sugestao }, epSelecionada: null })
    } finally {
      setAExtrair(false)
    }
  }, [])

  // Puxa o próximo ficheiro da fila (chamado após aceitar e após terminar cada
  // confirmação — sem efeito, para não disparar renders em cascata).
  const arrancar = useCallback(() => {
    if (ocupadoRef.current) return
    const prox = filaRef.current.shift()
    setRestantes(filaRef.current.length)
    if (!prox) { setTotalLote(0); setFeitos(0); return }
    ocupadoRef.current = true
    processar(prox)
  }, [processar])

  // Limpa o object URL do preview ao fechar/trocar.
  useEffect(() => {
    const url = atual?.previewUrl
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [atual?.previewUrl])

  function aceitar(files: FileList | null) {
    if (!files || files.length === 0) return
    const validos: File[] = []
    const rejeitados: string[] = []
    for (const f of Array.from(files)) {
      if (!TIPOS_ACEITES.includes(f.type)) { rejeitados.push(`${f.name} (tipo)`); continue }
      if (f.size > LIMITE_MB * 1024 * 1024) { rejeitados.push(`${f.name} (>${LIMITE_MB}MB)`); continue }
      validos.push(f)
    }
    if (rejeitados.length) setErro('Ignorados: ' + rejeitados.join(', '))
    if (validos.length) {
      filaRef.current.push(...validos)
      setRestantes(filaRef.current.length)
      setTotalLote((t) => t + validos.length)
      arrancar()
    }
  }

  function terminarAtual() {
    if (atual?.previewUrl) URL.revokeObjectURL(atual.previewUrl)
    ocupadoRef.current = false
    setAtual(null)
    setFeitos((n) => n + 1)
    arrancar()
  }

  async function confirmar() {
    if (!atual) return
    setAGravar(true)
    const carrier = atual.form.carrier_id ? carriers.find((c) => c.id === atual.form.carrier_id) ?? null : null
    const input: EnvioInput = { ...atual.form, carrier_nome: carrier?.nome ?? atual.form.carrier_nome }
    const { data, error } = await criarEnvioUpload(
      input,
      { json: atual.resposta.extraido, confianca: atual.resposta.confianca },
      perfil,
    )
    if (error || !data) {
      setAGravar(false)
      setErro('Erro ao criar envio: ' + (error?.message ?? 'desconhecido'))
      return
    }
    const up = await carregarCartaPorte((data as { id: string }).id, atual.file)

    // Ponto 10: associar a uma EP escolhida (escreve o tracking na EP; o trigger liga-a).
    let epMsg = ''
    if (atual.epSelecionada) {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const numeroEp = atual.resposta.sugestoesEp.find((e) => e.id === atual.epSelecionada)?.numero ?? 'EP'
      try {
        const r = await fetch('/api/tracking/associar-ep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ epId: atual.epSelecionada, tracking_numero: input.tracking_number, awb_numero: input.awb }),
        })
        epMsg = r.ok ? ` Ligado à ${numeroEp}.` : ` (falha ao ligar à ${numeroEp})`
      } catch { epMsg = ` (falha ao ligar à ${numeroEp})` }
    }

    setAGravar(false)
    onConcluido((up.ok ? 'Envio criado com a carta de porte anexada.' : 'Envio criado (falha ao anexar o documento).') + epMsg)
    terminarAtual()
  }

  // Anexar a carta de porte ao envio duplicado existente (se não tinha anexo).
  async function anexarAoDuplicado(dup: EnvioDuplicado) {
    if (!atual) return
    setAGravar(true)
    const up = await carregarCartaPorte(dup.id, atual.file)
    setAGravar(false)
    if (!up.ok) { setErro('Erro ao anexar: ' + (up.motivo ?? '')); return }
    onConcluido('Carta de porte anexada ao envio existente.')
    terminarAtual()
  }

  function saltar() { onConcluido('Documento ignorado.'); terminarAtual() }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <button
        style={s.btnUpload}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); aceitar(e.dataTransfer.files) }}
        title="Arrasta PDF/foto para aqui ou clica para escolher"
      >
        📤 Upload de Carta de Porte{dragOver ? ' — larga aqui' : ''}
      </button>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
        onChange={(e) => { aceitar(e.target.files); e.target.value = '' }} />

      {erro && !atual && <div style={s.erroBar}>{erro}</div>}

      {(aExtrair || atual) && (
        <div style={s.overlay}>
          <div style={s.painel} onClick={(e) => e.stopPropagation()}>
            <div style={s.topo}>
              <strong>Confirmar envio a partir da carta de porte</strong>
              {totalLote > 1 && <span style={s.contador}>Documento {Math.min(feitos + 1, totalLote)} de {totalLote}</span>}
            </div>

            {aExtrair ? (
              <div style={s.aExtrair}>🔎 A ler o documento com IA…</div>
            ) : atual ? (
              <div style={s.corpo}>
                {/* Pré-visualização do documento */}
                <div style={s.preview}>
                  {atual.file.type === 'application/pdf' ? (
                    <iframe title="Documento" src={atual.previewUrl} style={s.frame} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- preview local (blob URL); next/image não se aplica
                    <img alt="Documento" src={atual.previewUrl} style={s.img} />
                  )}
                  <div style={s.ficheiroNome}>{atual.file.name}</div>
                </div>

                {/* Formulário pré-preenchido */}
                <div style={s.form}>
                  {atual.resposta.parcial && (
                    <div style={s.bannerParcial}>⚠ Extração parcial — confirma/completa os campos abaixo.</div>
                  )}
                  {atual.resposta.avisos.map((a, i) => <div key={i} style={s.aviso}>{a}</div>)}

                  {atual.resposta.duplicado && (
                    <DuplicadoBox dup={atual.resposta.duplicado} aGravar={aGravar}
                      onAnexar={() => anexarAoDuplicado(atual.resposta.duplicado!)} onSaltar={saltar} />
                  )}

                  {atual.resposta.sugestoesEp.length > 0 && (
                    <div style={s.epBox}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Associar a uma Encomenda (EP) sem tracking?</div>
                      {atual.resposta.sugestoesEp.map((ep) => (
                        <label key={ep.id} style={s.epLinha}>
                          <input type="radio" name="ep-assoc" checked={atual.epSelecionada === ep.id}
                            onChange={() => setAtual((a) => a && ({ ...a, epSelecionada: ep.id }))} />
                          <span>{ep.numero}</span>
                        </label>
                      ))}
                      <label style={s.epLinha}>
                        <input type="radio" name="ep-assoc" checked={!atual.epSelecionada}
                          onChange={() => setAtual((a) => a && ({ ...a, epSelecionada: null }))} />
                        <span>Não associar</span>
                      </label>
                    </div>
                  )}

                  <Campo rot="Tipo" conf={atual.resposta.confianca.tipo_transporte}>
                    <select style={s.input} value={atual.form.tipo_transporte}
                      onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, tipo_transporte: e.target.value as TipoTransporte } }))}>
                      {TIPOS_TRANSPORTE.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                    </select>
                  </Campo>

                  <Campo rot="Direção">
                    <select style={s.input} value={atual.form.direcao}
                      onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, direcao: e.target.value as Direcao } }))}>
                      <option value="envio">Envio (nós enviamos)</option>
                      <option value="rececao">Receção (nós recebemos)</option>
                    </select>
                  </Campo>

                  {atual.form.tipo_transporte !== 'carga_aerea' && (
                    <Campo rot="Nº de tracking" conf={atual.resposta.confianca.tracking_number}>
                      <input style={borda(s.input, atual.resposta.confianca.tracking_number)} value={atual.form.tracking_number ?? ''}
                        onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, tracking_number: e.target.value || null } }))} />
                    </Campo>
                  )}
                  {atual.form.tipo_transporte !== 'expresso' && (
                    <Campo rot="AWB" conf={atual.resposta.confianca.awb}>
                      <input style={borda(s.input, atual.resposta.confianca.awb)} value={atual.form.awb ?? ''} placeholder="074-12345678"
                        onChange={(e) => {
                          const v = e.target.value
                          const info = analisarAwb(v)
                          setAtual((a) => a && ({ ...a, form: { ...a.form, awb: v || null, awb_check_valido: info.valido ? info.controloOk : null } }))
                        }} />
                      {atual.form.awb && (() => { const i = analisarAwb(atual.form.awb); return i.valido
                        ? <span style={i.controloOk ? s.ok : s.avisoMini}>{i.controloOk ? '✓ dígito de controlo válido' : `⚠ dígito inválido (esperado ${i.digitoEsperado})`}</span>
                        : <span style={s.avisoMini}>⚠ formato XXX-XXXXXXXX não reconhecido</span> })()}
                    </Campo>
                  )}

                  <Campo rot="Transportadora / companhia" conf={atual.resposta.confianca.transportadora}>
                    <select style={borda(s.input, atual.resposta.confianca.transportadora)} value={atual.form.carrier_id ?? ''}
                      onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, carrier_id: e.target.value || null } }))}>
                      <option value="">{atual.form.carrier_nome ? `— (${atual.form.carrier_nome})` : '— (não identificada)'}</option>
                      <optgroup label="Expresso">{carriersExpresso.map((cr) => <option key={cr.id} value={cr.id}>{cr.nome}</option>)}</optgroup>
                      <optgroup label="Carga aérea">{carriersAereas.map((cr) => <option key={cr.id} value={cr.id}>{cr.nome}{cr.prefixo_awb ? ` (${cr.prefixo_awb})` : ''}</option>)}</optgroup>
                    </select>
                  </Campo>

                  <Campo rot="Estado">
                    <select style={s.input} value={atual.form.estado}
                      onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, estado: e.target.value as EstadoEnvio } }))}>
                      {ESTADOS_ENVIO.map((x) => <option key={x.valor} value={x.valor}>{x.label}</option>)}
                    </select>
                  </Campo>

                  <Campo rot="Entidade (cliente/fornecedor)" larga
                    conf={atual.form.direcao === 'rececao' ? atual.resposta.confianca.remetente_nome : atual.resposta.confianca.destinatario_nome}>
                    <div style={s.linha}>
                      <input style={{ ...s.input, flex: 2 }} value={atual.form.entidade_nome ?? ''} placeholder="Nome"
                        onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, entidade_nome: e.target.value || null, cliente_id: null, supplier_id: null } }))} />
                      <select style={{ ...s.input, flex: 1 }} value={atual.form.entidade_tipo ?? ''}
                        onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, entidade_tipo: (e.target.value || null) as 'cliente' | 'fornecedor' | null } }))}>
                        <option value="">— tipo —</option>
                        <option value="cliente">Cliente</option>
                        <option value="fornecedor">Fornecedor</option>
                      </select>
                    </div>
                    {(atual.form.cliente_id || atual.form.supplier_id) && <span style={s.ok}>✓ entidade reconhecida na base de dados</span>}
                  </Campo>

                  <Campo rot="Conteúdo" larga>
                    <input style={s.input} value={atual.form.descricao_conteudo ?? ''} placeholder="Descrição do que vai no envio"
                      onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, descricao_conteudo: e.target.value || null } }))} />
                  </Campo>

                  <Campo rot="Data de expedição" conf={atual.resposta.confianca.data_expedicao}>
                    <input style={s.input} type="date" value={atual.form.data_expedicao ?? ''}
                      onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, data_expedicao: e.target.value || null } }))} />
                  </Campo>

                  {atual.form.tipo_transporte === 'carga_aerea' && (
                    <>
                      <Campo rot="Nº de volumes" conf={atual.resposta.confianca.num_volumes}>
                        <input style={s.input} type="number" value={atual.form.num_volumes ?? ''}
                          onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, num_volumes: e.target.value ? Number(e.target.value) : null } }))} />
                      </Campo>
                      <Campo rot="Peso (kg)" conf={atual.resposta.confianca.peso_kg}>
                        <input style={s.input} type="number" value={atual.form.peso_kg ?? ''}
                          onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, peso_kg: e.target.value ? Number(e.target.value) : null } }))} />
                      </Campo>
                    </>
                  )}

                  <Campo rot="Notas" larga>
                    <textarea style={{ ...s.input, minHeight: 52 }} value={atual.form.notas ?? ''}
                      onChange={(e) => setAtual((a) => a && ({ ...a, form: { ...a.form, notas: e.target.value || null } }))} />
                  </Campo>

                  {erro && <div style={s.erroBar}>{erro}</div>}

                  <div style={s.acoes}>
                    <button style={s.btnSec} onClick={saltar} disabled={aGravar}>{restantes > 0 ? 'Saltar' : 'Cancelar'}</button>
                    <button style={s.btnPri} onClick={confirmar} disabled={aGravar}>
                      {aGravar ? 'A criar…' : 'Confirmar e criar envio'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────
const CONF_COR: Record<Confianca, { bg: string; cor: string; label: string }> = {
  alta: { bg: '#D1FAE5', cor: '#065F46', label: 'alta' },
  media: { bg: '#FEF3C7', cor: '#92400E', label: 'média' },
  baixa: { bg: '#FEF2F2', cor: '#B91C1C', label: 'baixa' },
}

function Campo({ rot, conf, larga, children }: { rot: string; conf?: Confianca; larga?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ ...s.campo, ...(larga ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={s.rotLinha}>
        <span style={s.rot}>{rot}</span>
        {conf && <span style={{ ...s.badge, background: CONF_COR[conf].bg, color: CONF_COR[conf].cor }} title={`Confiança ${CONF_COR[conf].label}`}>{CONF_COR[conf].label}</span>}
      </span>
      {children}
    </label>
  )
}

function DuplicadoBox({ dup, aGravar, onAnexar, onSaltar }: { dup: EnvioDuplicado; aGravar: boolean; onAnexar: () => void; onSaltar: () => void }) {
  return (
    <div style={s.dup}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Já existe um envio com este tracking/AWB</div>
      <div style={s.dupInfo}>{dup.tracking_number || dup.awb}{dup.descricao ? ` · ${dup.descricao}` : ''}</div>
      <div style={s.dupAcoes}>
        <Link href={`/admin-dept/tracking?q=${encodeURIComponent(dup.tracking_number || dup.awb || '')}`} style={s.dupLink}>Ver envio existente ↗</Link>
        {!dup.tem_anexo && <button style={s.btnSec} onClick={onAnexar} disabled={aGravar}>Anexar carta ao existente</button>}
        <button style={s.btnSec} onClick={onSaltar} disabled={aGravar}>Saltar este</button>
      </div>
      {dup.tem_anexo && <div style={s.avisoMini}>O envio existente já tem carta de porte anexada.</div>}
    </div>
  )
}

// Realça o campo quando a confiança é baixa.
function borda(base: React.CSSProperties, conf?: Confianca): React.CSSProperties {
  return conf === 'baixa' ? { ...base, border: '1px solid #F59E0B', background: '#FFFBEB' } : base
}

const s: Record<string, React.CSSProperties> = {
  btnUpload: { padding: '9px 16px', border: '2px dashed #2563EB', borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  erroBar: { background: '#FEF2F2', color: '#B91C1C', padding: '8px 12px', borderRadius: 8, fontSize: 13, margin: '8px 0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 60 },
  painel: { background: '#fff', borderRadius: 12, padding: 16, width: 'min(1080px, 100%)', marginTop: 16 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  contador: { fontSize: 13, color: 'var(--muted)', fontWeight: 600 },
  aExtrair: { padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 15 },
  corpo: { display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1fr)', gap: 16 },
  preview: { display: 'flex', flexDirection: 'column', gap: 6, minHeight: 420 },
  frame: { width: '100%', height: 520, border: '1px solid #e5e7eb', borderRadius: 8 },
  img: { width: '100%', maxHeight: 520, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' },
  ficheiroNome: { fontSize: 12, color: 'var(--muted)', textAlign: 'center', wordBreak: 'break-all' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, alignContent: 'start' },
  bannerParcial: { gridColumn: '1 / -1', background: '#FEF3C7', color: '#92400E', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600 },
  aviso: { gridColumn: '1 / -1', background: '#F9FAFB', color: '#374151', padding: '6px 10px', borderRadius: 8, fontSize: 12 },
  dup: { gridColumn: '1 / -1', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: 10 },
  epBox: { gridColumn: '1 / -1', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 10 },
  epLinha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0', cursor: 'pointer' },
  dupInfo: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, marginBottom: 6 },
  dupAcoes: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  dupLink: { color: '#2563EB', textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotLinha: { display: 'flex', alignItems: 'center', gap: 6 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  badge: { display: 'inline-block', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff', width: '100%' },
  linha: { display: 'flex', gap: 6 },
  avisoMini: { fontSize: 11, color: '#B91C1C', marginTop: 2 },
  ok: { fontSize: 11, color: '#065F46', marginTop: 2 },
  acoes: { gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btnPri: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSec: { padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
}
