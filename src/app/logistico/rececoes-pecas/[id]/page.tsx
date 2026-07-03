'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterRececao, listarItensRececao, alterarEstadoRececao, atualizarRececao, eliminarRececao,
} from '@/lib/rececoesPecas'
import { listarFuncionarios, type FuncionarioOpc } from '@/lib/enviosPecas'
import {
  estadoRececaoInfo, motivoRececaoInfo, formatarEuro,
  type RececaoPeca, type RececaoItem,
} from '@/types/rececaoPecas'
import { REFERENCIA_TIPO_LABEL } from '@/types/recepcao'
import BotaoPdf from '@/components/BotaoPdf'

function formatarData(d: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function docLink(r: RececaoPeca): string | null {
  if (r.referencia_tipo === 'envio_pecas' && r.referencia_id) return `/logistico/envios-pecas/${r.referencia_id}`
  if (r.referencia_tipo === 'reparacao' && r.referencia_id) return `/logistico/reparacao-pecas/${r.referencia_id}`
  return null
}

export default function DetalheRececaoPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const { isAdmin } = useAuth()
  const [rececao, setRececao] = useState<RececaoPeca | null>(null)
  const [itens, setItens] = useState<RececaoItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpc[]>([])

  useEffect(() => { listarFuncionarios().then(setFuncionarios) }, [])

  const recarregar = useCallback(async () => {
    const { data } = await obterRececao(id)
    setRececao((data as RececaoPeca) ?? null)
    setItens(await listarItensRececao(id))
    setCarregando(false)
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  async function mudar(estado: RececaoPeca['estado']) {
    setATrabalhar(true); setMsg(null)
    await alterarEstadoRececao(id, estado)
    await recarregar()
    setATrabalhar(false)
  }

  async function mudarResponsavel(fid: string) {
    setATrabalhar(true)
    const nome = funcionarios.find((f) => f.id === fid)?.nome ?? null
    await atualizarRececao(id, { responsavel_id: fid || null, responsavel_nome: nome })
    await recarregar()
    setATrabalhar(false)
  }

  async function apagar() {
    if (!confirm('Apagar esta receção? Remove a receção (com peças) e a sua linha do livro de Encomendas.\n\nEsta ação não pode ser revertida.')) return
    setATrabalhar(true); setMsg(null)
    const { error } = await eliminarRececao(id)
    if (error) { setMsg('Não foi possível apagar: ' + error.message); setATrabalhar(false); return }
    router.push('/logistico/encomendas')
  }

  if (carregando) return <main style={c.page}><p style={c.muted}>A carregar...</p></main>
  if (!rececao) return <main style={c.page}><p style={c.muted}>Receção não encontrada.</p></main>

  const i = estadoRececaoInfo(rececao.estado)
  const eCliente = rececao.origem_tipo === 'cliente'
  const origemNome = eCliente ? rececao.cliente_nome : rececao.fornecedor_nome
  const link = docLink(rececao)
  const total = itens.reduce((a, it) => a + it.preco_total, 0)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>{rececao.numero ?? 'Receção'}</h1>
          <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>{i.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <BotaoPdf
            ficheiro={rececao.numero ?? 'rececao'}
            documento={() => ({
              titulo: 'Receção de Encomenda',
              subtitulo: rececao.numero ?? undefined,
              seccoes: [
                { titulo: 'Receção', linhas: [
                  { rotulo: 'Estado', valor: i.label },
                  { rotulo: 'Recebido em', valor: formatarData(rececao.recebido_em ?? rececao.created_at) },
                  { rotulo: 'Motivo', valor: motivoRececaoInfo(rececao.motivo).label },
                ] },
                { titulo: eCliente ? 'Cliente' : 'Fornecedor', linhas: [{ rotulo: 'Nome', valor: origemNome }] },
                { titulo: 'Ligações', linhas: [
                  { rotulo: 'Documento', valor: rececao.referencia_numero },
                  { rotulo: 'Equipamento (S/N)', valor: rececao.equipamento_sn },
                  { rotulo: 'Responsável', valor: rececao.responsavel_nome },
                ] },
                { titulo: 'Notas', linhas: [{ rotulo: 'Notas', valor: rececao.notas }] },
              ],
              tabelas: itens.length ? [{
                titulo: 'Peças',
                colunas: ['Peça', 'S/N', 'Qtd', 'Valor unit.', 'Total'],
                larguras: [3, 2, 1, 1, 1],
                linhas: itens.map((it) => [it.peca_nome, it.serial_number ?? '', it.quantidade, formatarEuro(it.preco_unitario), formatarEuro(it.preco_total)]),
              }] : [],
            })}
          />
          {isAdmin && <button style={c.btnApagar} disabled={aTrabalhar} onClick={apagar}>🗑 Apagar</button>}
          <Link href="/logistico/encomendas" style={c.voltar}>← Encomendas</Link>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      <section style={c.card}>
        <div style={c.cardTitulo}>Funcionário responsável</div>
        <select value={rececao.responsavel_id ?? ''} onChange={(e) => mudarResponsavel(e.target.value)} disabled={aTrabalhar} style={c.input}>
          <option value="">— quem está a tratar —</option>
          {funcionarios.map((fn) => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
        </select>
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>{eCliente ? 'Cliente' : 'Fornecedor'}</div>
        <Linha rotulo="Nome" valor={origemNome} />
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Peças recebidas</div>
        {itens.length === 0 ? <p style={c.muted}>Sem peças.</p> : (
          <div style={c.itens}>
            {itens.map((it) => (
              <div key={it.id} style={c.itemLinha}>
                <span>{it.peca_nome}{it.serial_number && <span style={c.snTag}> · S/N {it.serial_number}</span>}</span>
                <span style={c.muted}>{it.quantidade} × {formatarEuro(it.preco_unitario)}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(it.preco_total)}</span>
              </div>
            ))}
            <div style={c.totalLinha}><span>Total</span><strong>{formatarEuro(total)}</strong></div>
          </div>
        )}
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Receção</div>
        <Linha rotulo="Motivo" valor={motivoRececaoInfo(rececao.motivo).label} />
        <Linha rotulo="Documento ligado" valor={rececao.referencia_numero ? `${rececao.referencia_numero}${rececao.referencia_tipo && rececao.referencia_tipo !== 'manual' ? ` · ${REFERENCIA_TIPO_LABEL[rececao.referencia_tipo]}` : ''}` : null} />
        <Linha rotulo="Equipamento (S/N)" valor={rececao.equipamento_sn} />
        {rececao.notas && <Linha rotulo="Notas" valor={rececao.notas} />}
        {link && <Link href={link} style={c.link}>Ver documento ligado →</Link>}
      </section>

      {rececao.estado === 'aberto' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => mudar('conferido')}>Marcar como Conferido</button>
          <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => mudar('cancelado')}>Cancelar receção</button>
        </div>
      )}
      {rececao.estado === 'conferido' && (
        <div><button style={c.btnGhost} disabled={aTrabalhar} onClick={() => mudar('aberto')}>Reabrir (por conferir)</button></div>
      )}
      {rececao.estado === 'cancelado' && <p style={c.muted}>Esta receção foi cancelada.</p>}
    </main>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return <div style={c.linhaInfo}><span style={c.linhaRotulo}>{rotulo}</span><span style={{ whiteSpace: 'pre-wrap' }}>{valor || '—'}</span></div>
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  btnApagar: { background: 'transparent', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  card: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  linhaInfo: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 14 },
  linhaRotulo: { color: 'var(--muted)', fontWeight: 600 },
  itens: { display: 'flex', flexDirection: 'column', gap: 6 },
  itemLinha: { display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr', gap: 8, fontSize: 14, alignItems: 'center', borderBottom: '1px solid #f4f4f4', paddingBottom: 4 },
  totalLinha: { display: 'flex', justifyContent: 'space-between', paddingTop: 6, fontSize: 15 },
  snTag: { color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 },
  link: { color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', marginTop: 4 },
  muted: { color: 'var(--muted)', fontSize: 14 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 20px', fontWeight: 600, cursor: 'pointer' },
}
