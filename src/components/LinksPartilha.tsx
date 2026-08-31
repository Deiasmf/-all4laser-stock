'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  listarLinks, criarLink, revogarLink, urlLinkPublico, type FichaLink,
} from '@/lib/fichaProduto'
import type { IdiomaFicha } from '@/lib/fichaProdutoPdf'

// Gerir os links partilháveis (página pública /p/[token]) de um equipamento:
// criar (admin/administrativo), copiar, revogar (admin), ver visualizações.
const IDIOMAS: { v: IdiomaFicha; label: string }[] = [
  { v: 'pt', label: 'PT' }, { v: 'en', label: 'EN' }, { v: 'es', label: 'ES' }, { v: 'fr', label: 'FR' },
]
function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function LinksPartilha({ equipamentoId }: { equipamentoId: string }) {
  const { perfil, isAdmin, isAdministrativo } = useAuth()
  const [links, setLinks] = useState<FichaLink[]>([])
  const [carregando, setCarregando] = useState(true)
  const [idioma, setIdioma] = useState<IdiomaFicha>('pt')
  const [incluirPreco, setIncluirPreco] = useState(false)
  const [incluirSn, setIncluirSn] = useState(false)
  const [aCriar, setACriar] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLinks(await listarLinks(equipamentoId)); setCarregando(false)
  }, [equipamentoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function criar() {
    setACriar(true)
    await criarLink(equipamentoId, { idioma, incluir_preco: incluirPreco, incluir_sn_completo: incluirSn }, perfil?.id ?? null)
    setACriar(false); setIncluirPreco(false); setIncluirSn(false)
    await carregar()
  }
  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(urlLinkPublico(token))
      setCopiado(token); setTimeout(() => setCopiado(null), 2000)
    } catch { /* clipboard indisponível */ }
  }
  async function revogar(l: FichaLink) {
    if (!window.confirm('Revogar este link? Deixa de funcionar imediatamente.')) return
    await revogarLink(l.id); await carregar()
  }

  if (!isAdministrativo) return null   // criar/gerir links: admin + administrativo

  return (
    <div style={s.seccao}>
      <div style={s.titulo}>Links partilháveis</div>
      <p style={s.dica}>Link público (sem login) para enviar por WhatsApp/email. Mostra sempre os dados atuais; conta as visualizações.</p>

      <div style={s.form}>
        <label style={s.campo}><span style={s.rot}>Idioma</span>
          <select style={s.input} value={idioma} onChange={(e) => setIdioma(e.target.value as IdiomaFicha)}>
            {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
          </select>
        </label>
        <label style={s.check}><input type="checkbox" checked={incluirPreco} onChange={(e) => setIncluirPreco(e.target.checked)} /> Incluir preço</label>
        <label style={s.check}><input type="checkbox" checked={incluirSn} onChange={(e) => setIncluirSn(e.target.checked)} /> S/N completo</label>
        <button style={s.btnPrim} disabled={aCriar} onClick={criar}>{aCriar ? 'A criar…' : '+ Criar link'}</button>
      </div>

      {carregando ? <p style={s.muted}>A carregar…</p> : links.length === 0 ? <p style={s.muted}>Ainda não há links.</p> : (
        <div style={s.lista}>
          {links.map((l) => (
            <div key={l.id} style={{ ...s.linha, ...(l.revogado ? s.revogado : {}) }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={s.url}>{urlLinkPublico(l.token)}</div>
                <div style={s.meta}>
                  {IDIOMAS.find((i) => i.v === l.idioma)?.label ?? l.idioma}
                  {l.incluir_preco ? ' · c/ preço' : ''}{l.incluir_sn_completo ? ' · S/N completo' : ''}
                  {' · '}👁 {l.views} · válido até {fmt(l.expira_em)}
                  {l.revogado && <span style={s.tagRev}> · REVOGADO</span>}
                </div>
              </div>
              {!l.revogado && (
                <div style={s.acoes}>
                  <button style={s.btnMini} onClick={() => copiar(l.token)}>{copiado === l.token ? '✓ Copiado' : 'Copiar'}</button>
                  {isAdmin && <button style={s.btnMini} onClick={() => revogar(l)}>Revogar</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 },
  titulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  dica: { fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 12px' },
  form: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, fontWeight: 600, color: 'var(--foreground)' },
  input: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  muted: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  linha: { display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' },
  revogado: { opacity: 0.55 },
  url: { fontSize: 12.5, fontWeight: 600, wordBreak: 'break-all' },
  meta: { fontSize: 11.5, color: 'var(--muted)', marginTop: 2 },
  tagRev: { color: '#B91C1C', fontWeight: 700 },
  acoes: { display: 'flex', gap: 6, flexShrink: 0 },
  btnMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
}
