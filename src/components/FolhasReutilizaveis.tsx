'use client'

// Painel "Folha de obra encontrada": deteta FOs concluídas para o S/N do
// equipamento da NE e permite reutilizá-las como base (cópia versionada) sem
// tocar na original. Se não houver nada, não renderiza (sem fricção).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { procurarFolhasPorSn, copiarFolhaObra, mesesAvisoFolha } from '@/lib/folhasObra'
import { idadeFolha, ESTADO_FOLHA_CONFIG, type FolhaObra } from '@/types/folhaObra'

export default function FolhasReutilizaveis({ sn, notaId }: { sn: string | null; notaId: string }) {
  const router = useRouter()
  const [exatas, setExatas] = useState<FolhaObra[]>([])
  const [semelhantes, setSemelhantes] = useState<FolhaObra[]>([])
  const [meses, setMeses] = useState(12)
  const [aUsar, setAUsar] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const procurar = useCallback(async () => {
    if (!sn || sn.trim().length < 3) { setExatas([]); setSemelhantes([]); return }
    const [r, m] = await Promise.all([procurarFolhasPorSn(sn), mesesAvisoFolha()])
    setExatas(r.exatas); setSemelhantes(r.semelhantes); setMeses(m)
  }, [sn])
  useEffect(() => { procurar() }, [procurar])

  async function usar(f: FolhaObra) {
    setAUsar(f.id); setErro(null)
    const { id, error } = await copiarFolhaObra(f.id, notaId)
    setAUsar(null)
    if (error || !id) { setErro('Erro ao copiar: ' + (error ?? '')); return }
    router.push(`/tecnico/folhas-obra/${id}`)
  }

  if (exatas.length === 0 && semelhantes.length === 0) return null

  const lista = exatas.length > 0 ? exatas : semelhantes
  const maisRecente = lista[0]
  const idadeRecente = idadeFolha(maisRecente?.data_intervencao ?? null)
  const antiga = idadeRecente.meses >= meses

  return (
    <section style={c.wrap} className="no-print">
      <div style={c.topo}>
        <strong style={c.titulo}>🔧 {exatas.length > 0 ? 'Folha(s) de obra encontrada(s) para este equipamento' : 'S/N semelhante encontrado — é este equipamento?'}</strong>
        <span style={c.contador}>{lista.length}</span>
      </div>

      {antiga && (
        <div style={c.aviso}>⚠️ A folha mais recente tem {idadeRecente.texto.replace('há ', '')} — confirmar se o estado do equipamento ainda corresponde.</div>
      )}

      <div style={c.linhas}>
        {lista.map((f) => {
          const idade = idadeFolha(f.data_intervencao)
          const est = ESTADO_FOLHA_CONFIG[f.estado]
          return (
            <div key={f.id} style={c.item}>
              <div style={c.itemInfo}>
                <div style={c.itemTopo}>
                  <span style={c.foNum}>{f.numero}</span>
                  {f.tipo_servico && <span style={c.tipo}>{f.tipo_servico}</span>}
                  <span style={{ ...c.estado, color: est.color, background: est.bg }}>{est.label}</span>
                  <span style={c.idade}>{f.data_intervencao} · {idade.texto}</span>
                </div>
                {f.trabalho_realizado && <div style={c.resumo}>{f.trabalho_realizado.slice(0, 160)}{f.trabalho_realizado.length > 160 ? '…' : ''}</div>}
              </div>
              <div style={c.acoes}>
                <button style={c.btnUsar} onClick={() => usar(f)} disabled={aUsar === f.id}>{aUsar === f.id ? 'A copiar…' : 'Usar como base'}</button>
                <Link href={`/tecnico/folhas-obra/${f.id}`} style={c.btnVer} target="_blank">Ver detalhe</Link>
              </div>
            </div>
          )
        })}
      </div>

      <div style={c.rodape}>
        {erro && <span style={c.erro}>{erro}</span>}
        <Link href={`/tecnico/folhas-obra/nova?nota=${notaId}`} style={c.novaLink}>ou criar folha de obra nova →</Link>
      </div>
    </section>
  )
}

const c: Record<string, React.CSSProperties> = {
  wrap: { border: '1px solid #f0d98a', background: '#fffdf5', borderRadius: 12, padding: 14, marginBottom: 16 },
  topo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  titulo: { fontSize: 14, color: '#7a5b00' },
  contador: { fontSize: 12, fontWeight: 700, background: '#f0d98a', color: '#7a5b00', borderRadius: 999, padding: '1px 8px' },
  aviso: { fontSize: 13, color: '#92400E', background: '#FEF3C7', border: '1px solid #f0d98a', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontWeight: 600 },
  linhas: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', flexWrap: 'wrap' },
  itemInfo: { flex: '1 1 320px', minWidth: 240 },
  itemTopo: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  foNum: { fontWeight: 700, fontSize: 14 },
  tipo: { fontSize: 12, background: '#EEF2FF', color: '#3730A3', borderRadius: 999, padding: '1px 8px', fontWeight: 600 },
  estado: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px' },
  idade: { fontSize: 12, color: 'var(--muted)' },
  resumo: { fontSize: 13, color: '#374151', marginTop: 4 },
  acoes: { display: 'flex', gap: 8, alignItems: 'center' },
  btnUsar: { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnVer: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit', textDecoration: 'none', color: 'inherit' },
  rodape: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  erro: { color: '#B91C1C', fontSize: 13, fontWeight: 600 },
  novaLink: { color: '#2563EB', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginLeft: 'auto' },
}
