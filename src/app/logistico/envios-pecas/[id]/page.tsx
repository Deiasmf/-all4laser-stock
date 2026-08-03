'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterEnvio, listarItens, alterarEstado, marcarPago, marcarReparacaoVoltou,
  carregarDocumento, notificarProntoExpedir, atualizarEnvio, listarFuncionarios,
  anularEnvio, listarFotos, carregarFoto, apagarFoto,
  type FuncionarioOpc, type EnvioFoto,
} from '@/lib/enviosPecas'
import {
  estadoInfo, transportadoraLabel, formatarEuro, calcularIva, motivoInfo, TRANSPORTADORA_LINK, TRANSPORTADORAS, KEYINVOICE_URL, ehEntregaEmMaos,
  nomeFicheiroEnvio, linkTracking, linkAwb,
  type EnvioPeca, type EnvioItem,
} from '@/types/envioPecas'
import BotaoPdf from '@/components/BotaoPdf'

const hoje = () => new Date().toISOString().slice(0, 10)

function formatarData(d: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

export default function DetalheEnvioPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const { isAdmin, perfil } = useAuth()
  const [envio, setEnvio] = useState<EnvioPeca | null>(null)
  const [itens, setItens] = useState<EnvioItem[]>([])
  const [fotos, setFotos] = useState<EnvioFoto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpc[]>([])

  useEffect(() => { listarFuncionarios().then(setFuncionarios) }, [])

  const recarregar = useCallback(async () => {
    const { data } = await obterEnvio(id)
    setEnvio((data as EnvioPeca) ?? null)
    setItens(await listarItens(id))
    setFotos(await listarFotos(id))
    setCarregando(false)
  }, [id])

  // setState corre só após o await dentro de recarregar()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  const utilizador = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }

  async function mudar(estado: EnvioPeca['estado']) {
    setATrabalhar(true); setMsg(null)
    const { error } = await alterarEstado(id, estado, utilizador)
    if (error) { setMsg('Não foi possível mudar o estado: ' + error.message); setATrabalhar(false); return }
    await recarregar()
    setATrabalhar(false)
  }

  // Reparação: marcar/anular o regresso das peças (atualiza o "em reparação" no stock)
  async function marcarVoltou(voltou: boolean) {
    setATrabalhar(true); setMsg(null)
    await marcarReparacaoVoltou(id, voltou)
    await recarregar()
    setATrabalhar(false)
  }

  // Logística → handoff para o Administrativo
  async function marcarProntoExpedir() {
    setATrabalhar(true); setMsg(null)
    await alterarEstado(id, 'pronto_a_expedir', utilizador)
    const { data } = await obterEnvio(id)
    if (data) await notificarProntoExpedir(data as EnvioPeca).catch(() => {})
    await recarregar()
    setATrabalhar(false)
  }

  function faturar() {
    window.open(KEYINVOICE_URL, '_blank', 'noopener,noreferrer')
  }

  async function mudarTransportadora(t: string) {
    setATrabalhar(true)
    await atualizarEnvio(id, {
      transportadora: t || null,
      transportadora_outro: t === 'Outro' ? envio?.transportadora_outro ?? null : null,
    })
    await recarregar()
    setATrabalhar(false)
  }

  async function guardarTransportadoraOutro(v: string) {
    setATrabalhar(true)
    await atualizarEnvio(id, { transportadora_outro: v.trim() || null })
    await recarregar()
    setATrabalhar(false)
  }

  // Edição livre de campos do envio (dimensões, peso, morada, notas) — depois de criado.
  async function guardarCampo(patch: Partial<EnvioPeca>) {
    setATrabalhar(true); setMsg(null)
    await atualizarEnvio(id, patch)
    await recarregar()
    setATrabalhar(false)
  }
  function guardarNum(campo: 'comprimento_cm' | 'largura_cm' | 'altura_cm' | 'peso_kg', v: string) {
    const t = v.trim()
    const n = t === '' ? null : Number(t.replace(',', '.'))
    if (n !== null && (isNaN(n) || n < 0)) return
    guardarCampo({ [campo]: n })
  }
  function guardarTexto(campo: 'morada_envio' | 'notas', v: string) {
    guardarCampo({ [campo]: v.trim() || null })
  }
  function guardarIva(opcao: string) {
    if (opcao === 'isento') guardarCampo({ iva_isento: true, iva_taxa: 0 })
    else guardarCampo({ iva_isento: false, iva_taxa: Number(opcao) })
  }

  async function uploadFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setATrabalhar(true); setMsg(null)
    for (const f of Array.from(files)) {
      const r = await carregarFoto(id, f)
      if (!r.ok) { setMsg('Erro no upload da foto: ' + (r.motivo ?? '')); break }
    }
    setFotos(await listarFotos(id))
    setATrabalhar(false)
  }
  async function removerFoto(foto: EnvioFoto) {
    if (!confirm('Apagar esta foto?')) return
    setATrabalhar(true); setMsg(null)
    await apagarFoto(foto.id, foto.caminho)
    setFotos(await listarFotos(id))
    setATrabalhar(false)
  }

  async function confirmarExpedicao() {
    // "Entrega em Mãos" não exige carta de porte.
    if (!ehEntregaEmMaos(envio?.transportadora) && !envio?.carta_porte_url) {
      setMsg('Carrega a carta de porte antes de expedir.'); return
    }
    setATrabalhar(true); setMsg(null)
    const { error } = await alterarEstado(id, 'expedido', utilizador)
    if (error) { setMsg('Não foi possível expedir: ' + error.message); setATrabalhar(false); return }
    await recarregar()
    setATrabalhar(false)
  }

  async function upload(tipo: 'fatura' | 'carta_porte', file: File | undefined) {
    if (!file) return
    setATrabalhar(true); setMsg(null)
    const r = await carregarDocumento(id, tipo, file)
    if (!r.ok) setMsg('Erro no upload: ' + (r.motivo ?? ''))
    await recarregar()
    setATrabalhar(false)
  }

  async function mudarResponsavel(fid: string) {
    setATrabalhar(true)
    const nome = funcionarios.find((f) => f.id === fid)?.nome ?? null
    await atualizarEnvio(id, { responsavel_id: fid || null, responsavel_nome: nome })
    await recarregar()
    setATrabalhar(false)
  }

  async function togglePago() {
    if (!envio) return
    setATrabalhar(true); setMsg(null)
    await marcarPago(id, !envio.pago, !envio.pago ? hoje() : null)
    await recarregar()
    setATrabalhar(false)
  }

  async function mudarDataPagamento(data: string) {
    setATrabalhar(true)
    await marcarPago(id, true, data || hoje())
    await recarregar()
    setATrabalhar(false)
  }

  async function apagarEnvio() {
    if (!confirm('Anular este envio? Repõe no stock as peças que tinham sido descontadas na expedição e marca a encomenda como Anulada. O histórico fica registado.')) return
    setATrabalhar(true); setMsg(null)
    const { error } = await anularEnvio(id, utilizador)
    if (error) { setMsg('Não foi possível anular: ' + error.message); setATrabalhar(false); return }
    router.push('/logistico/encomendas')
  }

  async function enviarDocumentos() {
    setATrabalhar(true); setMsg(null)
    try {
      const r = await fetch('/api/envios-pecas/enviar-documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const j = await r.json()
      setMsg(j.ok ? '✅ Documentos enviados ao cliente.' : '⚠️ ' + (j.erro ?? 'Não foi possível enviar.'))
    } catch {
      setMsg('⚠️ Erro de rede ao enviar os documentos.')
    }
    setATrabalhar(false)
  }

  if (carregando) return <main style={c.page}><p style={c.muted}>A carregar...</p></main>
  if (!envio) return <main style={c.page}><p style={c.muted}>Envio não encontrado.</p></main>

  const i = estadoInfo(envio.estado)
  const dims = [envio.comprimento_cm, envio.largura_cm, envio.altura_cm].filter((x) => x != null)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>{envio.numero ?? 'Envio'}</h1>
          <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>{i.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <BotaoPdf
            ficheiro={nomeFicheiroEnvio(envio, itens)}
            documento={() => ({
              titulo: 'Envio de Encomenda',
              subtitulo: envio.numero ?? undefined,
              seccoes: [
                {
                  titulo: 'Envio',
                  linhas: [
                    { rotulo: 'Estado', valor: i.label },
                    { rotulo: 'Expedido em', valor: formatarData(envio.expedido_em ?? envio.created_at) },
                  ],
                },
                {
                  titulo: envio.destinatario_tipo === 'fornecedor' ? 'Fornecedor' : 'Cliente',
                  linhas: envio.destinatario_tipo === 'fornecedor'
                    ? [{ rotulo: 'Nome', valor: envio.fornecedor_nome }]
                    : [
                        { rotulo: 'Nome', valor: envio.cliente_nome },
                        { rotulo: 'Email', valor: envio.cliente_email },
                        { rotulo: 'Morada', valor: envio.morada_envio },
                      ],
                },
                {
                  titulo: 'Envio',
                  linhas: [
                    { rotulo: 'Motivo', valor: motivoInfo(envio.motivo).label },
                    { rotulo: 'Faturável', valor: envio.faturavel ? 'Sim' : 'Não' },
                  ],
                },
                {
                  titulo: 'Logística',
                  linhas: [
                    { rotulo: 'Responsável', valor: envio.responsavel_nome },
                    { rotulo: 'Transportadora', valor: transportadoraLabel(envio) },
                    { rotulo: 'Nº de tracking', valor: envio.tracking_numero },
                    { rotulo: 'Nº de AWB', valor: envio.awb_numero },
                    { rotulo: 'Peso (kg)', valor: envio.peso_kg },
                    {
                      rotulo: 'Dimensões',
                      valor: dims.length === 3
                        ? `${envio.comprimento_cm}x${envio.largura_cm}x${envio.altura_cm} cm`
                        : null,
                    },
                  ],
                },
                {
                  titulo: 'Pagamento',
                  linhas: [
                    { rotulo: 'Valor (sem IVA)', valor: formatarEuro(envio.valor_a_faturar) },
                    { rotulo: 'IVA', valor: calcularIva(envio).isento ? 'Isento de IVA' : `${formatarEuro(calcularIva(envio).iva)} (${calcularIva(envio).taxa}%)` },
                    { rotulo: 'Total a faturar', valor: formatarEuro(calcularIva(envio).total) },
                    { rotulo: 'Pago', valor: envio.pago },
                    { rotulo: 'Data pagamento', valor: formatarData(envio.data_pagamento) },
                  ],
                },
                {
                  titulo: 'Notas',
                  linhas: [{ rotulo: 'Notas', valor: envio.notas }],
                },
              ],
              tabelas: itens.length
                ? [{
                    titulo: 'Itens',
                    colunas: ['Peça', 'S/N', 'Qtd', 'Preço unit.', 'Total'],
                    larguras: [3, 2, 1, 1, 1],
                    linhas: itens.map((it) => [
                      it.peca_nome,
                      it.serial_number ?? '',
                      it.quantidade,
                      formatarEuro(it.preco_unitario),
                      formatarEuro(it.preco_total),
                    ]),
                  }]
                : [],
            })}
          />
          {isAdmin && (
            <button style={c.btnApagar} disabled={aTrabalhar} onClick={apagarEnvio}>🚫 Anular</button>
          )}
          <Link href="/logistico/encomendas" style={c.voltar}>← Encomendas</Link>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      {/* Funcionário responsável */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Funcionário responsável</div>
        <select
          value={envio.responsavel_id ?? ''}
          onChange={(e) => mudarResponsavel(e.target.value)}
          disabled={aTrabalhar}
          style={c.input}
        >
          <option value="">— quem está a tratar —</option>
          {funcionarios.map((fn) => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
        </select>
      </section>

      {/* Dados */}
      <section style={c.card}>
        <div style={c.cardTitulo}>{envio.destinatario_tipo === 'fornecedor' ? 'Fornecedor' : 'Cliente'}</div>
        {envio.destinatario_tipo === 'fornecedor' ? (
          <Linha rotulo="Nome" valor={envio.fornecedor_nome} />
        ) : (
          <>
            <Linha rotulo="Nome" valor={envio.cliente_nome} />
            <Linha rotulo="Email" valor={envio.cliente_email} />
            <div style={c.campoEdit}>
              <span style={c.rotulo}>Morada de envio</span>
              <textarea
                key={'morada' + (envio.morada_envio ?? '')}
                defaultValue={envio.morada_envio ?? ''}
                onBlur={(e) => guardarTexto('morada_envio', e.target.value)}
                disabled={aTrabalhar}
                placeholder="Morada de entrega"
                style={{ ...c.input, minHeight: 56, resize: 'vertical', marginTop: 4 }}
              />
            </div>
          </>
        )}
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Itens</div>
        {itens.length === 0 ? <p style={c.muted}>Sem itens.</p> : (
          <div style={c.itens}>
            {itens.map((it) => (
              <div key={it.id} style={c.itemLinha}>
                <span>
                  {it.peca_nome}
                  {it.serial_number && <span style={c.snTag}> · S/N {it.serial_number}</span>}
                </span>
                <span style={c.muted}>{it.quantidade} × {formatarEuro(it.preco_unitario)}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(it.preco_total)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Envio</div>
        <Linha rotulo="Motivo" valor={motivoInfo(envio.motivo).label} />
        <Linha rotulo="Faturável" valor={envio.faturavel ? 'Sim' : 'Não (sem custo associado)'} />
        <Linha rotulo="Transportadora" valor={transportadoraLabel(envio)} />
        {envio.tracking_numero && (
          <div style={c.linhaInfo}>
            <span style={c.linhaRotulo}>Nº de tracking</span>
            <span>
              {linkTracking(envio)
                ? <a href={linkTracking(envio) as string} target="_blank" rel="noopener noreferrer" style={c.link}>{envio.tracking_numero} ↗</a>
                : envio.tracking_numero}
            </span>
          </div>
        )}
        {envio.awb_numero && (
          <div style={c.linhaInfo}>
            <span style={c.linhaRotulo}>Nº de AWB</span>
            <span>
              {linkAwb(envio.awb_numero)
                ? <a href={linkAwb(envio.awb_numero) as string} target="_blank" rel="noopener noreferrer" style={c.link}>{envio.awb_numero} ↗</a>
                : envio.awb_numero}
            </span>
          </div>
        )}
        {ehEntregaEmMaos(envio.transportadora) && (
          <>
            <Linha rotulo="Carta de porte" valor="Entrega em Mãos — sem carta de porte" />
            {envio.entregue_a && <Linha rotulo="Entregue a" valor={envio.entregue_a} />}
            {envio.entregue_em && <Linha rotulo="Data de entrega" valor={envio.entregue_em.split('-').reverse().join('/')} />}
          </>
        )}
        {envio.faturavel && (() => {
          const b = calcularIva(envio)
          return (
            <>
              <Linha rotulo="Valor (sem IVA)" valor={formatarEuro(envio.valor_a_faturar)} />
              <div style={c.campoEdit}>
                <span style={c.rotulo}>IVA</span>
                <select
                  value={envio.iva_isento ? 'isento' : String(Number(envio.iva_taxa))}
                  onChange={(e) => guardarIva(e.target.value)}
                  disabled={aTrabalhar}
                  style={{ ...c.input, maxWidth: 200, marginTop: 4 }}
                >
                  <option value="23">23%</option>
                  <option value="6">6%</option>
                  <option value="isento">Isento de IVA</option>
                </select>
              </div>
              <Linha rotulo="IVA" valor={b.isento ? 'Isento de IVA' : `${formatarEuro(b.iva)} (${b.taxa}%)`} />
              <Linha rotulo="Total a faturar" valor={formatarEuro(b.total)} />
            </>
          )
        })()}
      </section>

      {/* Editável depois de criar: dimensões, peso e notas */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Dimensões, peso e notas</div>
        <p style={c.ajuda}>Preenche depois de criar o envio. Guarda automaticamente ao sair de cada campo.</p>
        <div style={c.grelhaDim}>
          {([
            ['comprimento_cm', 'Comprimento (cm)'],
            ['largura_cm', 'Largura (cm)'],
            ['altura_cm', 'Altura (cm)'],
            ['peso_kg', 'Peso (kg)'],
          ] as const).map(([campo, rotulo]) => (
            <label key={campo} style={c.campoEdit}>
              <span style={c.rotulo}>{rotulo}</span>
              <input
                key={campo + (envio[campo] ?? '')}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                defaultValue={envio[campo] ?? ''}
                onBlur={(e) => guardarNum(campo, e.target.value)}
                disabled={aTrabalhar}
                style={{ ...c.input, marginTop: 4 }}
              />
            </label>
          ))}
        </div>
        <label style={{ ...c.campoEdit, marginTop: 6 }}>
          <span style={c.rotulo}>Notas</span>
          <textarea
            key={'notas' + (envio.notas ?? '')}
            defaultValue={envio.notas ?? ''}
            onBlur={(e) => guardarTexto('notas', e.target.value)}
            disabled={aTrabalhar}
            placeholder="Notas do envio"
            style={{ ...c.input, minHeight: 64, resize: 'vertical', marginTop: 4 }}
          />
        </label>
      </section>

      {/* Rastreio (tracking) e AWB */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Rastreio e AWB</div>
        <p style={c.ajuda}>Nº de tracking da transportadora para seguir a encomenda e nº de AWB (Air Waybill) para localizar envios aéreos. Guarda automaticamente ao sair do campo.</p>
        <div style={c.grelhaDim}>
          <label style={c.campoEdit}>
            <span style={c.rotulo}>Nº de tracking (seguimento)</span>
            <input
              key={'trk' + (envio.tracking_numero ?? '')}
              defaultValue={envio.tracking_numero ?? ''}
              onBlur={(e) => guardarCampo({ tracking_numero: e.target.value.trim() || null })}
              disabled={aTrabalhar}
              placeholder="Ex.: 1Z999AA10123456784"
              style={{ ...c.input, marginTop: 4 }}
            />
            {linkTracking(envio) && (
              <a href={linkTracking(envio) as string} target="_blank" rel="noopener noreferrer" style={{ ...c.link, marginTop: 6, fontSize: 13 }}>
                Seguir envio em {transportadoraLabel(envio)} ↗
              </a>
            )}
          </label>
          <label style={c.campoEdit}>
            <span style={c.rotulo}>Nº de AWB (envio aéreo)</span>
            <input
              key={'awb' + (envio.awb_numero ?? '')}
              defaultValue={envio.awb_numero ?? ''}
              onBlur={(e) => guardarCampo({ awb_numero: e.target.value.trim() || null })}
              disabled={aTrabalhar}
              placeholder="Ex.: 020-12345675"
              style={{ ...c.input, marginTop: 4 }}
            />
            {linkAwb(envio.awb_numero) && (
              <a href={linkAwb(envio.awb_numero) as string} target="_blank" rel="noopener noreferrer" style={{ ...c.link, marginTop: 6, fontSize: 13 }}>
                Localizar carga aérea ↗
              </a>
            )}
          </label>
        </div>
      </section>

      {/* Fotos */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Fotos</div>
        <p style={c.ajuda}>Fotos do envio (embalagem, etiqueta, conteúdo…). Podes carregar várias.</p>
        {fotos.length > 0 && (
          <div style={c.galeria}>
            {fotos.map((foto) => (
              <div key={foto.id} style={c.fotoBox}>
                <a href={foto.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="Foto do envio" style={c.fotoImg} />
                </a>
                <button style={c.fotoRemover} disabled={aTrabalhar} onClick={() => removerFoto(foto)} title="Apagar foto">✕</button>
              </div>
            ))}
          </div>
        )}
        <label style={{ ...c.uploadLabel, marginTop: fotos.length ? 10 : 0, alignSelf: 'flex-start' }}>
          + Adicionar fotos
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => uploadFotos(e.target.files)} />
        </label>
      </section>

      {/* Documentos */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Documentos</div>
        <div style={c.docLinha}>
          <span>Carta de porte</span>
          {envio.carta_porte_url
            ? <a href={envio.carta_porte_url} target="_blank" rel="noopener noreferrer" style={c.link}>Ver documento ↗</a>
            : ehEntregaEmMaos(envio.transportadora)
              ? <span style={c.muted}>Entrega em Mãos — sem carta de porte</span>
              : <span style={c.muted}>— por carregar</span>}
        </div>
        <div style={c.docLinha}>
          <span>Fatura</span>
          {envio.fatura_url
            ? <a href={envio.fatura_url} target="_blank" rel="noopener noreferrer" style={c.link}>Ver documento ↗</a>
            : <span style={c.muted}>— por carregar</span>}
        </div>
      </section>

      {/* Ações por estado */}
      {envio.estado === 'aberto' && (
        <Acoes>
          <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => mudar('a_realizar')}>Marcar como A Realizar</button>
          <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => mudar('cancelado')}>Cancelar envio</button>
        </Acoes>
      )}

      {envio.estado === 'a_realizar' && (
        <Acoes>
          <button style={c.btnPrimario} disabled={aTrabalhar} onClick={marcarProntoExpedir}>Marcar como Pronto a Expedir</button>
        </Acoes>
      )}

      {/* Logística termina em "pronto a expedir"; daqui para a frente é Administrativo */}
      {envio.estado === 'pronto_a_expedir' && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Administrativo — Faturação e expedição</div>

          {/* 1. Faturar (Keyinvoice) */}
          <button style={c.btnSecundario} disabled={aTrabalhar} onClick={faturar}>🧾 Faturar (abrir Keyinvoice)</button>

          {/* 2. Transportadora — escolher e abrir o site para fazer a carta de porte */}
          <div style={{ marginTop: 12 }}>
            <div style={c.rotulo}>Transportadora</div>
            <select value={envio.transportadora ?? ''} onChange={(e) => mudarTransportadora(e.target.value)} disabled={aTrabalhar} style={{ ...c.input, maxWidth: 240, marginTop: 4 }}>
              <option value="">— escolher —</option>
              {TRANSPORTADORAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {envio.transportadora === 'Outro' && (
              <input
                key={envio.transportadora_outro ?? ''}
                defaultValue={envio.transportadora_outro ?? ''}
                placeholder="Qual transportadora?"
                onBlur={(e) => guardarTransportadoraOutro(e.target.value)}
                style={{ ...c.input, maxWidth: 240, marginTop: 8, display: 'block' }}
              />
            )}
            {!ehEntregaEmMaos(envio.transportadora) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {(['Nacex', 'UPS', 'FedEx'] as const).map((t) => (
                  <a key={t} href={TRANSPORTADORA_LINK[t]} target="_blank" rel="noopener noreferrer" style={c.btnTrans}>Abrir {t} ↗</a>
                ))}
              </div>
            )}
          </div>

          {/* Entrega em Mãos: sem carta de porte; regista opcionalmente quem recebeu e quando */}
          {ehEntregaEmMaos(envio.transportadora) && (
            <div style={{ marginTop: 12 }}>
              <div style={c.rotulo}>Entregue a (nome) — opcional</div>
              <input
                key={`ea-${envio.entregue_a ?? ''}`}
                defaultValue={envio.entregue_a ?? ''}
                placeholder="Nome de quem recebeu"
                onBlur={(e) => guardarCampo({ entregue_a: e.target.value.trim() || null })}
                style={{ ...c.input, maxWidth: 240, marginTop: 4, display: 'block' }}
              />
              <div style={{ ...c.rotulo, marginTop: 8 }}>Data de entrega — opcional</div>
              <input
                type="date"
                key={`ee-${envio.entregue_em ?? ''}`}
                defaultValue={envio.entregue_em ?? ''}
                onBlur={(e) => guardarCampo({ entregue_em: e.target.value || null })}
                style={{ ...c.input, maxWidth: 240, marginTop: 4, display: 'block' }}
              />
            </div>
          )}

          {/* 3. Adicionar carta de porte (exceto entrega em mãos) e fatura */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {!ehEntregaEmMaos(envio.transportadora) && (
              <label style={c.uploadLabel}>
                {envio.carta_porte_url ? 'Substituir carta de porte ✓' : 'Carregar carta de porte'}
                <input type="file" style={{ display: 'none' }} onChange={(e) => upload('carta_porte', e.target.files?.[0])} />
              </label>
            )}
            <label style={c.uploadLabel}>
              {envio.fatura_url ? 'Substituir fatura ✓' : 'Carregar fatura'}
              <input type="file" style={{ display: 'none' }} onChange={(e) => upload('fatura', e.target.files?.[0])} />
            </label>
          </div>

          {/* 4. Confirmar expedição */}
          <button style={{ ...c.btnPrimario, marginTop: 14 }} disabled={aTrabalhar || (!ehEntregaEmMaos(envio.transportadora) && !envio.carta_porte_url)} onClick={confirmarExpedicao}>
            Confirmar Expedição
          </button>
          {ehEntregaEmMaos(envio.transportadora)
            ? <p style={c.ajuda}>Entrega em Mãos — sem carta de porte.</p>
            : !envio.carta_porte_url && <p style={c.ajuda}>Carrega a carta de porte para poder expedir.</p>}
        </section>
      )}

      {envio.estado === 'expedido' && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Administrativo — Cliente e pagamento</div>

          <button style={c.btnSecundario} disabled={aTrabalhar} onClick={enviarDocumentos}>
            ✉️ Enviar documentos ao cliente
          </button>
          {!envio.fatura_url && <p style={c.ajuda}>Sugestão: carrega a fatura antes de enviar (na fase anterior).</p>}

          {/* Pago toggle */}
          <div style={{ marginTop: 16 }}>
            <div style={c.rotulo}>Pagamento</div>
            <button
              onClick={togglePago}
              disabled={aTrabalhar}
              style={{ ...c.toggle, background: envio.pago ? '#15803D' : '#DC2626' }}
              aria-pressed={envio.pago}
            >
              <span style={{ ...c.toggleKnob, transform: envio.pago ? 'translateX(26px)' : 'translateX(0)' }} />
              <span style={c.toggleTexto}>{envio.pago ? 'Pago' : 'Não pago'}</span>
            </button>

            {envio.pago && (
              <div style={{ marginTop: 10 }}>
                <label style={c.rotulo}>Data de pagamento</label>
                <input type="date" value={envio.data_pagamento ?? hoje()} onChange={(e) => mudarDataPagamento(e.target.value)} style={{ ...c.input, maxWidth: 200, display: 'block', marginTop: 4 }} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Reparação: regresso das peças (reflete no "em reparação" do Stock de Peças) */}
      {envio.destinatario_tipo === 'fornecedor' && envio.motivo === 'reparacao' && envio.estado === 'expedido' && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Reparação</div>
          {envio.reparacao_voltou_em ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={c.muted}>✅ Peças voltaram da reparação em {formatarData(envio.reparacao_voltou_em)}.</span>
              <button style={c.btnSecundario} disabled={aTrabalhar} onClick={() => marcarVoltou(false)}>Anular</button>
            </div>
          ) : (
            <>
              <p style={c.ajuda}>Enquanto não voltam, as peças deste envio contam como “em reparação” no Stock de Peças.</p>
              <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => marcarVoltou(true)}>🔧 Peças voltaram da reparação</button>
            </>
          )}
        </section>
      )}

      {envio.estado === 'cancelado' && <p style={c.muted}>Este envio foi cancelado.</p>}
    </main>
  )
}

function Acoes({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div style={c.linhaInfo}>
      <span style={c.linhaRotulo}>{rotulo}</span>
      <span style={{ whiteSpace: 'pre-wrap' }}>{valor || '—'}</span>
    </div>
  )
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
  snTag: { color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 },
  docLinha: { display: 'flex', justifyContent: 'space-between', fontSize: 14 },
  link: { color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' },
  muted: { color: 'var(--muted)', fontSize: 14 },
  ajuda: { color: 'var(--muted)', fontSize: 13, margin: 0 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  campoEdit: { display: 'flex', flexDirection: 'column' },
  grelhaDim: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 },
  galeria: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  fotoBox: { position: 'relative', width: 100, height: 100, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' },
  fotoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer' },
  fotoRemover: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '22px', padding: 0 },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  uploadLabel: { display: 'inline-block', background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnSecundario: { background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '12px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 15, marginTop: 8 },
  btnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 20px', fontWeight: 600, cursor: 'pointer' },
  btnTrans: { background: 'var(--accent-bg, #eef1f6)', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontWeight: 700, textDecoration: 'none' },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 999, padding: '6px 14px 6px 8px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14, marginTop: 6, minWidth: 110 },
  toggleKnob: { width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s', display: 'inline-block' },
  toggleTexto: { marginLeft: 4 },
}
