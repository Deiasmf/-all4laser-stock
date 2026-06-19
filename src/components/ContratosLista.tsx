'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import type { ContratoAluguer, ContratoFicheiro } from '@/types/aluguer'

const BUCKET = 'contratos-aluguer'

// Limpa o nome do ficheiro (só letras, números, ponto e traço)
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Faz upload de vários ficheiros para um contrato e grava os registos.
// Devolve uma mensagem de erro (ou null se correu tudo bem).
async function carregarFicheiros(contratoId: string, ficheiros: File[]): Promise<string | null> {
  for (const f of ficheiros) {
    const caminho = `${contratoId}/${Date.now()}-${nomeSeguro(f.name)}`
    const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, f)
    if (erroUpload) return `Erro a carregar ${f.name}: ${erroUpload.message}`
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
    const { error } = await supabase.from('contratos_aluguer_ficheiros').insert({
      contrato_id: contratoId,
      url: pub.publicUrl,
      caminho,
      nome: f.name,
    })
    if (error) return `Erro a guardar ${f.name}: ${error.message}`
  }
  return null
}

export default function ContratosLista({
  nacional,
  titulo,
}: {
  nacional: boolean
  titulo: string
}) {
  const { session, perfil, isAdmin } = useAuth()
  const [contratos, setContratos] = useState<ContratoAluguer[]>([])
  const [carregando, setCarregando] = useState(true)

  // formulário de novo contrato
  const [tituloC, setTituloC] = useState('')
  const [cliente, setCliente] = useState('')
  const [serial, setSerial] = useState('')
  const [notas, setNotas] = useState('')
  const [ficheiros, setFicheiros] = useState<File[]>([])
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function carregar() {
    const { data } = await supabase
      .from('contratos_aluguer')
      .select('*, ficheiros:contratos_aluguer_ficheiros(*)')
      .eq('nacional', nacional)
      .order('created_at', { ascending: false })
    setContratos((data as ContratoAluguer[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    // setContratos só corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nacional])

  async function guardar() {
    setErro(null)
    if (!tituloC.trim()) return setErro('Indica um título para o contrato.')

    setAGuardar(true)

    // 1) criar o registo do contrato
    const { data: novo, error } = await supabase
      .from('contratos_aluguer')
      .insert({
        nacional,
        titulo: tituloC.trim(),
        cliente_nome: cliente.trim() || null,
        serial_number: serial.trim() || null,
        notas: notas.trim() || null,
        criado_por: session?.user.id ?? null,
        criado_por_nome: perfil?.nome ?? null,
      })
      .select()
      .single()

    if (error || !novo) {
      setAGuardar(false)
      return setErro('Erro a guardar o contrato: ' + (error?.message ?? ''))
    }

    // 2) carregar os ficheiros escolhidos (se houver)
    if (ficheiros.length > 0) {
      const erroFich = await carregarFicheiros((novo as ContratoAluguer).id, ficheiros)
      if (erroFich) {
        setAGuardar(false)
        carregar()
        return setErro(erroFich)
      }
    }

    setAGuardar(false)
    // limpar e recarregar
    setTituloC('')
    setCliente('')
    setSerial('')
    setNotas('')
    setFicheiros([])
    if (inputRef.current) inputRef.current.value = ''
    carregar()
  }

  async function adicionarFicheiros(contratoId: string, lista: FileList | null) {
    const fs = Array.from(lista ?? [])
    if (fs.length === 0) return
    const erroFich = await carregarFicheiros(contratoId, fs)
    if (erroFich) alert(erroFich)
    carregar()
  }

  async function apagarFicheiro(f: ContratoFicheiro) {
    if (!window.confirm(`Apagar o ficheiro “${f.nome ?? ''}”?`)) return
    if (f.caminho) await supabase.storage.from(BUCKET).remove([f.caminho])
    await supabase.from('contratos_aluguer_ficheiros').delete().eq('id', f.id)
    carregar()
  }

  async function apagarContrato(c: ContratoAluguer) {
    if (!window.confirm(`Apagar o contrato “${c.titulo}” e todos os seus ficheiros? Esta ação não pode ser anulada.`)) return
    const caminhos = (c.ficheiros ?? []).map((f) => f.caminho).filter(Boolean) as string[]
    if (caminhos.length > 0) await supabase.storage.from(BUCKET).remove(caminhos)
    // os ficheiros (registos) são apagados em cascata
    await supabase.from('contratos_aluguer').delete().eq('id', c.id)
    carregar()
  }

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <h1 style={s.titulo}>{titulo}</h1>
        <Link href="/alugueres/contratos" style={s.voltar}>← Contratos</Link>
      </div>
      <AlugueresNav />

      {/* Novo contrato */}
      <section style={s.cartao}>
        <span style={s.cartaoTitulo}>Adicionar contrato</span>
        {erro && <div style={s.erro}>{erro}</div>}

        <label style={s.label}>Título</label>
        <input
          style={s.input}
          placeholder="Ex.: Contrato Clínica X — Soprano Ice"
          value={tituloC}
          onChange={(e) => setTituloC(e.target.value)}
        />

        <div style={s.linha2}>
          <div>
            <label style={s.label}>Cliente</label>
            <input style={s.input} value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Serial (opcional)</label>
            <input style={s.input} value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
        </div>

        <label style={s.label}>Notas (opcional)</label>
        <input style={s.input} value={notas} onChange={(e) => setNotas(e.target.value)} />

        <label style={s.label}>Ficheiros (PDF ou imagem — podes escolher vários)</label>
        <input
          ref={inputRef}
          style={s.input}
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={(e) => setFicheiros(Array.from(e.target.files ?? []))}
        />
        {ficheiros.length > 0 && (
          <div style={s.nota}>{ficheiros.length} ficheiro(s) selecionado(s)</div>
        )}

        <button
          style={{ ...s.botao, opacity: aGuardar ? 0.6 : 1 }}
          disabled={aGuardar}
          onClick={guardar}
        >
          {aGuardar ? 'A guardar...' : 'Guardar contrato'}
        </button>
      </section>

      {/* Lista */}
      {carregando ? (
        <p style={s.estado}>A carregar...</p>
      ) : contratos.length === 0 ? (
        <p style={s.estado}>Ainda não há contratos. Adiciona o primeiro acima.</p>
      ) : (
        <div style={s.lista}>
          {contratos.map((c) => (
            <div key={c.id} style={s.item}>
              <div style={s.itemTopo}>
                <div style={s.itemInfo}>
                  <span style={s.itemTitulo}>{c.titulo}</span>
                  <span style={s.itemDetalhe}>
                    {[c.cliente_nome, c.serial_number].filter(Boolean).join(' · ') || '—'}
                    {' · '}
                    {formatarData(c.created_at)}
                  </span>
                  {c.notas && <span style={s.itemNota}>{c.notas}</span>}
                </div>
                {isAdmin && (
                  <button style={s.apagar} onClick={() => apagarContrato(c)} title="Apagar contrato">×</button>
                )}
              </div>

              {/* Ficheiros do contrato */}
              <div style={s.ficheiros}>
                {(c.ficheiros ?? []).length === 0 ? (
                  <span style={s.semFicheiros}>Sem ficheiros.</span>
                ) : (
                  (c.ficheiros ?? []).map((f) => (
                    <span key={f.id} style={s.chip}>
                      <a href={f.url ?? '#'} target="_blank" rel="noopener noreferrer" style={s.chipLink}>
                        📄 {f.nome ?? 'ficheiro'}
                      </a>
                      {isAdmin && (
                        <button style={s.chipApagar} onClick={() => apagarFicheiro(f)} title="Apagar ficheiro">×</button>
                      )}
                    </span>
                  ))
                )}
              </div>

              <label style={s.adicionar}>
                + Adicionar ficheiro
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    adicionarFicheiros(c.id, e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  cartao: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 },
  cartaoTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4 },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  nota: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  botao: { marginTop: 18, padding: 14, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginTop: 8, color: '#c62828' },
  estado: { color: 'var(--muted)', padding: 8 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  itemTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  itemInfo: { display: 'flex', flexDirection: 'column', gap: 3 },
  itemTitulo: { fontWeight: 700, color: 'var(--primary)', fontSize: 15 },
  itemDetalhe: { fontSize: 13, color: 'var(--muted)' },
  itemNota: { fontSize: 13, color: 'var(--foreground)' },
  apagar: { flexShrink: 0, width: 28, height: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.08)', color: 'var(--danger, #c62828)', fontSize: 18, lineHeight: 1, cursor: 'pointer' },
  ficheiros: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  semFicheiros: { fontSize: 13, color: 'var(--muted)' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent-bg, #eef1f6)', borderRadius: 999, padding: '4px 6px 4px 10px', maxWidth: '100%' },
  chipLink: { fontSize: 13, color: 'var(--foreground)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 },
  chipApagar: { width: 20, height: 20, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.12)', color: 'var(--danger, #c62828)', fontSize: 14, lineHeight: 1, cursor: 'pointer', flexShrink: 0 },
  adicionar: { alignSelf: 'flex-start', background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
}
