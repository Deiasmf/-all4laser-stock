'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  listarCategorias, listarSubcategorias, listarRegras,
  criarCategoria, atualizarCategoria, apagarCategoria,
  criarSubcategoria, atualizarSubcategoria, apagarSubcategoria,
  criarRegra, atualizarRegra, apagarRegra,
  LABEL_CAMPO, LABEL_OPERADOR,
  type CategoriaFin, type Subcategoria, type RegraCat, type CampoRegra, type OperadorRegra,
} from '@/lib/categoriasFin'

export default function CategoriasPage() {
  const [cats, setCats] = useState<CategoriaFin[]>([])
  const [subs, setSubs] = useState<Subcategoria[]>([])
  const [regras, setRegras] = useState<RegraCat[]>([])
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [c, s, r] = await Promise.all([listarCategorias(), listarSubcategorias(), listarRegras()])
    setCats(c); setSubs(s); setRegras(r)
    setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const catsAtivas = useMemo(() => cats.filter((c) => c.ativo), [cats])

  // ── Nova categoria de topo ──
  const [novaCat, setNovaCat] = useState('')
  async function adicionarCategoria() {
    const label = novaCat.trim()
    if (!label) return
    const { error } = await criarCategoria({ label, ordem: cats.length + 1 })
    if (error) setMsg('Erro: ' + error.message)
    else { setNovaCat(''); await carregar() }
  }

  // ── Nova subcategoria ──
  const [subNome, setSubNome] = useState<Record<string, string>>({})
  async function adicionarSub(categoriaId: string) {
    const nome = (subNome[categoriaId] ?? '').trim()
    if (!nome) return
    const { error } = await criarSubcategoria({ categoria_id: categoriaId, nome })
    if (error) setMsg('Erro: ' + error.message)
    else { setSubNome((s) => ({ ...s, [categoriaId]: '' })); await carregar() }
  }

  async function renomearCat(c: CategoriaFin) {
    const label = prompt('Novo nome da categoria:', c.label)
    if (label == null || !label.trim() || label.trim() === c.label) return
    const { error } = await atualizarCategoria(c.id, { label: label.trim() })
    if (error) setMsg('Erro: ' + error.message); else await carregar()
  }
  async function alternarCat(c: CategoriaFin) {
    await atualizarCategoria(c.id, { ativo: !c.ativo }); await carregar()
  }
  async function eliminarCat(c: CategoriaFin) {
    if (!confirm(`Eliminar a categoria "${c.label}" e as suas subcategorias? Os documentos ficam sem categoria.`)) return
    const r = await apagarCategoria(c)
    if (!r.ok) setMsg('Erro: ' + (r.erro ?? '')); else await carregar()
  }

  async function renomearSub(s: Subcategoria) {
    const nome = prompt('Novo nome da subcategoria:', s.nome)
    if (nome == null || !nome.trim() || nome.trim() === s.nome) return
    const { error } = await atualizarSubcategoria(s.id, { nome: nome.trim() })
    if (error) setMsg('Erro: ' + error.message); else await carregar()
  }
  async function alternarSub(s: Subcategoria) {
    await atualizarSubcategoria(s.id, { ativo: !s.ativo }); await carregar()
  }
  async function eliminarSub(s: Subcategoria) {
    if (!confirm(`Eliminar a subcategoria "${s.nome}"?`)) return
    const { error } = await apagarSubcategoria(s.id)
    if (error) setMsg('Erro: ' + error.message); else await carregar()
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro/documentos" style={c.voltar}>← Documentos</Link>
          <h1 style={c.titulo}>🏷️ Categorias e Regras</h1>
          <p style={c.sub}>Organiza os documentos por categoria/subcategoria e cria regras para categorizar automaticamente na importação.</p>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg} <button style={c.fecharAviso} onClick={() => setMsg(null)}>✕</button></div>}

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : (
        <>
          {/* ── Categorias ── */}
          <section style={c.card}>
            <div style={c.cardTitulo}>Categorias</div>
            <div style={c.novaLinha}>
              <input
                placeholder="Nova categoria (ex.: Peças)"
                value={novaCat}
                onChange={(e) => setNovaCat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarCategoria()}
                style={{ ...c.input, flex: 1 }}
              />
              <button style={c.btnPrim} onClick={adicionarCategoria}>+ Adicionar</button>
            </div>

            <div style={c.listaCats}>
              {cats.map((t) => {
                const meusSubs = subs.filter((s) => s.categoria_id === t.id)
                return (
                  <div key={t.id} style={{ ...c.catBloco, opacity: t.ativo ? 1 : 0.55 }}>
                    <div style={c.catLinha}>
                      <span style={c.catNome}>
                        <span style={{ ...c.catBadge, color: t.cor ?? '#374151', background: t.bg ?? '#F3F4F6' }}>{t.icon} {t.label}</span>
                        {t.protegida && <span style={c.protegidaTag} title="Alimenta as comissões / lógica da app — não se apaga">🔒 protegida</span>}
                        {!t.ativo && <span style={c.inativoTag}> (inativa)</span>}
                      </span>
                      <span style={c.acoes}>
                        <button style={c.linkBtn} onClick={() => renomearCat(t)}>Renomear</button>
                        <button style={c.linkBtn} onClick={() => alternarCat(t)}>{t.ativo ? 'Desativar' : 'Ativar'}</button>
                        {!t.protegida && <button style={c.linkBtnPerigo} onClick={() => eliminarCat(t)}>Eliminar</button>}
                      </span>
                    </div>

                    {meusSubs.length > 0 && (
                      <div style={c.subLista}>
                        {meusSubs.map((s) => (
                          <div key={s.id} style={{ ...c.subLinha, opacity: s.ativo ? 1 : 0.55 }}>
                            <span>› {s.nome}{!s.ativo && <span style={c.inativoTag}> (inativa)</span>}</span>
                            <span style={c.acoes}>
                              <button style={c.linkBtn} onClick={() => renomearSub(s)}>Renomear</button>
                              <button style={c.linkBtn} onClick={() => alternarSub(s)}>{s.ativo ? 'Desativar' : 'Ativar'}</button>
                              <button style={c.linkBtnPerigo} onClick={() => eliminarSub(s)}>Eliminar</button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={c.novaSub}>
                      <input
                        placeholder="+ subcategoria"
                        value={subNome[t.id] ?? ''}
                        onChange={(e) => setSubNome((x) => ({ ...x, [t.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && adicionarSub(t.id)}
                        style={{ ...c.input, ...c.inputSub }}
                      />
                      <button style={c.btnSec} onClick={() => adicionarSub(t.id)}>Adicionar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Regras automáticas ── */}
          <RegrasSection
            regras={regras} cats={catsAtivas} subs={subs}
            onErro={setMsg} onMudou={carregar}
          />
        </>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function RegrasSection({
  regras, cats, subs, onErro, onMudou,
}: {
  regras: RegraCat[]
  cats: CategoriaFin[]
  subs: Subcategoria[]
  onErro: (m: string) => void
  onMudou: () => Promise<void>
}) {
  const [campo, setCampo] = useState<CampoRegra>('descricao')
  const [operador, setOperador] = useState<OperadorRegra>('contem')
  const [valor, setValor] = useState('')
  const [catChave, setCatChave] = useState('')
  const [subId, setSubId] = useState('')

  const catById = useMemo(() => new Map(cats.map((c) => [c.chave, c])), [cats])
  const subsDisponiveis = useMemo(() => {
    const cat = cats.find((x) => x.chave === catChave)
    return cat ? subs.filter((s) => s.categoria_id === cat.id && s.ativo) : []
  }, [cats, subs, catChave])

  const subNome = (id: string | null) => (id ? subs.find((s) => s.id === id)?.nome ?? null : null)

  async function adicionar() {
    if (!valor.trim()) { onErro('Escreve o texto a procurar.'); return }
    if (!catChave) { onErro('Escolhe a categoria da regra.'); return }
    const { error } = await criarRegra({
      campo, operador, valor, categoria_chave: catChave,
      subcategoria_id: subId || null, ordem: regras.length + 1,
    })
    if (error) onErro('Erro: ' + error.message)
    else { setValor(''); setSubId(''); await onMudou() }
  }

  async function toggle(r: RegraCat) { await atualizarRegra(r.id, { ativo: !r.ativo }); await onMudou() }
  async function eliminar(r: RegraCat) {
    if (!confirm('Eliminar esta regra?')) return
    await apagarRegra(r.id); await onMudou()
  }
  async function mover(r: RegraCat, dir: -1 | 1) {
    const i = regras.findIndex((x) => x.id === r.id)
    const j = i + dir
    if (j < 0 || j >= regras.length) return
    const a = regras[i], b = regras[j]
    await Promise.all([atualizarRegra(a.id, { ordem: b.ordem }), atualizarRegra(b.id, { ordem: a.ordem })])
    await onMudou()
  }

  return (
    <section style={c.card}>
      <div style={c.cardTitulo}>Regras automáticas</div>
      <p style={c.nota}>Na importação, a 1ª regra ativa (de cima para baixo) que corresponder define a categoria do documento. Podes sempre corrigir à mão depois.</p>

      <div style={c.formRegra}>
        <span style={c.formTxt}>Se o</span>
        <select value={campo} onChange={(e) => setCampo(e.target.value as CampoRegra)} style={c.input}>
          {(Object.keys(LABEL_CAMPO) as CampoRegra[]).map((k) => <option key={k} value={k}>{LABEL_CAMPO[k]}</option>)}
        </select>
        <select value={operador} onChange={(e) => setOperador(e.target.value as OperadorRegra)} style={c.input}>
          {(Object.keys(LABEL_OPERADOR) as OperadorRegra[]).map((k) => <option key={k} value={k}>{LABEL_OPERADOR[k]}</option>)}
        </select>
        <input placeholder="texto (ex.: aluguer)" value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...c.input, minWidth: 140 }} />
        <span style={c.formTxt}>→</span>
        <select value={catChave} onChange={(e) => { setCatChave(e.target.value); setSubId('') }} style={c.input}>
          <option value="">Categoria...</option>
          {cats.map((t) => <option key={t.chave} value={t.chave}>{t.icon} {t.label}</option>)}
        </select>
        {subsDisponiveis.length > 0 && (
          <select value={subId} onChange={(e) => setSubId(e.target.value)} style={c.input}>
            <option value="">(sem subcategoria)</option>
            {subsDisponiveis.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        <button style={c.btnPrim} onClick={adicionar}>+ Criar regra</button>
      </div>

      {regras.length === 0 ? (
        <p style={c.estado}>Ainda sem regras.</p>
      ) : (
        <div style={c.listaRegras}>
          {regras.map((r, i) => (
            <div key={r.id} style={{ ...c.regraLinha, opacity: r.ativo ? 1 : 0.55 }}>
              <span style={c.ordemBtns}>
                <button style={c.setaBtn} disabled={i === 0} onClick={() => mover(r, -1)}>▲</button>
                <button style={c.setaBtn} disabled={i === regras.length - 1} onClick={() => mover(r, 1)}>▼</button>
              </span>
              <span style={c.regraTxt}>
                <strong>{LABEL_CAMPO[r.campo]}</strong> {LABEL_OPERADOR[r.operador]} “<strong>{r.valor}</strong>”
                {' → '}
                <span style={c.catBadge}>
                  {catById.get(r.categoria_chave)?.label ?? r.categoria_chave}
                  {subNome(r.subcategoria_id) ? ` › ${subNome(r.subcategoria_id)}` : ''}
                </span>
                {!r.ativo && <span style={c.inativoTag}> (inativa)</span>}
              </span>
              <span style={c.acoes}>
                <button style={c.linkBtn} onClick={() => toggle(r)}>{r.ativo ? 'Desativar' : 'Ativar'}</button>
                <button style={c.linkBtnPerigo} onClick={() => eliminar(r)}>Eliminar</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fecharAviso: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--primary)' },
  nota: { fontSize: 12.5, color: 'var(--muted)', margin: 0 },
  novaLinha: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  input: { padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  inputSub: { flex: 1, minWidth: 140, fontSize: 13 },
  listaCats: { display: 'flex', flexDirection: 'column', gap: 10 },
  catBloco: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  catLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catNome: { display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  catBadge: { borderRadius: 999, padding: '3px 12px', fontWeight: 700, fontSize: 13 },
  protegidaTag: { color: 'var(--muted)', fontSize: 11.5 },
  inativoTag: { color: 'var(--muted)', fontWeight: 400, fontSize: 12 },
  subLista: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 10, borderLeft: '2px solid #eee', marginLeft: 4 },
  subLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 14, flexWrap: 'wrap' },
  novaSub: { display: 'flex', gap: 8, alignItems: 'center' },
  acoes: { display: 'inline-flex', gap: 10, alignItems: 'center' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  linkBtnPerigo: { background: 'transparent', border: 'none', color: '#c62828', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSec: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  formRegra: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#f9fafb', border: '1px dashed var(--border)', borderRadius: 10, padding: 12 },
  formTxt: { color: 'var(--muted)', fontSize: 14 },
  listaRegras: { display: 'flex', flexDirection: 'column', gap: 6 },
  regraLinha: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', flexWrap: 'wrap' },
  ordemBtns: { display: 'inline-flex', flexDirection: 'column', gap: 2 },
  setaBtn: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: '2px 4px' },
  regraTxt: { flex: 1, fontSize: 13.5, minWidth: 200 },
}
