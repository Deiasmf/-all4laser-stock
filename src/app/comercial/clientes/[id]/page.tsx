'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import ClienteForm from '@/components/ClienteForm'
import { limparRascunho } from '@/lib/useFormDraft'
import BotaoPdf from '@/components/BotaoPdf'
import { obterCliente, atualizarCliente, eliminarCliente, historicoCliente } from '@/lib/clientes'
import type { Cliente, ClienteInput, HistoricoItem } from '@/types/cliente'

const HIST_ICON: Record<HistoricoItem['tipo'], string> = {
  aluguer: '🔄', reserva: '📅', nota: '📋', contrato: '📄',
}
const HIST_LABEL: Record<HistoricoItem['tipo'], string> = {
  aluguer: 'Aluguer', reserva: 'Reserva', nota: 'Nota de encomenda', contrato: 'Contrato',
}

function fmt(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

export default function FichaClientePage() {
  const params = useParams()
  const router = useRouter()
  const { isAdmin } = useAuth()
  const id = params.id as string

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [editar, setEditar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    obterCliente(id).then(async ({ data }) => {
      if (!activo) return
      if (!data) { setNaoEncontrado(true); setCarregando(false); return }
      const cl = data as Cliente
      setCliente(cl)
      setHistorico(await historicoCliente(cl))
      setCarregando(false)
    })
    return () => { activo = false }
  }, [id])

  async function guardar(input: ClienteInput) {
    setAGuardar(true)
    setErro(null)
    setMsg(null)
    const { data, error } = await atualizarCliente(id, input)
    if (error || !data) {
      setAGuardar(false)
      setErro('Erro ao guardar: ' + (error?.message ?? 'erro desconhecido'))
      return
    }
    const cl = data as Cliente
    setCliente(cl)
    setHistorico(await historicoCliente(cl))
    setAGuardar(false)
    setEditar(false)
    limparRascunho(`cliente:edit:${id}`)
    setMsg('Ficha guardada ✓')
  }

  async function eliminar() {
    if (!cliente) return
    if (!confirm(`Eliminar o cliente "${cliente.nome}"? Esta ação não pode ser anulada.`)) return
    const { error } = await eliminarCliente(id)
    if (error) { setErro('Erro ao eliminar: ' + error.message); return }
    router.push('/comercial/clientes')
  }

  if (carregando) return <main style={s.page}><p style={s.estado}>A carregar...</p></main>
  if (naoEncontrado || !cliente)
    return (
      <main style={s.page}>
        <Link href="/comercial/clientes" style={s.voltar}>← Clientes</Link>
        <p style={s.estado}>Cliente não encontrado.</p>
      </main>
    )

  if (editar) {
    return (
      <main style={s.page}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={s.titulo}>Editar {cliente.nome}</h1>
          <button onClick={() => setEditar(false)} style={s.voltarBtn}>← Cancelar edição</button>
        </div>
        <ClienteForm inicial={cliente} aGuardar={aGuardar} erro={erro} submitLabel="Guardar alterações" onSubmit={guardar} rascunhoKey={`cliente:edit:${id}`} />
      </main>
    )
  }

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={s.titulo}>{cliente.nome}</h1>
            {cliente.tipo && <span style={s.tag}>{cliente.tipo}</span>}
          </div>
          <Link href="/comercial/clientes" style={s.voltar}>← Clientes</Link>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <BotaoPdf
            ficheiro={`Cliente-${cliente.nome}`}
            documento={() => ({
              titulo: 'Ficha de Cliente',
              subtitulo: cliente.nome,
              seccoes: [
                {
                  titulo: 'Cliente',
                  linhas: [
                    { rotulo: 'Nome', valor: cliente.nome },
                    { rotulo: 'Tipo', valor: cliente.tipo },
                    { rotulo: 'Mercado', valor: cliente.nacional ? 'Nacional' : 'Internacional' },
                  ],
                },
                {
                  titulo: 'Contacto',
                  linhas: [
                    { rotulo: 'Contacto', valor: cliente.contacto_nome },
                    { rotulo: 'Email', valor: cliente.email },
                    { rotulo: 'Telefone', valor: cliente.telefone },
                  ],
                },
                {
                  titulo: 'Morada',
                  linhas: [
                    { rotulo: 'Morada', valor: cliente.morada },
                    { rotulo: 'Cidade', valor: cliente.cidade },
                    { rotulo: 'Código postal', valor: cliente.codigo_postal },
                    { rotulo: 'País', valor: cliente.pais },
                  ],
                },
                {
                  titulo: 'Fiscal',
                  linhas: [{ rotulo: 'NIF', valor: cliente.nif }],
                },
                {
                  titulo: 'Observações',
                  linhas: [{ rotulo: 'Observações', valor: cliente.observacoes }],
                },
              ],
            })}
          />
          <button onClick={() => setEditar(true)} style={s.btnSecundario}>Editar</button>
          {isAdmin && <button onClick={eliminar} style={s.btnEliminar}>Eliminar</button>}
        </div>
      </div>

      {msg && <div style={s.ok}>{msg}</div>}
      {erro && <div style={s.erro}>{erro}</div>}

      {!cliente.email && (
        <div style={s.avisoEmail}>
          ⚠ Este cliente ainda não tem email. Adiciona-o para o envio de fatura ser automático.
        </div>
      )}

      <div style={s.card}>
        <Bloco titulo="Contacto">
          <Linha rotulo="Email" valor={cliente.email} />
          <Linha rotulo="Telefone" valor={cliente.telefone} />
          <Linha rotulo="Pessoa de contacto" valor={cliente.contacto_nome} />
        </Bloco>
        <Bloco titulo="Morada e faturação">
          <Linha rotulo="NIF" valor={cliente.nif} />
          <Linha rotulo="Morada" valor={cliente.morada} />
          <Linha rotulo="Código-postal" valor={cliente.codigo_postal} />
          <Linha rotulo="Cidade" valor={cliente.cidade} />
          <Linha rotulo="País" valor={cliente.pais} />
        </Bloco>
        {cliente.observacoes && (
          <Bloco titulo="Observações">
            <p style={s.texto}>{cliente.observacoes}</p>
          </Bloco>
        )}
      </div>

      <h2 style={s.subtitulo}>Histórico ({historico.length})</h2>
      {historico.length === 0 ? (
        <p style={s.estado}>Sem alugueres, reservas, notas ou contratos para este cliente.</p>
      ) : (
        <div style={s.histWrap}>
          {historico.map((h) => {
            const conteudo = (
              <>
                <span style={s.histIcon}>{HIST_ICON[h.tipo]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.histTitulo}>{h.titulo || HIST_LABEL[h.tipo]}</div>
                  <div style={s.histDetalhe}>{HIST_LABEL[h.tipo]} · {h.detalhe}</div>
                </div>
                <div style={s.histData}>{fmt(h.data)}</div>
              </>
            )
            return h.href ? (
              <Link key={`${h.tipo}-${h.id}`} href={h.href} style={{ ...s.histItem, ...s.histLink }}>{conteudo}</Link>
            ) : (
              <div key={`${h.tipo}-${h.id}`} style={s.histItem}>{conteudo}</div>
            )
          })}
        </div>
      )}
    </main>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={s.bloco}>
      <div style={s.blocoTitulo}>{titulo}</div>
      {children}
    </section>
  )
}
function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div style={s.linha}>
      <span style={s.linhaRotulo}>{rotulo}</span>
      <span style={s.linhaValor}>{valor || '—'}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  subtitulo: { fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: '24px 0 12px' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  voltarBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 0 },
  tag: { fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--surface)', border: '1px solid var(--primary)', borderRadius: 999, padding: '2px 10px' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  ok: { background: '#e6f7f1', color: '#00875f', border: '1px solid #00A87A', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 14 },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 14 },
  avisoEmail: { background: '#fff7e6', color: '#9a6700', border: '1px solid #f0c36d', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 14 },
  btnSecundario: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnEliminar: { background: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  bloco: { display: 'flex', flexDirection: 'column', gap: 6 },
  blocoTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.4 },
  linha: { display: 'flex', gap: 12, fontSize: 14, padding: '3px 0' },
  linhaRotulo: { color: 'var(--muted)', minWidth: 150 },
  linhaValor: { color: 'var(--foreground)', fontWeight: 600 },
  texto: { fontSize: 14, color: 'var(--foreground)', margin: 0, whiteSpace: 'pre-wrap' },
  histWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  histItem: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' },
  histLink: { textDecoration: 'none', color: 'inherit' },
  histIcon: { fontSize: 18 },
  histTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  histDetalhe: { fontSize: 13, color: 'var(--muted)' },
  histData: { fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' },
}
