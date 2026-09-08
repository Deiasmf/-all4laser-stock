'use client'

// Registo de uma despesa a partir de foto/PDF, com extração AI e ecrã de
// confirmação. Mobile-first: foto em cima, campos por baixo, alvos de toque
// grandes. Se a extração falhar, abre o formulário manual com a foto anexada —
// o registo nunca se perde.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  criarDespesa, carregarFotosDespesa, comprimirImagem, criarTipo,
  detetarDuplicado,
} from '@/lib/despesas'
import type { Confianca, DespesaTipo, AluguerAtivoOpc, Despesa, RespostaExtracaoDespesa } from '@/types/despesa'

const TIPOS_ACEITES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const LIMITE_MB = 10

type Form = {
  fornecedor: string
  data_despesa: string
  valor: string
  iva: string
  num_documento: string
  tipo_id: string | null
  cliente_id: string | null
  aluguer_ref: string | null
  nota: string
}

type Props = {
  perfil: { id: string; nome: string | null }
  tipos: DespesaTipo[]
  alugueres: AluguerAtivoOpc[]
  onConcluido: (msg: string) => void
  onTipoCriado: (t: DespesaTipo) => void
  onFechar: () => void
}

function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*;base64,/, ''))
    r.onerror = () => reject(r.error ?? new Error('Falha ao ler o ficheiro.'))
    r.readAsDataURL(file)
  })
}

export default function RegistarDespesa({ perfil, tipos, alugueres, onConcluido, onTipoCriado, onFechar }: Props) {
  const [fotos, setFotos] = useState<File[]>([])
  const [aExtrair, setAExtrair] = useState(false)
  const [resposta, setResposta] = useState<RespostaExtracaoDespesa | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [novoTipo, setNovoTipo] = useState('')
  const [mostrarNovoTipo, setMostrarNovoTipo] = useState(false)
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [duplicado, setDuplicado] = useState<Despesa | null>(null)
  const [dupIgnorado, setDupIgnorado] = useState(false)

  const camaraRef = useRef<HTMLInputElement>(null)
  const ficheiroRef = useRef<HTMLInputElement>(null)
  const maisRef = useRef<HTMLInputElement>(null)

  // Preview da 1ª foto (derivado; o efeito só limpa o object URL anterior).
  const previewUrl = useMemo(() => (fotos[0] ? URL.createObjectURL(fotos[0]) : null), [fotos])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function validar(files: FileList | null): File[] {
    if (!files) return []
    const ok: File[] = []
    const mau: string[] = []
    for (const f of Array.from(files)) {
      if (!TIPOS_ACEITES.includes(f.type)) { mau.push(`${f.name} (tipo)`); continue }
      if (f.size > LIMITE_MB * 1024 * 1024) { mau.push(`${f.name} (>${LIMITE_MB}MB)`); continue }
      ok.push(f)
    }
    if (mau.length) setErro('Ignorados: ' + mau.join(', '))
    return ok
  }

  // Primeira captura → comprime, extrai e abre o formulário.
  async function iniciar(files: FileList | null) {
    const validos = validar(files)
    if (!validos.length) return
    setErro(null)
    const comprimidos = await Promise.all(validos.map((f) => comprimirImagem(f)))
    setFotos(comprimidos)
    setAExtrair(true)
    try {
      const base64 = await lerBase64(comprimidos[0])
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const r = await fetch('/api/despesas/extrair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ base64, contentType: comprimidos[0].type, nome: comprimidos[0].name }),
      })
      const data = (await r.json()) as RespostaExtracaoDespesa & { erro?: string }
      const resp: RespostaExtracaoDespesa = r.ok && data.ok
        ? data
        : {
            ok: true, parcial: true, erro: data?.erro ?? null,
            extraido: { fornecedor: null, data_despesa: null, valor: null, iva: null, num_documento: null, confianca: {} },
            confianca: {}, avisos: [data?.erro || 'Não foi possível extrair — preenche manualmente.'],
          }
      setResposta(resp)
      setForm(formInicial(resp))
    } catch {
      const resp: RespostaExtracaoDespesa = {
        ok: true, parcial: true, erro: null,
        extraido: { fornecedor: null, data_despesa: null, valor: null, iva: null, num_documento: null, confianca: {} },
        confianca: {}, avisos: ['Falha de rede na extração — preenche manualmente. A foto não se perde.'],
      }
      setResposta(resp)
      setForm(formInicial(resp))
    } finally {
      setAExtrair(false)
    }
  }

  function formInicial(resp: RespostaExtracaoDespesa): Form {
    const e = resp.extraido
    return {
      fornecedor: e.fornecedor ?? '',
      data_despesa: e.data_despesa ?? '',
      valor: e.valor != null ? String(e.valor) : '',
      iva: e.iva != null ? String(e.iva) : '',
      num_documento: e.num_documento ?? '',
      tipo_id: null, cliente_id: null, aluguer_ref: null, nota: '',
    }
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f))
    setDuplicado(null); setDupIgnorado(false)
  }

  function adicionarMais(files: FileList | null) {
    const validos = validar(files)
    if (validos.length) Promise.all(validos.map((f) => comprimirImagem(f))).then((c) => setFotos((prev) => [...prev, ...c]))
  }

  async function criarNovoTipo() {
    const nome = novoTipo.trim()
    if (!nome) return
    const t = await criarTipo(nome, perfil)
    if (t) {
      onTipoCriado(t)
      set('tipo_id', t.id)
      setMostrarNovoTipo(false); setNovoTipo('')
    }
  }

  async function submeter() {
    if (!form) return
    setErro(null)
    const valorNum = Number(form.valor.replace(',', '.'))
    if (!form.data_despesa) { setErro('Indica a data da despesa.'); return }
    if (!Number.isFinite(valorNum) || valorNum <= 0) { setErro('Indica um valor válido.'); return }
    if (!form.tipo_id) { setErro('Escolhe o tipo de despesa.'); return }

    // Deteção de duplicado (só uma vez; depois deixa avançar).
    if (!dupIgnorado) {
      const dup = await detetarDuplicado(form.data_despesa, valorNum, form.fornecedor || null)
      if (dup) { setDuplicado(dup); setDupIgnorado(true); return }
    }

    setAGravar(true)
    const ivaNum = form.iva.trim() ? Number(form.iva.replace(',', '.')) : null
    const { data, error } = await criarDespesa({
      tipo_id: form.tipo_id,
      fornecedor: form.fornecedor.trim() || null,
      data_despesa: form.data_despesa,
      valor: valorNum,
      iva: Number.isFinite(ivaNum as number) ? (ivaNum as number) : null,
      num_documento: form.num_documento.trim() || null,
      cliente_id: form.cliente_id,
      aluguer_ref: form.aluguer_ref,
      nota: form.nota.trim() || null,
    }, perfil)
    if (error || !data) { setAGravar(false); setErro('Erro ao guardar: ' + (error?.message ?? 'desconhecido')); return }

    const despesaId = (data as { id: string }).id
    const up = await carregarFotosDespesa(perfil.id, despesaId, fotos)
    setAGravar(false)
    onConcluido(up.falhas.length ? 'Despesa registada (algumas fotos falharam).' : 'Despesa registada ✓')
  }

  const conf = (c?: Confianca) => c && CONF_COR[c]

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.painel} onClick={(e) => e.stopPropagation()}>
        <div style={s.topo}>
          <strong>Registar Despesa</strong>
          <button onClick={onFechar} style={s.fechar} aria-label="Fechar">×</button>
        </div>

        {/* Passo 1: escolher documento */}
        {!fotos.length && !aExtrair && (
          <div style={s.captura}>
            <p style={s.ajuda}>Tira uma foto ao talão/fatura ou escolhe da galeria. A app tenta ler os dados sozinha.</p>
            <button style={s.btnCamara} onClick={() => camaraRef.current?.click()}>📷 Tirar foto</button>
            <button style={s.btnGaleria} onClick={() => ficheiroRef.current?.click()}>🖼️ Galeria / PDF</button>
            <input ref={camaraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={(e) => { iniciar(e.target.files); e.target.value = '' }} />
            <input ref={ficheiroRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
              onChange={(e) => { iniciar(e.target.files); e.target.value = '' }} />
            {erro && <div style={s.erroBar}>{erro}</div>}
          </div>
        )}

        {aExtrair && <div style={s.aExtrair}>🔎 A ler o documento com IA…</div>}

        {/* Passo 2: confirmar */}
        {form && !aExtrair && (
          <div style={s.corpo}>
            {previewUrl && (
              <div style={s.preview}>
                {fotos[0].type === 'application/pdf'
                  ? <iframe title="Documento" src={previewUrl} style={s.frame} />
                  /* eslint-disable-next-line @next/next/no-img-element -- preview local (blob URL) */
                  : <img alt="Documento" src={previewUrl} style={s.img} />}
                <div style={s.fotosBar}>
                  <span style={s.fotosCount}>{fotos.length} foto{fotos.length > 1 ? 's' : ''}</span>
                  <button style={s.btnMini} onClick={() => maisRef.current?.click()}>+ Adicionar foto (frente/verso)</button>
                  <input ref={maisRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
                    onChange={(e) => { adicionarMais(e.target.files); e.target.value = '' }} />
                </div>
              </div>
            )}

            {resposta?.parcial && <div style={s.bannerParcial}>⚠ Confirma/completa os campos abaixo.</div>}
            {resposta?.avisos.map((a, i) => <div key={i} style={s.aviso}>{a}</div>)}

            <Campo rot="Tipo de despesa *" badge={undefined}>
              <select style={s.input} value={form.tipo_id ?? ''}
                onChange={(e) => {
                  if (e.target.value === '__novo') { setMostrarNovoTipo(true); return }
                  set('tipo_id', e.target.value || null)
                }}>
                <option value="">— escolher —</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.estado === 'pendente' ? ' (por aprovar)' : ''}</option>)}
                <option value="__novo">➕ Outra…</option>
              </select>
              {mostrarNovoTipo && (
                <div style={s.novoTipoLinha}>
                  <input style={{ ...s.input, flex: 1 }} placeholder="Nome do novo tipo (ex.: Portagens)"
                    value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criarNovoTipo() } }} />
                  <button style={s.btnMini} onClick={criarNovoTipo}>Adicionar</button>
                </div>
              )}
            </Campo>

            <div style={s.grid2}>
              <Campo rot="Valor total (€) *" badge={conf(resposta?.confianca.valor)}>
                <input style={realce(s.input, resposta?.confianca.valor)} inputMode="decimal" value={form.valor}
                  onChange={(e) => set('valor', e.target.value)} placeholder="0,00" />
              </Campo>
              <Campo rot="Data *" badge={conf(resposta?.confianca.data_despesa)}>
                <input style={realce(s.input, resposta?.confianca.data_despesa)} type="date" value={form.data_despesa}
                  onChange={(e) => set('data_despesa', e.target.value)} />
              </Campo>
            </div>

            <Campo rot="Fornecedor / estabelecimento" badge={conf(resposta?.confianca.fornecedor)}>
              <input style={realce(s.input, resposta?.confianca.fornecedor)} value={form.fornecedor}
                onChange={(e) => set('fornecedor', e.target.value)} placeholder="Ex.: Repsol, Continente…" />
            </Campo>

            <div style={s.grid2}>
              <Campo rot="IVA (€)" badge={conf(resposta?.confianca.iva)}>
                <input style={s.input} inputMode="decimal" value={form.iva} onChange={(e) => set('iva', e.target.value)} placeholder="opcional" />
              </Campo>
              <Campo rot="Nº do documento" badge={conf(resposta?.confianca.num_documento)}>
                <input style={s.input} value={form.num_documento} onChange={(e) => set('num_documento', e.target.value)} placeholder="opcional" />
              </Campo>
            </div>

            <Campo rot="Aluguer / cliente (opcional)">
              <select style={s.input} value={form.aluguer_ref ?? ''}
                onChange={(e) => {
                  const a = alugueres.find((x) => x.label === e.target.value)
                  setForm((f) => f ? { ...f, aluguer_ref: e.target.value || null, cliente_id: a?.cliente_id ?? null } : f)
                }}>
                <option value="">— nenhum —</option>
                {alugueres.map((a) => <option key={a.label} value={a.label}>{a.label}</option>)}
              </select>
            </Campo>

            <Campo rot="Nota (opcional)">
              <input style={s.input} value={form.nota} onChange={(e) => set('nota', e.target.value)} placeholder="Ex.: entrega GentleMax Faro" />
            </Campo>

            {duplicado && !aGravar && (
              <div style={s.dup}>
                ⚠ Despesa possivelmente já registada ({Number(duplicado.valor).toFixed(2)} € em {duplicado.data_despesa}
                {duplicado.fornecedor ? ` · ${duplicado.fornecedor}` : ''}). Carrega outra vez para registar à mesma.
              </div>
            )}
            {erro && <div style={s.erroBar}>{erro}</div>}

            <div style={s.acoes}>
              <button style={s.btnSec} onClick={onFechar} disabled={aGravar}>Cancelar</button>
              <button style={s.btnPri} onClick={submeter} disabled={aGravar}>
                {aGravar ? 'A guardar…' : duplicado ? 'Registar à mesma' : 'Registar despesa'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const CONF_COR: Record<Confianca, { bg: string; cor: string; label: string }> = {
  alta: { bg: '#D1FAE5', cor: '#065F46', label: 'alta' },
  media: { bg: '#FEF3C7', cor: '#92400E', label: 'média' },
  baixa: { bg: '#FEF2F2', cor: '#B91C1C', label: 'baixa' },
}

function Campo({ rot, badge, children }: { rot: string; badge?: { bg: string; cor: string; label: string }; children: React.ReactNode }) {
  return (
    <label style={s.campo}>
      <span style={s.rotLinha}>
        <span style={s.rot}>{rot}</span>
        {badge && <span style={{ ...s.badge, background: badge.bg, color: badge.cor }}>{badge.label}</span>}
      </span>
      {children}
    </label>
  )
}

function realce(base: React.CSSProperties, conf?: Confianca): React.CSSProperties {
  return conf === 'baixa' ? { ...base, border: '1px solid #F59E0B', background: '#FFFBEB' } : base
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, overflowY: 'auto', zIndex: 80 },
  painel: { background: '#fff', borderRadius: 14, padding: 16, width: 'min(560px, 100%)', marginTop: 12, marginBottom: 12 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  fechar: { background: 'transparent', border: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  captura: { display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0' },
  ajuda: { fontSize: 14, color: 'var(--muted)', margin: 0 },
  btnCamara: { padding: '16px', border: 'none', borderRadius: 12, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' },
  btnGaleria: { padding: '14px', border: '1px solid var(--border)', borderRadius: 12, background: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  aExtrair: { padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 15 },
  corpo: { display: 'flex', flexDirection: 'column', gap: 10 },
  preview: { display: 'flex', flexDirection: 'column', gap: 6 },
  frame: { width: '100%', height: 260, border: '1px solid #e5e7eb', borderRadius: 8 },
  img: { width: '100%', maxHeight: 260, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' },
  fotosBar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  fotosCount: { fontSize: 12.5, color: 'var(--muted)' },
  bannerParcial: { background: '#FEF3C7', color: '#92400E', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600 },
  aviso: { background: '#F9FAFB', color: '#374151', padding: '6px 10px', borderRadius: 8, fontSize: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  rotLinha: { display: 'flex', alignItems: 'center', gap: 6 },
  rot: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  badge: { display: 'inline-block', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700 },
  input: { padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: 10, font: 'inherit', background: '#fff', width: '100%', boxSizing: 'border-box' },
  novoTipoLinha: { display: 'flex', gap: 6, marginTop: 6 },
  dup: { background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: 10, fontSize: 13, color: '#92400E', fontWeight: 600 },
  erroBar: { background: '#FEF2F2', color: '#B91C1C', padding: '8px 12px', borderRadius: 8, fontSize: 13 },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btnPri: { padding: '12px 18px', border: 'none', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSec: { padding: '12px 16px', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', cursor: 'pointer', font: 'inherit' },
  btnMini: { padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
}
