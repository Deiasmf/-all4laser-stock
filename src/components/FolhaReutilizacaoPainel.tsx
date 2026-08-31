'use client'

// Mostra, na FO: se é bloqueada (com desbloqueio admin), se foi "baseada" noutra
// FO (com link + diff dos campos alterados face à origem) e o histórico de
// alterações. Também deixa "descartar a base" e criar uma FO de raiz.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { obterFolha, historicoFolha, desbloquearFolha, eliminarFolha } from '@/lib/folhasObra'
import { CAMPO_FOLHA_LABEL, idadeFolha, type FolhaObra, type FolhaHistorico } from '@/types/folhaObra'

const CAMPOS_DIFF: (keyof FolhaObra)[] = ['tipo_servico', 'problema_observado', 'trabalho_realizado', 'codigos_erro', 'material_utilizado', 'observacoes']

export default function FolhaReutilizacaoPainel({ folha, onAtualizada }: { folha: FolhaObra; onAtualizada: (f: FolhaObra) => void }) {
  const router = useRouter()
  const { isAdmin, perfil } = useAuth()
  const [origem, setOrigem] = useState<FolhaObra | null>(null)
  const [historico, setHistorico] = useState<FolhaHistorico[]>([])
  const [verHist, setVerHist] = useState(false)
  const [aDesbloquear, setADesbloquear] = useState(false)

  const carregar = useCallback(async () => {
    if (folha.fo_origem_id) { const { data } = await obterFolha(folha.fo_origem_id); setOrigem((data as FolhaObra) ?? null) }
    else setOrigem(null)
    setHistorico(await historicoFolha(folha.id))
  }, [folha.fo_origem_id, folha.id])
  useEffect(() => { carregar() }, [carregar])

  const alterados = origem
    ? CAMPOS_DIFF.filter((k) => (folha[k] ?? '') !== (origem[k] ?? ''))
    : []

  async function desbloquear() {
    const motivo = window.prompt('Motivo do desbloqueio (fica registado):', '')
    if (motivo === null) return
    setADesbloquear(true)
    const { error } = await desbloquearFolha(folha.id, motivo, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setADesbloquear(false)
    if (error) { alert('Erro ao desbloquear: ' + error); return }
    const { data } = await obterFolha(folha.id)
    if (data) onAtualizada(data as FolhaObra)
  }

  async function descartarBase() {
    if (!window.confirm('Descartar esta folha base e criar uma nova de raiz? A NE mantém-se.')) return
    const nota = folha.nota_encomenda_id
    const { error } = await eliminarFolha(folha.id)
    if (error) { alert('Erro: ' + error.message); return }
    router.push(nota ? `/tecnico/folhas-obra/nova?nota=${nota}` : '/tecnico/folhas-obra/nova')
  }

  const podeDescartar = !!folha.fo_origem_id && folha.estado === 'rascunho' && !folha.bloqueada

  if (!folha.bloqueada && !folha.fo_origem_id && historico.length === 0) return null

  return (
    <div style={c.wrap}>
      {folha.bloqueada && (
        <div style={c.lock}>
          <span>🔒 <strong>Folha bloqueada</strong> — a encomenda foi expedida; o registo técnico está congelado.</span>
          {isAdmin ? (
            <button style={c.btnDesb} onClick={desbloquear} disabled={aDesbloquear}>{aDesbloquear ? 'A desbloquear…' : 'Desbloquear'}</button>
          ) : <span style={c.lockNota}>Só um admin pode desbloquear.</span>}
        </div>
      )}

      {origem && (
        <div style={c.base}>
          <div style={c.baseTopo}>
            📋 Baseada na <Link href={`/tecnico/folhas-obra/${origem.id}`} style={c.link} target="_blank">FO {origem.numero}</Link>
            {' '}de {origem.data_intervencao} ({idadeFolha(origem.data_intervencao).texto}) — a original mantém-se intocada.
            {podeDescartar && <button style={c.btnDescartar} onClick={descartarBase}>Descartar base / criar de raiz</button>}
          </div>
          {alterados.length > 0 ? (
            <div style={c.diff}>
              <div style={c.diffTitulo}>Alterado face à origem:</div>
              {alterados.map((k) => (
                <div key={String(k)} style={c.diffLinha}>
                  <span style={c.diffCampo}>{CAMPO_FOLHA_LABEL[String(k)] ?? String(k)}</span>
                  <span style={c.diffAntes}>{String(origem[k] ?? '—').slice(0, 80)}</span>
                  <span style={c.diffSeta}>→</span>
                  <span style={c.diffAgora}>{String(folha[k] ?? '—').slice(0, 80)}</span>
                </div>
              ))}
            </div>
          ) : <div style={c.semDiff}>Ainda sem alterações face à folha de origem.</div>}
        </div>
      )}

      {historico.length > 0 && (
        <div style={c.hist}>
          <button style={c.histBtn} onClick={() => setVerHist((v) => !v)}>{verHist ? '▾' : '▸'} Histórico de alterações ({historico.length})</button>
          {verHist && (
            <ul style={c.histLista}>
              {historico.map((h) => (
                <li key={h.id} style={c.histItem}>
                  <strong>{CAMPO_FOLHA_LABEL[h.campo] ?? h.campo}</strong>: <span style={c.histAntes}>{h.valor_antigo ?? '—'}</span> → <span style={c.histAgora}>{h.valor_novo ?? '—'}</span>
                  <span style={c.histMeta}> · {h.por_nome ?? 'alguém'} · {h.em.slice(0, 16).replace('T', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 },
  lock: { display: 'flex', alignItems: 'center', gap: 12, background: '#FEE2E2', border: '1px solid #fca5a5', color: '#7f1d1d', borderRadius: 10, padding: '10px 12px', fontSize: 14, flexWrap: 'wrap' },
  lockNota: { fontSize: 12, color: '#B91C1C', marginLeft: 'auto' },
  btnDesb: { marginLeft: 'auto', padding: '7px 12px', border: '1px solid #B91C1C', borderRadius: 8, background: '#fff', color: '#B91C1C', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  base: { background: '#EEF2FF', border: '1px solid #c7d2fe', borderRadius: 10, padding: '10px 12px' },
  baseTopo: { fontSize: 13, color: '#3730A3', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  link: { color: '#2563EB', textDecoration: 'none', fontWeight: 700 },
  btnDescartar: { marginLeft: 'auto', padding: '5px 10px', border: '1px solid #9ca3af', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 600 },
  diff: { marginTop: 8, background: '#fff', borderRadius: 8, padding: 8 },
  diffTitulo: { fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 },
  diffLinha: { display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 12, padding: '2px 0', flexWrap: 'wrap' },
  diffCampo: { fontWeight: 700, minWidth: 130, color: '#111827' },
  diffAntes: { color: '#9ca3af', textDecoration: 'line-through' },
  diffSeta: { color: '#6b7280' },
  diffAgora: { color: '#065F46', fontWeight: 600 },
  semDiff: { marginTop: 6, fontSize: 12, color: 'var(--muted)' },
  hist: { border: '1px solid #eee', borderRadius: 10, padding: '8px 12px' },
  histBtn: { border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: 13, color: '#374151', padding: 0 },
  histLista: { listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  histItem: { fontSize: 12, color: '#374151', borderTop: '1px solid #f3f4f6', paddingTop: 4 },
  histAntes: { color: '#9ca3af' },
  histAgora: { color: '#065F46' },
  histMeta: { color: 'var(--muted)' },
}
