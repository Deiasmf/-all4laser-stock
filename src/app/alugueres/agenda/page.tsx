'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'

type Calendario = { id: string; nome: string }

export default function AgendaCalendariosPage() {
  const [cals, setCals] = useState<Calendario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      try {
        const r = await fetch('/api/alugueres/agenda/calendarios', {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        })
        const j = await r.json()
        if (!ativo) return
        setCarregando(false)
        if (!j.ok) { setErro(j.erro ?? 'Não foi possível ler os calendários.'); return }
        setCals(j.calendarios ?? [])
      } catch {
        if (ativo) { setCarregando(false); setErro('Erro de rede ao ler os calendários.') }
      }
    })()
    return () => { ativo = false }
  }, [])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Agenda — Calendários</h1>
        <Link href="/alugueres/lista" style={c.voltar}>← Lista</Link>
      </div>
      <AlugueresNav />

      <p style={c.sub}>
        Calendários do Google a que a conta tem acesso (lidos pela Service Account).
        Servem para o próximo passo: associar cada calendário a um modelo e importar as marcações.
      </p>

      {carregando ? (
        <p style={c.estado}>A ler calendários do Google…</p>
      ) : erro ? (
        <div style={c.erro}>{erro}</div>
      ) : (
        <>
          <div style={c.resumo}>{cals.length} calendário(s) encontrados</div>
          <div style={c.tabela}>
            <div style={{ ...c.linha, ...c.cab }}>
              <span>Nome</span>
              <span>ID do calendário</span>
            </div>
            {cals.map((cal) => (
              <div key={cal.id} style={c.linha}>
                <span style={{ fontWeight: 600 }}>{cal.nome}</span>
                <span style={c.id}>{cal.id}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  sub: { color: 'var(--muted)', fontSize: 14, marginBottom: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 10, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 560 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  id: { color: 'var(--muted)', fontSize: 12, wordBreak: 'break-all' },
  erro: { background: 'var(--danger-bg, #ffebee)', color: 'var(--danger, #c62828)', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, fontSize: 14 },
}
