'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { criarPost } from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import { useCanais } from '@/lib/useCanais'

// Candidato editável (o modelo detetado + se entra ou não).
type Candidato = {
  incluir: boolean
  titulo_interno: string
  data_prevista: string
  canais: string[]
  texto_pt: string
  texto_en: string
  hashtags: string
}

const arquivoParaBase64 = (f: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(new Error('Falha a ler o ficheiro'))
    r.readAsDataURL(f)
  })

export default function ImportarPlanoAI() {
  const router = useRouter()
  const { perfil } = useAuth()
  const canaisDisponiveis = useCanais()
  const [texto, setTexto] = useState('')
  const [ficheiro, setFicheiro] = useState<File | null>(null)
  const [aAnalisar, setAAnalisar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cands, setCands] = useState<Candidato[] | null>(null)
  const [aCriar, setACriar] = useState(false)
  const [resultado, setResultado] = useState<{ criados: number; falhados: number } | null>(null)

  async function analisar() {
    setErro(null); setResultado(null)
    if (!texto.trim() && !ficheiro) { setErro('Cola o texto do plano ou escolhe um ficheiro (PDF/imagem).'); return }
    // A plataforma limita o tamanho do pedido (~4,5 MB). base64 aumenta ~33%, por
    // isso avisamos já aqui (com margem) em vez de deixar o servidor cortar.
    if (ficheiro && ficheiro.size > 3 * 1024 * 1024) {
      setErro('O ficheiro é demasiado grande (máx. ~3 MB). Exporta o plano num PDF mais leve, ou copia o texto e cola na caixa acima.')
      return
    }
    setAAnalisar(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const tokenSessao = s.session?.access_token
      if (!tokenSessao) { setErro('Sessão expirada. Volta a entrar.'); setAAnalisar(false); return }

      const corpo: { texto?: string; ficheiro?: { base64: string; contentType: string; nome: string } } = {}
      if (texto.trim()) corpo.texto = texto.trim()
      if (ficheiro) corpo.ficheiro = { base64: await arquivoParaBase64(ficheiro), contentType: ficheiro.type, nome: ficheiro.name }

      const resp = await fetch('/api/marketing/importar-plano-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSessao}` },
        body: JSON.stringify(corpo),
      })
      // A resposta pode NÃO ser JSON (ex.: erro da plataforma por ficheiro grande
      // ou timeout devolve texto/HTML) — ler como texto e tentar interpretar.
      const bruto = await resp.text()
      let json: { ok?: boolean; erro?: string; posts?: unknown[] } | null = null
      try { json = bruto ? JSON.parse(bruto) : null } catch { json = null }
      if (!resp.ok || !json?.ok) {
        setAAnalisar(false)
        if (json?.erro) { setErro(json.erro); return }
        if (resp.status === 413) { setErro('O ficheiro é demasiado grande para enviar. Usa um PDF mais leve ou cola o texto.'); return }
        if (resp.status === 504 || resp.status === 408) { setErro('A análise demorou demasiado. Tenta um plano mais pequeno (por partes) ou cola só o texto.'); return }
        setErro(`Não foi possível analisar (erro ${resp.status}). Tenta colar o texto do plano em vez do ficheiro.`)
        return
      }

      const detetados = (json.posts ?? []) as {
        titulo_interno: string; data_prevista: string | null; canais: string[]
        texto_pt: string | null; texto_en: string | null; hashtags: string[]
      }[]
      setCands(detetados.map((p) => ({
        incluir: true,
        titulo_interno: p.titulo_interno,
        data_prevista: p.data_prevista ?? '',
        canais: p.canais ?? [],
        texto_pt: p.texto_pt ?? '',
        texto_en: p.texto_en ?? '',
        hashtags: (p.hashtags ?? []).map((h) => `#${h}`).join(' '),
      })))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na análise.')
    } finally {
      setAAnalisar(false)
    }
  }

  function editar(i: number, patch: Partial<Candidato>) {
    setCands((prev) => prev ? prev.map((c, j) => j === i ? { ...c, ...patch } : c) : prev)
  }
  function alternarCanal(i: number, canal: string) {
    setCands((prev) => prev ? prev.map((c, j) => {
      if (j !== i) return c
      const tem = c.canais.includes(canal)
      return { ...c, canais: tem ? c.canais.filter((x) => x !== canal) : [...c.canais, canal] }
    }) : prev)
  }

  const selecionados = (cands ?? []).filter((c) => c.incluir && c.titulo_interno.trim())

  async function criar() {
    if (!perfil || selecionados.length === 0) return
    setACriar(true); setErro(null)
    let criados = 0, falhados = 0
    for (const c of selecionados) {
      const { error } = await criarPost({
        titulo_interno: c.titulo_interno,
        data_prevista: c.data_prevista || null,
        canais: c.canais,
        texto_pt: c.texto_pt || null,
        texto_en: c.texto_en || null,
        hashtags: c.hashtags.split(/[\s,]+/).map((h) => h.replace(/^#+/, '').trim()).filter(Boolean),
      }, { id: perfil.id, nome: perfil.nome })
      if (error) { falhados++; setErro(mensagemErro(error, { entidade: 'publicação' })) } else criados++
    }
    setACriar(false)
    setResultado({ criados, falhados })
  }

  return (
    <div>
      <p style={s.sub}>
        Cola o texto do plano (ou carrega um <strong>PDF/imagem</strong>). A IA deteta as publicações;
        <strong> revês e editas</strong> antes de criar. Tudo entra como <strong>Rascunho</strong> — nada é publicado.
      </p>

      {!resultado && (
        <>
          <textarea style={s.textarea} placeholder="Cola aqui o plano de publicações…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setFicheiro(e.target.files?.[0] ?? null)} />
            <button style={{ ...s.btnPri, ...(aAnalisar ? { opacity: 0.6 } : {}) }} disabled={aAnalisar} onClick={analisar}>
              {aAnalisar ? 'A analisar com IA…' : '✨ Analisar plano'}
            </button>
          </div>
        </>
      )}

      {erro && <p style={{ color: 'var(--danger)' }}>{erro}</p>}

      {resultado && (
        <div style={s.resumo}>
          ✓ <strong>{resultado.criados}</strong> rascunho(s) criado(s){resultado.falhados > 0 && <>, <strong>{resultado.falhados}</strong> falhado(s)</>}.
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button style={s.btnPri} onClick={() => router.push('/marketing/publicacoes')}>Ver publicações</button>
            <button style={s.btnOff} onClick={() => { setResultado(null); setCands(null); setTexto(''); setFicheiro(null) }}>Importar outro</button>
          </div>
        </div>
      )}

      {cands && !resultado && (
        <>
          <div style={s.barra}>
            <span><strong>{cands.length}</strong> publicação(ões) detetada(s) · <strong style={{ color: '#166534' }}>{selecionados.length}</strong> selecionada(s)</span>
            <button style={{ ...s.btnPri, ...(selecionados.length === 0 || aCriar ? { opacity: 0.6 } : {}) }} disabled={selecionados.length === 0 || aCriar} onClick={criar}>
              {aCriar ? 'A criar…' : `Criar ${selecionados.length} rascunho(s)`}
            </button>
          </div>
          {cands.length === 0 && <p style={{ color: 'var(--muted)' }}>A IA não detetou publicações. Tenta colar mais detalhe ou outro ficheiro.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cands.map((c, i) => (
              <div key={i} style={{ ...s.cartao, opacity: c.incluir ? 1 : 0.55 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <input type="checkbox" checked={c.incluir} onChange={(e) => editar(i, { incluir: e.target.checked })} />
                  <input style={{ ...s.input, fontWeight: 700, flex: 1 }} value={c.titulo_interno} onChange={(e) => editar(i, { titulo_interno: e.target.value })} placeholder="Título interno" />
                  <input style={{ ...s.input, width: 150 }} type="date" value={c.data_prevista} onChange={(e) => editar(i, { data_prevista: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {canaisDisponiveis.map((canal) => {
                    const on = c.canais.includes(canal.slug)
                    return <button type="button" key={canal.slug} onClick={() => alternarCanal(i, canal.slug)} style={{ ...s.canal, ...(on ? s.canalOn : {}) }}>{canal.emoji} {canal.label}</button>
                  })}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <textarea style={{ ...s.input, flex: 1, minWidth: 220, minHeight: 70 }} value={c.texto_pt} onChange={(e) => editar(i, { texto_pt: e.target.value })} placeholder="Texto PT" />
                  <textarea style={{ ...s.input, flex: 1, minWidth: 220, minHeight: 70 }} value={c.texto_en} onChange={(e) => editar(i, { texto_en: e.target.value })} placeholder="Texto EN" />
                </div>
                <input style={{ ...s.input, marginTop: 8 }} value={c.hashtags} onChange={(e) => editar(i, { hashtags: e.target.value })} placeholder="#hashtags" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  sub: { color: 'var(--muted)', fontSize: 13.5, marginBottom: 12, lineHeight: 1.5 },
  textarea: { width: '100%', minHeight: 140, padding: 12, border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 13.5 },
  input: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  barra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0', flexWrap: 'wrap', gap: 10 },
  cartao: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' },
  canal: { border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  canalOn: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  resumo: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 14, marginTop: 12 },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnOff: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
