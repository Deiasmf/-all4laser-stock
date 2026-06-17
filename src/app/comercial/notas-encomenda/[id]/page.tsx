'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterNota, listarMateriais, atualizarNota, guardarMateriais,
  alterarEstadoNota, eliminarNota,
} from '@/lib/notasEncomenda'
import NotaEncomendaForm from '@/components/NotaEncomendaForm'
import {
  ESTADO_NOTA_CONFIG,
  type NotaEncomenda, type NotaMaterial, type NotaInput, type MaterialEscolhido,
} from '@/types/notaEncomenda'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

export default function DetalheNotaPage() {
  const params = useParams()
  const router = useRouter()
  const { isAdmin } = useAuth()
  const id = params.id as string

  const [nota, setNota] = useState<NotaEncomenda | null>(null)
  const [materiais, setMateriais] = useState<NotaMaterial[]>([])
  const [carregando, setCarregando] = useState(true)
  const [naoEncontrada, setNaoEncontrada] = useState(false)
  const [editar, setEditar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    obterNota(id).then(async ({ data }) => {
      if (!activo) return
      if (!data) { setNaoEncontrada(true); setCarregando(false); return }
      setNota(data as NotaEncomenda)
      setMateriais(await listarMateriais(id))
      setCarregando(false)
    })
    return () => { activo = false }
  }, [id])

  // Material agrupado por categoria (para o quadro tipo PDF)
  const porCategoria = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const x of materiais) {
      if (!x.item) continue
      const cat = x.categoria ?? 'Outros'
      ;(m[cat] ??= []).push(x.item)
    }
    return m
  }, [materiais])

  async function guardarEdicao(input: NotaInput, mats: MaterialEscolhido[]) {
    setAGuardar(true)
    setErro(null)
    setMsg(null)
    const { data, error } = await atualizarNota(id, input)
    if (error) { setAGuardar(false); setErro('Erro ao guardar: ' + error.message); return }
    await guardarMateriais(id, mats)
    if (data) setNota(data as NotaEncomenda)
    setMateriais(await listarMateriais(id))
    setAGuardar(false)
    setEditar(false)
    setMsg('Alterações guardadas ✓')
  }

  async function marcarExpedida() {
    if (!nota) return
    if (!confirm(`Marcar a nota ${nota.numero} como expedida?`)) return
    const { data, error } = await alterarEstadoNota(id, 'expedida')
    if (error) { setErro('Erro ao atualizar estado: ' + error.message); return }
    if (data) setNota(data as NotaEncomenda)
    setMsg('Nota marcada como expedida ✓')
  }

  async function eliminar() {
    if (!nota) return
    if (!confirm(`Eliminar a nota ${nota.numero}? Esta ação não pode ser anulada.`)) return
    const { error } = await eliminarNota(id)
    if (error) { setErro('Erro ao eliminar: ' + error.message); return }
    router.push('/comercial/notas-encomenda')
  }

  if (carregando) return <main style={s.page}><p style={s.estado}>A carregar...</p></main>
  if (naoEncontrada || !nota)
    return (
      <main style={s.page}>
        <Link href="/comercial/notas-encomenda" style={s.voltar}>← Notas de Encomenda</Link>
        <p style={s.estado}>Nota de encomenda não encontrada.</p>
      </main>
    )

  const cfg = ESTADO_NOTA_CONFIG[nota.estado]

  if (editar) {
    return (
      <main style={s.page}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={s.titulo}>Editar {nota.numero}</h1>
          <button onClick={() => setEditar(false)} style={s.voltarBtn}>← Cancelar edição</button>
        </div>
        <NotaEncomendaForm
          inicial={nota}
          materiaisIniciais={materiais}
          acoes={[{ label: 'Guardar alterações', emitir: false, destaque: true }]}
          aGuardar={aGuardar}
          erro={erro}
          onSubmit={guardarEdicao}
        />
      </main>
    )
  }

  return (
    <main style={s.page}>
      {/* Estilos de impressão: esconde sidebar/topbar e botões ao usar window.print() */}
      <style>{`@media print {
        .a4l-sidebar, .a4l-topbar, .no-print { display: none !important; }
        .a4l-main { padding: 0 !important; }
        .a4l-main-wrap { display: block !important; }
      }`}</style>

      <div style={s.cabecalho} className="no-print">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={s.titulo}>{nota.numero}</h1>
            <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 999, padding: '2px 10px' }}>{cfg.label}</span>
          </div>
          <Link href="/comercial/notas-encomenda" style={s.voltar}>← Notas de Encomenda</Link>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} style={s.btnPdf}>📄 Exportar PDF</button>
          {nota.estado !== 'expedida' && nota.estado !== 'cancelada' && (
            <button onClick={marcarExpedida} style={s.btnSecundario}>Marcar como Expedida</button>
          )}
          {nota.estado === 'emitida' && (
            <button onClick={() => setEditar(true)} style={s.btnSecundario}>Editar</button>
          )}
          {isAdmin && (
            <button onClick={eliminar} style={s.btnEliminar}>Eliminar</button>
          )}
        </div>
      </div>

      {msg && <div style={s.ok} className="no-print">{msg}</div>}
      {erro && <div style={s.erro} className="no-print">{erro}</div>}

      {/* Documento (formato tipo PDF) */}
      <div style={s.doc}>
        <div style={s.docHeader}>
          <div>
            <div style={s.docMarca}>All4laser</div>
            <div style={s.docSub}>Nota de Encomenda</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={s.docNumero}>{nota.numero}</div>
            <div style={s.docSub}>Data do pedido: {formatarData(nota.data_pedido)}</div>
          </div>
        </div>

        <Bloco titulo="Cliente">
          <Linha rotulo="Nome" valor={nota.cliente_nome} />
          <Linha rotulo="País de destino" valor={nota.pais_destino} />
        </Bloco>

        <Bloco titulo="Equipamento">
          <Linha rotulo="Modelo" valor={nota.equipamento_modelo} />
          <Linha rotulo="Serial number" valor={nota.equipamento_sn} />
          <Linha rotulo="Ano" valor={nota.equipamento_ano} />
        </Bloco>

        {nota.detalhes_tecnicos && (
          <Bloco titulo="Detalhes técnicos">
            <p style={s.texto}>{nota.detalhes_tecnicos}</p>
          </Bloco>
        )}

        <Bloco titulo="Material que acompanha">
          {Object.keys(porCategoria).length === 0 ? (
            <p style={s.vazio}>Sem material associado.</p>
          ) : (
            Object.entries(porCategoria).map(([cat, itens]) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={s.matCat}>{cat}</div>
                <ul style={s.matLista}>
                  {itens.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </div>
            ))
          )}
        </Bloco>

        <Bloco titulo="Capas">
          <p style={s.texto}>{nota.capas ?? '—'}</p>
        </Bloco>

        {nota.observacoes && (
          <Bloco titulo="Observações">
            <p style={s.texto}>{nota.observacoes}</p>
          </Bloco>
        )}

        <div style={s.docFooter}>
          Emitida por {nota.criado_por_nome ?? '—'} · {formatarData(nota.created_at)}
        </div>
      </div>
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
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  voltarBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 0 },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  ok: { background: '#e6f7f1', color: '#00875f', border: '1px solid #00A87A', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 14 },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, marginBottom: 14 },
  btnPdf: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecundario: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnEliminar: { background: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  doc: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  docHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--primary)', paddingBottom: 12, gap: 12 },
  docMarca: { fontSize: 20, fontWeight: 800, color: 'var(--primary)' },
  docSub: { fontSize: 13, color: 'var(--muted)' },
  docNumero: { fontSize: 16, fontWeight: 700, color: 'var(--foreground)' },
  bloco: { display: 'flex', flexDirection: 'column', gap: 6 },
  blocoTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.4 },
  linha: { display: 'flex', gap: 12, fontSize: 14, padding: '3px 0' },
  linhaRotulo: { color: 'var(--muted)', minWidth: 140 },
  linhaValor: { color: 'var(--foreground)', fontWeight: 600 },
  texto: { fontSize: 14, color: 'var(--foreground)', margin: 0, whiteSpace: 'pre-wrap' },
  vazio: { fontSize: 14, color: 'var(--muted)', margin: 0 },
  matCat: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)' },
  matLista: { margin: '4px 0 0', paddingLeft: 20, fontSize: 14, color: 'var(--foreground)' },
  docFooter: { borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 12, color: 'var(--muted)' },
}
