'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarPorReceber, registarRececao, dataPt, diasDesde, type ItemPorReceber,
} from '@/lib/saldosPecas'

const hoje = () => new Date().toISOString().slice(0, 10)

export default function ReceberPecasPage() {
  const { perfil, isAdmin } = useAuth()
  const [itens, setItens] = useState<ItemPorReceber[]>([])
  const [carregando, setCarregando] = useState(true)
  const [fEntidade, setFEntidade] = useState('')
  const [data, setData] = useState(hoje())
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aGuardar, setAGuardar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { listarPorReceber().then(setItens).finally(() => setCarregando(false)) }, [])

  const filtrados = useMemo(() => {
    const t = fEntidade.trim().toLowerCase()
    return t ? itens.filter((i) => i.entidade.toLowerCase().includes(t)) : itens
  }, [itens, fEntidade])

  function toggleSel(id: string) {
    const n = new Set(sel)
    if (n.has(id)) n.delete(id); else n.add(id)
    setSel(n)
  }

  async function receber(ids: string[]) {
    if (ids.length === 0 || aGuardar) return
    setAGuardar(true); setMsg(null)
    let ok = 0
    for (const id of ids) {
      const { error } = await registarRececao(id, data, { id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null })
      if (!error) ok++
    }
    setItens((prev) => prev.filter((i) => !ids.includes(i.id)))
    setSel((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
    setAGuardar(false)
    setMsg(`${ok} peça(s) registada(s) como recebida(s) em ${dataPt(data)}.`)
  }

  if (!isAdmin) {
    return (
      <main style={s.page}>
        <div style={s.cabecalho}><h1 style={s.titulo}>Receção de Peças</h1><Link href="/logistico/saldos-pecas" style={s.voltar}>← Saldos</Link></div>
        <p style={s.estado}>Só administradores podem registar receções.</p>
      </main>
    )
  }

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <h1 style={s.titulo}>Receção de Peças</h1>
          <Link href="/logistico/saldos-pecas" style={s.voltar}>← Saldos de Peças</Link>
        </div>
      </div>
      <p style={s.nota}>Peças que ainda estão fora (em reparação). Marca as que voltaram para fechar o ciclo — o saldo atualiza automaticamente.</p>

      <div style={s.barra}>
        <input placeholder="Entidade..." value={fEntidade} onChange={(e) => setFEntidade(e.target.value)} style={s.input} />
        <label style={s.campoData}>Data de entrada <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={s.inputData} /></label>
        <button
          style={{ ...s.btnPrimario, ...(sel.size === 0 || aGuardar ? s.btnOff : {}) }}
          disabled={sel.size === 0 || aGuardar}
          onClick={() => receber(Array.from(sel))}
        >
          {aGuardar ? 'A registar...' : `Registar receção (${sel.size})`}
        </button>
      </div>

      {msg && <div style={s.ok}>{msg}</div>}

      {carregando ? (
        <p style={s.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={s.estado}>Sem peças por receber{fEntidade ? ' para este filtro' : ''}. 🎉</p>
      ) : (
        <div style={s.tabela}>
          {filtrados.map((i) => {
            const dias = diasDesde(i.data_saida)
            const velho = dias !== null && dias > 30
            const ref = i.referencia || (i.serial_number ? `S/N ${i.serial_number}` : i.sn_avariado ? `S/N ${i.sn_avariado}` : '—')
            return (
              <div key={i.id} style={s.linha}>
                <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(i.id)} style={s.check} />
                <div style={s.info}>
                  <div style={s.linhaTopo}>
                    <b>{i.entidade}</b>
                    <span style={s.peca}>{i.peca}</span>
                  </div>
                  <div style={s.linhaBaixo}>
                    <span>{ref}</span>
                    <span>Saída: {dataPt(i.data_saida)}</span>
                    {dias !== null && <span style={velho ? s.diasVelho : s.dias}>{dias} dias fora</span>}
                    {i.enviado > 1 && <span>({i.recebido}/{i.enviado})</span>}
                  </div>
                </div>
                <button style={s.btnRecebida} disabled={aGuardar} onClick={() => receber([i.id])}>Recebida</button>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  nota: { fontSize: 13, color: 'var(--muted)', margin: '4px 0 14px' },
  barra: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  input: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit', minWidth: 150 },
  campoData: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  inputData: { padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' },
  btnOff: { opacity: 0.5, cursor: 'default' },
  ok: { background: '#e6f7f1', color: '#00795c', border: '1px solid #9fe0cb', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600, marginBottom: 12 },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabela: { border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' },
  linha: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderTop: '1px solid var(--border)' },
  check: { width: 18, height: 18, flexShrink: 0 },
  info: { flex: 1, minWidth: 0 },
  linhaTopo: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', color: 'var(--foreground)' },
  peca: { fontSize: 13.5 },
  linhaBaixo: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  dias: { color: 'var(--muted)' },
  diasVelho: { color: '#9a5b00', fontWeight: 700 },
  btnRecebida: { background: 'var(--surface)', color: '#00795c', border: '1px solid #9fe0cb', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
}
