'use client'

import { useCallback, useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  obterPostDetalhe, atualizarPost, apagarPost, submeterRevisao, pedirAlteracoes,
  aprovarPost, cancelarPost, listarCampanhas, apagarVariante, definirEquipamentos,
  garantirChecklist, definirCheck, criarProposta, aprovarProposta, rejeitarProposta,
} from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import PostForm from '@/components/PostForm'
import VarianteEditor from '@/components/VarianteEditor'
import {
  ESTADO_POST_LABEL, PLATAFORMA_LABEL, FORMATO_LABEL, ESTRATEGIA_LABEL,
  CHECKLIST_ITENS,
} from '@/types/marketing'
import type { PostDetalhe, PostInput, Campanha, EstadoPost } from '@/types/marketing'

export default function PublicacaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { perfil, isFinanceiro } = useAuth()
  const autor = perfil ? { id: perfil.id, nome: perfil.nome } : null

  const [post, setPost] = useState<PostDetalhe | null>(null)
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editar, setEditar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novaVariante, setNovaVariante] = useState(false)

  const recarregar = useCallback(async () => {
    const d = await obterPostDetalhe(id)
    setPost(d)
    setCarregando(false)
  }, [id])

  useEffect(() => {
    garantirChecklist(id).then(recarregar)
    listarCampanhas().then(setCampanhas)
  }, [id, recarregar])

  async function guardarPost(input: PostInput) {
    if (!post || !autor) return
    setErro(null)
    const { error } = await atualizarPost(id, input, post.estado_global, autor)
    if (error) { setErro(mensagemErro(error, { entidade: 'publicação' })); return }
    setEditar(false)
    recarregar()
  }

  async function eliminar() {
    if (!autor || !confirm('Eliminar esta publicação e as suas variantes?')) return
    const { error } = await apagarPost(id, autor)
    if (error) { setErro(mensagemErro(error)); return }
    router.push('/marketing/publicacoes')
  }

  async function acao(fn: () => Promise<{ error: unknown }>) {
    setErro(null)
    const { error } = await fn()
    if (error) { setErro(mensagemErro(error as never)); return }
    recarregar()
  }

  if (carregando) return <main style={{ padding: 20 }}><p style={{ color: 'var(--muted)' }}>A carregar…</p></main>
  if (!post || !autor) return (
    <main style={{ padding: 20 }}>
      <Link href="/marketing/publicacoes" style={{ color: 'var(--muted)' }}>← Publicações</Link>
      <p style={{ marginTop: 12 }}>Publicação não encontrada.</p>
    </main>
  )

  const est = post.estado_global
  const podeSubmeter = (est === 'draft' || est === 'changes_requested') && post.variantes.length > 0
  const podeRever = est === 'in_review'
  const terminal = est === 'published' || est === 'cancelled' || est === 'archived'

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <Link href="/marketing/publicacoes" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Publicações</Link>
      <div style={s.head}>
        <div>
          <h1 style={{ fontSize: 23, fontWeight: 700, color: 'var(--primary)' }}>
            {post.titulo_interno} {post.numero && <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>· {post.numero}</span>}
          </h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <Badge estado={est} />
            <span style={s.tag}>{ESTRATEGIA_LABEL[post.estrategia_promocao]}</span>
            {post.campanha_nome && <span style={s.tag}>📣 {post.campanha_nome}</span>}
          </div>
        </div>
        {!editar && !terminal && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btn.sec} onClick={() => setEditar(true)}>Editar</button>
            <button style={btn.del} onClick={eliminar}>Eliminar</button>
          </div>
        )}
      </div>

      {erro && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{erro}</p>}

      {/* Barra de ações do fluxo editorial */}
      {!editar && (
        <div style={s.acoes}>
          {podeSubmeter && <button style={btn.pri} onClick={() => acao(() => submeterRevisao(id, autor))}>Submeter a revisão</button>}
          {(est === 'draft' || est === 'changes_requested') && post.variantes.length === 0 &&
            <span style={s.aviso}>Adiciona pelo menos uma variante para submeter a revisão.</span>}
          {podeRever && <button style={btn.pri} onClick={() => acao(() => aprovarPost(id, autor))}>Aprovar</button>}
          {podeRever && <button style={btn.sec} onClick={() => {
            const c = window.prompt('Que alterações são necessárias?') ?? ''
            if (c.trim()) acao(() => pedirAlteracoes(id, autor, c))
          }}>Pedir alterações</button>}
          {!terminal && <button style={btn.sec} onClick={() => { if (confirm('Cancelar esta publicação?')) acao(() => cancelarPost(id, autor)) }}>Cancelar</button>}
        </div>
      )}

      {/* Detalhes / edição */}
      <Seccao titulo="Detalhes">
        {editar ? (
          <PostForm inicial={post} campanhas={campanhas} onSubmit={guardarPost} onCancelar={() => setEditar(false)} />
        ) : (
          <dl style={s.dl}>
            <Campo r="Objetivo" v={post.objetivo ?? '—'} />
            <Campo r="Mercados" v={post.mercados.length ? post.mercados.join(', ') : '—'} />
            <Campo r="Idioma base" v={post.idioma_base ?? '—'} />
            <Campo r="Público-alvo" v={post.publico_alvo ?? '—'} />
            <Campo r="Prioridade" v={post.prioridade} />
            <Campo r="Canva" v={post.canva_url ?? '—'} />
            <Campo r="Notas internas" v={post.notas_internas ?? '—'} />
          </dl>
        )}
      </Seccao>

      {/* Equipamentos */}
      <Seccao titulo={`Equipamentos (${post.equipamentos.length})`}>
        <EquipamentosBloco
          postId={id}
          atuais={post.equipamentos.map((e) => ({ equipamento_id: e.equipamento_id ?? '', marca: e.marca, modelo: e.modelo }))}
          onMudou={recarregar}
        />
      </Seccao>

      {/* Variantes */}
      <Seccao titulo={`Variantes por plataforma (${post.variantes.length})`}
        acao={!novaVariante && !terminal ? <button style={btn.sec} onClick={() => setNovaVariante(true)}>+ Variante</button> : undefined}>
        {novaVariante && (
          <div style={{ marginBottom: 14 }}>
            <VarianteEditor postId={id} autor={autor} onGuardado={() => { setNovaVariante(false); recarregar() }} onCancelar={() => setNovaVariante(false)} />
          </div>
        )}
        {post.variantes.length === 0 && !novaVariante && <p style={s.vazio}>Sem variantes. Cada rede social é uma variante independente (texto, formato e horário próprios).</p>}
        {post.variantes.map((v) => (
          <div key={v.id} style={s.variante}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{PLATAFORMA_LABEL[v.plataforma]}</strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {v.formato && <span style={s.tag}>{FORMATO_LABEL[v.formato]}</span>}
                {v.data_agendada && <span style={s.tag}>🕒 {new Date(v.data_agendada).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}</span>}
                {!terminal && <button style={btn.linkDel} onClick={() => { if (confirm('Remover esta variante?')) acao(() => apagarVariante(v.id)) }}>remover</button>}
              </div>
            </div>
            {v.titulo && <div style={{ fontWeight: 600, marginTop: 6 }}>{v.titulo}</div>}
            {v.texto && <p style={{ margin: '4px 0', fontSize: 14, whiteSpace: 'pre-wrap' }}>{v.texto}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
              {v.cta && <span>CTA: {v.cta}</span>}
              {v.url_destino && <span>URL: {v.url_destino}</span>}
              {v.hashtags.length > 0 && <span>{v.hashtags.map((h) => `#${h}`).join(' ')}</span>}
            </div>
          </div>
        ))}
      </Seccao>

      {/* Checklist de conformidade */}
      <Seccao titulo="Conformidade">
        <ChecklistBloco post={post} autor={autor} onMudou={recarregar} />
      </Seccao>

      {/* Promoção paga */}
      <Seccao titulo="Promoção paga">
        <PromocaoBloco post={post} isFinanceiro={isFinanceiro} autor={autor} onMudou={recarregar} setErro={setErro} />
      </Seccao>

      {/* Histórico */}
      {post.aprovacoes.length > 0 && (
        <Seccao titulo="Histórico">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--muted)' }}>
            {post.aprovacoes.map((a) => (
              <li key={a.id} style={{ marginBottom: 4 }}>
                <strong style={{ color: 'var(--foreground)' }}>{a.acao}</strong> — {a.por_nome ?? '—'} · {new Date(a.created_at).toLocaleString('pt-PT')}
                {a.comentario && <> · “{a.comentario}”</>}
              </li>
            ))}
          </ul>
        </Seccao>
      )}
    </main>
  )
}

// ── Equipamentos: procurar no catálogo e associar ────────────────────────────
function EquipamentosBloco({ postId, atuais, onMudou }: {
  postId: string
  atuais: { equipamento_id: string; marca: string | null; modelo: string | null }[]
  onMudou: () => void
}) {
  const [lista, setLista] = useState(atuais)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ id: string; marca: string | null; modelo: string | null; serial_number: string | null }[]>([])

  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('equipamentos')
        .select('id, marca, modelo, serial_number')
        .or(`marca.ilike.%${q}%,modelo.ilike.%${q}%,serial_number.ilike.%${q}%`)
        .limit(15)
      setRes((data as never) ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function adicionar(e: { id: string; marca: string | null; modelo: string | null }) {
    if (lista.some((x) => x.equipamento_id === e.id)) return
    const nova = [...lista, { equipamento_id: e.id, marca: e.marca, modelo: e.modelo }]
    setLista(nova); setQ(''); setRes([])
    await definirEquipamentos(postId, nova); onMudou()
  }
  async function remover(eid: string) {
    const nova = lista.filter((x) => x.equipamento_id !== eid)
    setLista(nova)
    await definirEquipamentos(postId, nova); onMudou()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {lista.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>Nenhum equipamento associado.</span>}
        {lista.map((e) => (
          <span key={e.equipamento_id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#EEEDFB', color: '#3A3870', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>
            {[e.marca, e.modelo].filter(Boolean).join(' ') || 'Equipamento'}
            <button onClick={() => remover(e.equipamento_id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3A3870' }}>✕</button>
          </span>
        ))}
      </div>
      <input style={s.input} placeholder="Procurar equipamento por marca, modelo ou nº de série…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, background: '#fff' }}>
          {res.map((e) => (
            <button key={e.id} onClick={() => adicionar(e)} style={s.resItem}>
              {[e.marca, e.modelo].filter(Boolean).join(' ') || '—'} <span style={{ color: 'var(--muted)' }}>· {e.serial_number ?? 's/n'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Checklist ─────────────────────────────────────────────────────────────────
function ChecklistBloco({ post, autor, onMudou }: { post: PostDetalhe; autor: { id: string; nome: string | null }; onMudou: () => void }) {
  const mapa = new Map(post.checklist.map((c) => [c.item, c]))
  async function mudar(item: string, estado: 'pendente' | 'confirmado' | 'nao_aplicavel') {
    let justificacao: string | null = null
    if (estado === 'nao_aplicavel') justificacao = window.prompt('Justificação (porque não se aplica):') ?? ''
    await definirCheck(post.id, item, estado, justificacao, autor); onMudou()
  }
  const porConfirmar = CHECKLIST_ITENS.filter((i) => (mapa.get(i.chave)?.estado ?? 'pendente') === 'pendente').length
  return (
    <div>
      <p style={{ fontSize: 13, color: porConfirmar ? '#92400E' : '#166534', marginBottom: 8 }}>
        {porConfirmar > 0 ? `${porConfirmar} item(ns) por confirmar antes da aprovação.` : 'Todos os itens tratados. ✓'}
      </p>
      {CHECKLIST_ITENS.map((i) => {
        const atual = mapa.get(i.chave)?.estado ?? 'pendente'
        return (
          <div key={i.chave} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13.5 }}>{i.label}</span>
            <select value={atual} onChange={(e) => mudar(i.chave, e.target.value as never)}
              style={{ ...s.input, padding: '5px 8px', maxWidth: 160,
                color: atual === 'confirmado' ? '#166534' : atual === 'nao_aplicavel' ? '#6B7280' : '#92400E' }}>
              <option value="pendente">Pendente</option>
              <option value="confirmado">Confirmado</option>
              <option value="nao_aplicavel">Não aplicável</option>
            </select>
          </div>
        )
      })}
    </div>
  )
}

// ── Promoção paga ─────────────────────────────────────────────────────────────
function PromocaoBloco({ post, isFinanceiro, autor, onMudou, setErro }: {
  post: PostDetalhe; isFinanceiro: boolean; autor: { id: string; nome: string | null }
  onMudou: () => void; setErro: (s: string | null) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [orcamento, setOrcamento] = useState('')
  const p = post.proposta_paga

  async function propor() {
    setErro(null)
    const { error } = await criarProposta(post.id, { motivo, orcamento_proposto: orcamento ? Number(orcamento) : null }, autor)
    if (error) { setErro(mensagemErro(error as never)); return }
    setMotivo(''); setOrcamento(''); onMudou()
  }
  async function aprovar() {
    setErro(null)
    const ref = window.prompt('ID/URL da campanha no gestor de anúncios (opcional):') ?? ''
    const { error } = await aprovarProposta(p!.id, post.id, autor, ref)
    if (error) { setErro(mensagemErro(error as never)); return }
    onMudou()
  }

  if (!p) {
    return (
      <div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
          Recomendar esta publicação para promoção paga. A ativação do orçamento fica a aguardar aprovação da administração/financeiro — nada é ativado automaticamente.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...s.input, flex: 2, minWidth: 200 }} placeholder="Motivo da recomendação" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <input style={{ ...s.input, width: 140 }} type="number" placeholder="Orçamento €" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} />
          <button style={btn.sec} onClick={propor}>Marcar candidata a paga</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <dl style={s.dl}>
        <Campo r="Estado" v={p.estado} />
        <Campo r="Motivo" v={p.motivo ?? '—'} />
        <Campo r="Orçamento proposto" v={p.orcamento_proposto != null ? `${p.orcamento_proposto} €` : '—'} />
        {p.aprovado_por_nome && <Campo r="Aprovado por" v={`${p.aprovado_por_nome} · ${p.aprovado_em ? new Date(p.aprovado_em).toLocaleDateString('pt-PT') : ''}`} />}
        {p.campanha_externa_ref && <Campo r="Campanha externa" v={p.campanha_externa_ref} />}
      </dl>
      {p.estado === 'proposta' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {isFinanceiro ? (
            <>
              <button style={btn.pri} onClick={aprovar}>Aprovar orçamento</button>
              <button style={btn.sec} onClick={async () => { await rejeitarProposta(p.id); onMudou() }}>Rejeitar</button>
            </>
          ) : (
            <span style={s.aviso}>Só a administração/financeiro pode aprovar o orçamento.</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Auxiliares de layout ──────────────────────────────────────────────────────
function Seccao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="a4l-card" style={{ padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}
function Campo({ r, v }: { r: string; v: string }) {
  return (<><dt style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{r}</dt><dd style={{ margin: 0, fontSize: 14 }}>{v}</dd></>)
}
function Badge({ estado }: { estado: EstadoPost }) {
  const cor: Partial<Record<EstadoPost, { c: string; bg: string }>> = {
    draft: { c: '#3A3870', bg: '#EEEDFB' }, in_review: { c: '#92400E', bg: '#FEF3C7' },
    approved: { c: '#166534', bg: '#DCFCE7' }, scheduled: { c: '#1E40AF', bg: '#DBEAFE' },
    published: { c: '#065F46', bg: '#D1FAE5' }, changes_requested: { c: '#9A3412', bg: '#FFEDD5' },
    cancelled: { c: '#6B7280', bg: '#F3F4F6' },
  }
  const x = cor[estado] ?? { c: '#6B7280', bg: '#F3F4F6' }
  return <span style={{ ...s.tag, color: x.c, background: x.bg, fontWeight: 700 }}>{ESTADO_POST_LABEL[estado]}</span>
}

const s: Record<string, React.CSSProperties> = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, margin: '4px 0 12px', flexWrap: 'wrap' },
  tag: { padding: '3px 10px', borderRadius: 999, fontSize: 12.5, background: '#F3F4F6', color: '#3A3870' },
  acoes: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 10 },
  aviso: { fontSize: 13, color: '#92400E' },
  dl: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px', margin: 0 },
  variante: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 },
  vazio: { color: 'var(--muted)', fontSize: 13.5 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  resItem: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13.5 },
}

const btn: Record<string, React.CSSProperties> = {
  pri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' },
  sec: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  del: { background: 'var(--danger-bg, #fbecea)', color: 'var(--danger, #c0392b)', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  linkDel: { background: 'none', border: 'none', color: 'var(--danger, #c0392b)', cursor: 'pointer', fontSize: 12.5 },
}
