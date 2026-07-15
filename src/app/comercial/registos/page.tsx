'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

// Fase 3 — Revisão das submissões do formulário público (/registo-cliente).
// Só admins. Aprovar cria/atualiza o cliente (cruzando por NIF/email/nome para
// não duplicar) + moradas de entrega, e marca o registo como aprovado.

type MoradaEntrega = { etiqueta?: string; morada?: string; cidade?: string; codigo_postal?: string; pais?: string }

type Registo = {
  id: string
  nome: string
  nif: string | null
  email: string | null
  telefone: string | null
  contacto_nome: string | null
  morada: string | null
  cidade: string | null
  codigo_postal: string | null
  pais: string | null
  moradas_entrega: MoradaEntrega[] | null
  observacoes: string | null
  estado: string
  created_at: string
}

const ehPortugal = (p: string | null | undefined) => !p || p.trim().toLowerCase().startsWith('portug')

export default function RegistosPage() {
  const { perfil, isAdmin, perfilCarregado } = useAuth()
  const [registos, setRegistos] = useState<Registo[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [aProcessar, setAProcessar] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Link público do formulário + QR code
  const [linkUrl, setLinkUrl] = useState('')
  const [qr, setQr] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const url = `${window.location.origin}/registo-cliente`
    setLinkUrl(url)
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [])

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(linkUrl)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }

  const carregar = useCallback(async () => {
    setACarregar(true)
    const { data } = await supabase
      .from('registos_cliente')
      .select('*')
      .eq('estado', 'pendente')
      .order('created_at', { ascending: true })
    setRegistos((data as Registo[]) ?? [])
    setACarregar(false)
  }, [])

  useEffect(() => {
    if (isAdmin) carregar()
  }, [isAdmin, carregar])

  if (perfilCarregado && !isAdmin) {
    return <main style={s.pagina}><p style={s.aviso}>Sem permissão. Esta página é só para administradores.</p></main>
  }

  // Procura um cliente existente que corresponda (NIF → email → nome).
  async function encontrarCliente(r: Registo): Promise<{ id: string } | null> {
    if (r.nif && r.nif.trim()) {
      const { data } = await supabase.from('clientes').select('id').eq('nif', r.nif.trim()).limit(1)
      if (data && data.length) return data[0] as { id: string }
    }
    if (r.email && r.email.trim()) {
      const { data } = await supabase.from('clientes').select('id').ilike('email', r.email.trim()).limit(1)
      if (data && data.length) return data[0] as { id: string }
    }
    const { data } = await supabase.from('clientes').select('id').ilike('nome', r.nome.trim()).limit(1)
    if (data && data.length) return data[0] as { id: string }
    return null
  }

  async function aprovar(r: Registo) {
    setErro(null); setMsg(null); setAProcessar(r.id)
    try {
      const existente = await encontrarCliente(r)
      // Campos submetidos (o que veio no formulário manda quando existe valor).
      const campos = {
        email: r.email, telefone: r.telefone, contacto_nome: r.contacto_nome,
        nif: r.nif, morada: r.morada, cidade: r.cidade, codigo_postal: r.codigo_postal,
        pais: r.pais ?? 'Portugal',
      }
      // Só envia campos com valor (não apaga o que já existe).
      const preenchidos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v != null && v !== ''))

      let clienteId: string
      let acao: 'criado' | 'atualizado'
      if (existente) {
        const { error } = await supabase.from('clientes')
          .update({ ...preenchidos, nacional: ehPortugal(r.pais), atualizado_em: new Date().toISOString() })
          .eq('id', existente.id)
        if (error) throw error
        clienteId = existente.id; acao = 'atualizado'
      } else {
        const { data, error } = await supabase.from('clientes')
          .insert({ nome: r.nome.trim(), ...preenchidos, nacional: ehPortugal(r.pais), observacoes: r.observacoes })
          .select('id').single()
        if (error) throw error
        clienteId = (data as { id: string }).id; acao = 'criado'
      }

      // Moradas de entrega (as que tiverem algum dado)
      const moradas = (r.moradas_entrega ?? [])
        .filter((m) => m && (m.etiqueta || m.morada || m.cidade || m.codigo_postal))
        .map((m) => ({
          cliente_id: clienteId, etiqueta: m.etiqueta ?? null, morada: m.morada ?? null,
          cidade: m.cidade ?? null, codigo_postal: m.codigo_postal ?? null, pais: m.pais ?? 'Portugal',
        }))
      if (moradas.length) {
        const { error } = await supabase.from('cliente_moradas_entrega').insert(moradas)
        if (error) throw error
      }

      const { error: eReg } = await supabase.from('registos_cliente')
        .update({ estado: 'aprovado', cliente_id: clienteId, revisto_por: perfil?.id ?? null, revisto_em: new Date().toISOString() })
        .eq('id', r.id)
      if (eReg) throw eReg

      setMsg(`"${r.nome}" aprovado — cliente ${acao}${moradas.length ? ` com ${moradas.length} morada(s) de entrega` : ''}.`)
      setRegistos((lista) => lista.filter((x) => x.id !== r.id))
    } catch (e) {
      setErro('Erro ao aprovar: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAProcessar(null)
    }
  }

  async function rejeitar(r: Registo) {
    const motivo = window.prompt(`Rejeitar o registo de "${r.nome}"? Podes indicar um motivo (opcional):`, '')
    if (motivo === null) return // cancelou
    setErro(null); setMsg(null); setAProcessar(r.id)
    const { error } = await supabase.from('registos_cliente')
      .update({ estado: 'rejeitado', motivo_rejeicao: motivo.trim() || null, revisto_por: perfil?.id ?? null, revisto_em: new Date().toISOString() })
      .eq('id', r.id)
    setAProcessar(null)
    if (error) { setErro('Erro ao rejeitar: ' + error.message); return }
    setMsg(`"${r.nome}" rejeitado.`)
    setRegistos((lista) => lista.filter((x) => x.id !== r.id))
  }

  return (
    <main style={s.pagina}>
      <div style={s.cabecalho}>
        <h1 style={s.titulo}>Registos de clientes</h1>
        <span style={s.contador}>{registos.length} por rever</span>
      </div>
      <p style={s.sub}>Submissões do formulário público. Aprovar cria ou atualiza o cliente na CRM (sem duplicar) e as moradas de entrega.</p>

      <div style={s.partilha}>
        <div style={s.partilhaInfo}>
          <div style={s.partilhaTit}>Formulário para enviar aos clientes</div>
          <p style={s.partilhaTexto}>Partilha este link (ou o QR code) para os clientes preencherem os dados. As respostas aparecem aqui para aprovação.</p>
          <div style={s.linkRow}>
            <input style={s.linkInput} value={linkUrl} readOnly onFocus={(e) => e.target.select()} />
            <button type="button" style={s.btnCopiar} onClick={copiarLink}>
              {copiado ? '✓ Copiado' : 'Copiar link'}
            </button>
          </div>
        </div>
        {qr && (
          <div style={s.qrBox}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code do formulário" width={130} height={130} style={{ display: 'block' }} />
            <a href={qr} download="formulario-registo-clientes.png" style={s.btnDescarregar}>Descarregar QR</a>
          </div>
        )}
      </div>

      {msg && <div style={s.ok}>{msg}</div>}
      {erro && <div style={s.erro}>{erro}</div>}

      {aCarregar ? (
        <p style={s.vazio}>A carregar...</p>
      ) : registos.length === 0 ? (
        <p style={s.vazio}>Não há registos por rever. 🎉</p>
      ) : (
        registos.map((r) => (
          <div key={r.id} style={s.cartao}>
            <div style={s.linhaTopo}>
              <strong style={s.nome}>{r.nome}</strong>
              <span style={s.data}>{new Date(r.created_at).toLocaleDateString('pt-PT')}</span>
            </div>
            <div style={s.grelha}>
              <Info rotulo="NIF" valor={r.nif} />
              <Info rotulo="Email" valor={r.email} />
              <Info rotulo="Telefone" valor={r.telefone} />
              <Info rotulo="Contacto" valor={r.contacto_nome} />
              <Info rotulo="Morada faturação" valor={[r.morada, r.codigo_postal, r.cidade, r.pais].filter(Boolean).join(', ') || null} />
            </div>

            {(r.moradas_entrega ?? []).length > 0 && (
              <div style={s.entregas}>
                <div style={s.entregasTit}>Moradas de entrega ({r.moradas_entrega!.length})</div>
                {r.moradas_entrega!.map((m, i) => (
                  <div key={i} style={s.entregaItem}>
                    <strong>{m.etiqueta || `Morada ${i + 1}`}:</strong>{' '}
                    {[m.morada, m.codigo_postal, m.cidade, m.pais].filter(Boolean).join(', ') || '—'}
                  </div>
                ))}
              </div>
            )}

            {r.observacoes && <div style={s.obs}><strong>Observações:</strong> {r.observacoes}</div>}

            <div style={s.acoes}>
              <button style={s.btnAprovar} disabled={aProcessar === r.id} onClick={() => aprovar(r)}>
                {aProcessar === r.id ? 'A processar...' : '✓ Aprovar'}
              </button>
              <button style={s.btnRejeitar} disabled={aProcessar === r.id} onClick={() => rejeitar(r)}>
                Rejeitar
              </button>
            </div>
          </div>
        ))
      )}
    </main>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null
  return <div style={s.info}><span style={s.infoRot}>{rotulo}</span><span>{valor}</span></div>
}

const s: Record<string, React.CSSProperties> = {
  pagina: { maxWidth: 820, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  contador: { background: 'var(--accent-bg, #ede9fe)', color: 'var(--primary, #6d28d9)', fontWeight: 700, fontSize: 13, padding: '4px 10px', borderRadius: 999 },
  sub: { color: 'var(--muted)', fontSize: 14, margin: '6px 0 16px' },
  partilha: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: 16, marginBottom: 18, background: 'var(--accent-bg, #f5f3ff)' },
  partilhaInfo: { flex: 1, minWidth: 240 },
  partilhaTit: { fontWeight: 700, color: 'var(--primary)', fontSize: 15, marginBottom: 4 },
  partilhaTexto: { color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' },
  linkRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  linkInput: { flex: 1, minWidth: 180, padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, background: '#fff' },
  btnCopiar: { padding: '9px 16px', background: 'var(--primary, #6d28d9)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  qrBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: '#fff', padding: 10, borderRadius: 10 },
  btnDescarregar: { fontSize: 12.5, color: 'var(--primary, #6d28d9)', textDecoration: 'none', fontWeight: 600 },
  vazio: { color: 'var(--muted)', textAlign: 'center', padding: 30 },
  aviso: { color: 'var(--muted)', textAlign: 'center', padding: 40 },
  ok: { background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32', borderRadius: 8, padding: 12, marginBottom: 10 },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', color: '#c62828', borderRadius: 8, padding: 12, marginBottom: 10 },
  cartao: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: 16, marginBottom: 12, background: '#fff' },
  linhaTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  nome: { fontSize: 17, color: 'var(--foreground, #1f2937)' },
  data: { fontSize: 12.5, color: 'var(--muted)' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6 },
  info: { display: 'flex', flexDirection: 'column', fontSize: 14 },
  infoRot: { fontSize: 11.5, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: 0.4 },
  entregas: { marginTop: 10, background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 10 },
  entregasTit: { fontSize: 12.5, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  entregaItem: { fontSize: 13.5, marginBottom: 2 },
  obs: { marginTop: 10, fontSize: 13.5, color: 'var(--foreground, #374151)' },
  acoes: { display: 'flex', gap: 10, marginTop: 14 },
  btnAprovar: { flex: 1, padding: 11, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  btnRejeitar: { padding: '11px 18px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer' },
}
