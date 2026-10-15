'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { obterParagem, equipamentoParagem, dataCurta, diaSemanaPt, type TransportStop } from '@/lib/transportes'
import AssinaturaPad from '@/components/AssinaturaPad'
import {
  listarCartuchosAtivos, listarUnidadesModelo, registoDaParagem, gravarEntrega, gravarRecolha,
  uploadFotoUltraformer, uploadAssinaturaUltraformer, assinaturaDataUrl, rotuloCartucho,
  type Cartucho, type RegistoUltraformer, type UnidadeEquip,
} from '@/lib/ultraformerRegistos'
import { gerarFolhaUltraformerPdf } from '@/lib/ultraformerFolhaPdf'
import { calcularValorUltraformer, contarDiasMesAntes, tarifarioVigente, resumoCalculo, type ResultadoCalculo, type Tarifario } from '@/lib/ultraformerCalculo'

// Ecrã mobile de registo de pulsos do Ultraformer III (entrega e recolha).
// Feito pelo motorista/logística na clínica, validado pelo responsável da clínica.

export default function RegistoPulsosPage() {
  const params = useParams<{ stopId: string }>()
  const stopId = params?.stopId as string
  const router = useRouter()
  const { session, perfil, perfilCarregado } = useAuth()
  const responsavelNome = perfil?.nome ?? session?.user?.email ?? null

  const [stop, setStop] = useState<TransportStop | null>(null)
  const [registo, setRegisto] = useState<RegistoUltraformer | null>(null)
  const [cartuchos, setCartuchos] = useState<Cartucho[]>([])
  const [unidades, setUnidades] = useState<UnidadeEquip[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!stopId) return
    setCarregando(true)
    const s = await obterParagem(stopId)
    setStop(s)
    const modelo = s?.calendario?.modelo ?? 'Ultraformer III'
    const [reg, carts, units] = await Promise.all([
      s ? registoDaParagem({ id: s.id, tipo: s.tipo, google_event_id: s.google_event_id }) : Promise.resolve(null),
      listarCartuchosAtivos(),
      s && s.tipo === 'entrega' ? listarUnidadesModelo(modelo) : Promise.resolve([]),
    ])
    setRegisto(reg)
    setCartuchos(carts)
    setUnidades(units)
    setCarregando(false)
  }, [stopId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  if (perfilCarregado && !session) return <Aviso texto="Inicia sessão para registar os pulsos." />
  if (carregando) return <Aviso texto="A carregar…" />
  if (!stop) return <Aviso texto="Paragem não encontrada." />

  const eRecolha = stop.tipo === 'recolha'

  return (
    <main style={c.wrap}>
      <header style={c.header}>
        <Link href="/alugueres/agenda/motorista" style={c.voltar}>‹ Agenda</Link>
        <h1 style={c.titulo}>{eRecolha ? 'Registo de pulsos — Recolha' : 'Registo de pulsos — Entrega'}</h1>
        <div style={c.sub}>
          <div><b>{stop.cliente_nome ?? '(sem cliente)'}</b></div>
          <div style={c.meta}>{equipamentoParagem(stop) || 'Ultraformer III'}</div>
          <div style={c.meta}>{diaSemanaPt(stop.data)}, {dataCurta(stop.data)} · Responsável All4laser: {responsavelNome ?? '—'}</div>
        </div>
      </header>

      {eRecolha
        ? <FormRecolha stop={stop} registo={registo} responsavelId={session?.user?.id ?? null} responsavelNome={responsavelNome} onFim={() => router.push('/alugueres/agenda/motorista')} />
        : <FormEntrega stop={stop} cartuchos={cartuchos} unidades={unidades} registoExistente={registo} responsavelId={session?.user?.id ?? null} responsavelNome={responsavelNome} onFim={() => router.push('/alugueres/agenda/motorista')} />}
    </main>
  )
}

// ─── ENTREGA ─────────────────────────────────────────────────────────────────
function FormEntrega({ stop, cartuchos, unidades, registoExistente, responsavelId, responsavelNome, onFim }: {
  stop: TransportStop; cartuchos: Cartucho[]; unidades: UnidadeEquip[]; registoExistente: RegistoUltraformer | null
  responsavelId: string | null; responsavelNome: string | null; onFim: () => void
}) {
  const [unidadeId, setUnidadeId] = useState<string>(
    registoExistente?.equipamento_id ?? stop.equipamento_id ?? (unidades.length === 1 ? unidades[0].id : ''),
  )
  const [contadores, setContadores] = useState<Record<string, string>>({})
  const [clinicaResp, setClinicaResp] = useState(registoExistente?.clinica_resp_entrega ?? '')
  const [validacao, setValidacao] = useState(registoExistente?.clinica_validacao_entrega ?? false)
  const [assinaturaCaminho, setAssinaturaCaminho] = useState<string | null>(registoExistente?.assinatura_entrega_caminho ?? null)
  const [mostrarPad, setMostrarPad] = useState(false)
  const [aGuardarAssinatura, setAGuardarAssinatura] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [obs, setObs] = useState(registoExistente?.obs_entrega ?? '')
  const [guardando, setGuardando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)

  const linhas = useMemo(() => cartuchos.map((cart) => {
    const v = contadores[cart.id]
    const n = v != null && v !== '' ? Number(v) : null
    return { cart, n }
  }), [cartuchos, contadores])
  const aBordo = linhas.filter((l) => l.n != null && !Number.isNaN(l.n))

  async function guardarAssinatura(blob: Blob) {
    setAGuardarAssinatura(true)
    const caminho = await uploadAssinaturaUltraformer(stop.id, blob)
    setAGuardarAssinatura(false)
    if (caminho) { setAssinaturaCaminho(caminho); setMostrarPad(false) }
    else setErro('Falha ao guardar a assinatura.')
  }

  async function submeter() {
    setErro(null)
    const unidade = unidades.find((u) => u.id === unidadeId) ?? null
    const equipamentoId = unidade?.id ?? stop.equipamento_id ?? null
    const serial = unidade?.serial_number ?? stop.serial_number ?? stop.calendario?.equipamento?.serial_number ?? null
    if (unidades.length > 0 && !equipamentoId) { setErro('Escolhe a unidade que vai para a clínica.'); return }
    if (aBordo.length === 0) { setErro('Indica o contador de pelo menos um cartucho.'); return }
    if (!clinicaResp.trim()) { setErro('Indica o nome do responsável da clínica.'); return }
    if (!assinaturaCaminho && !validacao) { setErro('Recolhe a assinatura da clínica ou marca a validação presencial.'); return }
    setGuardando(true)
    const fotoCaminho = foto ? await uploadFotoUltraformer(stop.id, foto) : null
    const r = await gravarEntrega({
      stop: { id: stop.id, cliente_id: stop.cliente_id, cliente_nome: stop.cliente_nome, equipamento_id: equipamentoId, serial_number: serial },
      responsavelId, responsavelNome,
      linhas: aBordo.map((l) => ({ cartucho_id: l.cart.id, area: l.cart.area, profundidade_mm: l.cart.profundidade_mm, serial_number: l.cart.serial_number, contador_entrega: l.n as number })),
      clinicaResp: clinicaResp.trim(), clinicaValidacao: validacao,
      assinaturaCaminho, fotoCaminho, obs: obs.trim() || null,
    })
    setGuardando(false)
    if (!r.ok) { setErro(r.erro ?? 'Erro ao guardar.'); return }
    setFeito(true)
  }

  if (feito) return (
    <div style={c.form}>
      <Sucesso texto="Entrega registada ✓" />
      <BotaoFolha stop={stop} />
      <button onClick={onFim} style={c.btnSecundario}>Voltar à agenda</button>
    </div>
  )

  return (
    <div style={c.form}>
      {unidades.length > 0 && (
        <Seccao titulo="Unidade que vai para a clínica" subtitulo="Escolhe qual equipamento Ultraformer segue nesta entrega.">
          <select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} style={c.inputTexto}>
            <option value="">— escolher unidade —</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.serial_number ?? u.id}{u.modelo ? ` · ${u.modelo}` : ''}</option>
            ))}
          </select>
        </Seccao>
      )}

      <SeccaoCartuchos
        titulo="Contadores na entrega"
        subtitulo="Preenche o contador de pulsos de cada cartucho a bordo."
        cartuchos={cartuchos} valores={contadores} onChange={(id, v) => setContadores((p) => ({ ...p, [id]: v }))}
      />

      <Seccao titulo="Foto do ecrã de contadores (opcional)">
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} style={c.file} />
        {foto && <div style={c.hint}>{foto.name}</div>}
      </Seccao>

      <SeccaoClinica
        clinicaResp={clinicaResp} setClinicaResp={setClinicaResp}
        validacao={validacao} setValidacao={setValidacao}
        assinaturaCaminho={assinaturaCaminho} mostrarPad={mostrarPad} setMostrarPad={setMostrarPad}
        aGuardarAssinatura={aGuardarAssinatura} onAssinatura={guardarAssinatura}
        obs={obs} setObs={setObs}
      />

      {erro && <div style={c.erro}>{erro}</div>}
      <button onClick={submeter} disabled={guardando} style={c.btnPrincipal}>{guardando ? 'A guardar…' : 'Registar entrega'}</button>
    </div>
  )
}

// ─── RECOLHA ─────────────────────────────────────────────────────────────────
type EstadoLinhaRecolha = { recolha: string; override: boolean; motivo: string; corrigido: string }

function FormRecolha({ stop, registo, responsavelId, responsavelNome, onFim }: {
  stop: TransportStop; registo: RegistoUltraformer | null
  responsavelId: string | null; responsavelNome: string | null; onFim: () => void
}) {
  const [estados, setEstados] = useState<Record<string, EstadoLinhaRecolha>>({})
  const [diasAluguer, setDiasAluguer] = useState('1')
  const [tar, setTar] = useState<Tarifario | null>(null)
  const [diasMesAntes, setDiasMesAntes] = useState(0)
  const [clinicaResp, setClinicaResp] = useState('')
  const [validacao, setValidacao] = useState(false)
  const [assinaturaCaminho, setAssinaturaCaminho] = useState<string | null>(null)
  const [mostrarPad, setMostrarPad] = useState(false)
  const [aGuardarAssinatura, setAGuardarAssinatura] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [obs, setObs] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoCalculo | null>(null)

  useEffect(() => {
    tarifarioVigente().then(setTar)
    if (registo?.cliente_id && registo?.data_entrega) {
      contarDiasMesAntes(registo.cliente_id, registo.data_entrega, registo.id).then(setDiasMesAntes)
    }
  }, [registo])

  const linhas = registo?.linhas ?? []
  const est = (id: string): EstadoLinhaRecolha => estados[id] ?? { recolha: '', override: false, motivo: '', corrigido: '' }
  function setLinha(id: string, patch: Partial<EstadoLinhaRecolha>) {
    setEstados((p) => ({ ...p, [id]: { ...est(id), ...patch } }))
  }

  // Pulsos usados por linha (recolha − entrega, ou corrigido manual no override).
  function usadosLinha(l: { id: string; area: string; contador_entrega: number }): { usados: number | null; regrediu: boolean } {
    const e = est(l.id)
    const rec = e.recolha !== '' ? Number(e.recolha) : null
    if (rec == null || Number.isNaN(rec)) return { usados: null, regrediu: false }
    const regrediu = rec < l.contador_entrega
    if (e.override && e.corrigido !== '') return { usados: Math.max(0, Number(e.corrigido)), regrediu }
    return { usados: Math.max(0, rec - l.contador_entrega), regrediu }
  }

  const totais = useMemo(() => {
    let rosto = 0, corpo = 0, faltam = false
    for (const l of linhas) {
      const { usados } = usadosLinha(l)
      if (usados == null) { faltam = true; continue }
      if (l.area === 'rosto') rosto += usados; else corpo += usados
    }
    return { rosto, corpo, geral: rosto + corpo, faltam }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, estados])

  const resultado: ResultadoCalculo | null = useMemo(() => {
    if (!tar) return null
    const dias = Math.max(1, Number(diasAluguer) || 1)
    return calcularValorUltraformer({ pulsosRosto: totais.rosto, pulsosCorpo: totais.corpo, diasAluguer: dias, diasMesAntes }, tar)
  }, [tar, totais.rosto, totais.corpo, diasAluguer, diasMesAntes])

  async function guardarAssinatura(blob: Blob) {
    setAGuardarAssinatura(true)
    const caminho = await uploadAssinaturaUltraformer(stop.id, blob)
    setAGuardarAssinatura(false)
    if (caminho) { setAssinaturaCaminho(caminho); setMostrarPad(false) }
    else setErro('Falha ao guardar a assinatura.')
  }

  async function submeter() {
    setErro(null)
    const linhasInput = linhas.map((l) => {
      const e = est(l.id)
      const rec = e.recolha !== '' ? Number(e.recolha) : null
      return { l, e, rec }
    })
    if (linhasInput.some((x) => x.rec == null || Number.isNaN(x.rec))) { setErro('Preenche o contador de recolha de todos os cartuchos.'); return }
    const regrediuSemMotivo = linhasInput.some((x) => (x.rec as number) < x.l.contador_entrega && !(x.e.override && x.e.motivo.trim()))
    if (regrediuSemMotivo) { setErro('Há contadores de recolha inferiores à entrega. Confirma o override e indica o motivo.'); return }
    if (!clinicaResp.trim()) { setErro('Indica o nome do responsável da clínica.'); return }
    if (!assinaturaCaminho && !validacao) { setErro('Recolhe a assinatura da clínica ou marca a validação presencial.'); return }

    setGuardando(true)
    const fotoCaminho = foto ? await uploadFotoUltraformer(stop.id, foto) : null
    const r = await gravarRecolha({
      registoId: registo!.id, stopRecolhaId: stop.id, responsavelId, responsavelNome,
      linhas: linhasInput.map((x) => ({
        linha_id: x.l.id, contador_recolha: x.rec as number,
        override_regressao: x.e.override, override_motivo: x.e.override ? (x.e.motivo.trim() || null) : null,
        pulsos_corrigido: x.e.override && x.e.corrigido !== '' ? Number(x.e.corrigido) : null,
      })),
      diasAluguer: Math.max(1, Number(diasAluguer) || 1),
      clinicaResp: clinicaResp.trim(), clinicaValidacao: validacao,
      assinaturaCaminho, fotoCaminho, obs: obs.trim() || null,
    })
    // Upload da foto já feito acima; se falhou o upload o caminho fica null (foto é opcional).
    void fotoCaminho
    setGuardando(false)
    if (!r.ok) { setErro(r.erro ?? 'Erro ao guardar.'); return }
    setResultadoFinal(r.resultado ?? resultado ?? null)
  }

  if (!registo) {
    return (
      <div style={c.form}>
        <div style={c.aviso}>Ainda não há registo de <b>entrega</b> para esta reserva. Faz primeiro o registo na entrega.</div>
        <button onClick={onFim} style={c.btnSecundario}>Voltar à agenda</button>
      </div>
    )
  }

  if (resultadoFinal) {
    return (
      <div style={c.form}>
        <Sucesso texto="Recolha registada ✓" />
        <ResumoValor r={resultadoFinal} />
        <BotaoFolha stop={stop} />
        <div style={c.hint}>Próximo passo (a implementar): criar o pedido de fatura pré-preenchido para a Vanessa, com esta folha anexada.</div>
        <button onClick={onFim} style={c.btnSecundario}>Voltar à agenda</button>
      </div>
    )
  }

  return (
    <div style={c.form}>
      <Seccao titulo="Contadores na recolha" subtitulo="Mostra os contadores da entrega; preenche o da recolha. Os pulsos usados são calculados automaticamente.">
        {linhas.map((l) => {
          const e = est(l.id)
          const { usados, regrediu } = usadosLinha(l)
          return (
            <div key={l.id} style={c.linhaRec}>
              <div style={c.linhaTopo}>
                <span style={{ fontWeight: 700 }}>{rotuloCartucho(l)}</span>
                <span style={c.entregaTag}>Entrega: {l.contador_entrega}</span>
              </div>
              <div style={c.linhaInputs}>
                <input inputMode="numeric" value={e.recolha} onChange={(ev) => setLinha(l.id, { recolha: ev.target.value.replace(/[^0-9]/g, '') })} placeholder="Contador recolha" style={c.inputNum} />
                <span style={{ ...c.usados, color: regrediu && !e.override ? 'var(--danger)' : 'var(--foreground)' }}>
                  {usados == null ? '—' : `${usados} pulsos`}
                </span>
              </div>
              {regrediu && (
                <div style={c.overrideBox}>
                  <div style={c.overrideAviso}>⚠ O contador de recolha é inferior ao da entrega (não pode andar para trás).</div>
                  <label style={c.checkRow}>
                    <input type="checkbox" checked={e.override} onChange={(ev) => setLinha(l.id, { override: ev.target.checked })} />
                    Confirmar mesmo assim (troca de cartucho / reset do contador)
                  </label>
                  {e.override && (
                    <>
                      <input value={e.motivo} onChange={(ev) => setLinha(l.id, { motivo: ev.target.value })} placeholder="Motivo do override (obrigatório)" style={c.inputTexto} />
                      <input inputMode="numeric" value={e.corrigido} onChange={(ev) => setLinha(l.id, { corrigido: ev.target.value.replace(/[^0-9]/g, '') })} placeholder="Pulsos usados (opcional, se souberes o real)" style={c.inputTexto} />
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div style={c.totais}>
          <span>Rosto: <b>{totais.rosto}</b></span>
          <span>Corpo: <b>{totais.corpo}</b></span>
          <span>Total: <b>{totais.geral}</b></span>
        </div>
      </Seccao>

      <Seccao titulo="Dias de aluguer da reserva" subtitulo="1 dia nos open days (o mais comum). Em alugueres de vários dias, os pulsos são repartidos pelos dias.">
        <input inputMode="numeric" value={diasAluguer} onChange={(e) => setDiasAluguer(e.target.value.replace(/[^0-9]/g, '') || '1')} style={c.inputNum} />
      </Seccao>

      {resultado && (
        <Seccao titulo="Valor a faturar (pré-visualização)">
          <ResumoValor r={resultado} />
        </Seccao>
      )}

      <Seccao titulo="Foto do ecrã de contadores (opcional)">
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} style={c.file} />
        {foto && <div style={c.hint}>{foto.name}</div>}
      </Seccao>

      <SeccaoClinica
        clinicaResp={clinicaResp} setClinicaResp={setClinicaResp}
        validacao={validacao} setValidacao={setValidacao}
        assinaturaCaminho={assinaturaCaminho} mostrarPad={mostrarPad} setMostrarPad={setMostrarPad}
        aGuardarAssinatura={aGuardarAssinatura} onAssinatura={guardarAssinatura}
        obs={obs} setObs={setObs}
      />

      {erro && <div style={c.erro}>{erro}</div>}
      <button onClick={submeter} disabled={guardando} style={c.btnPrincipal}>{guardando ? 'A guardar…' : 'Registar recolha'}</button>
    </div>
  )
}

// ─── Blocos reutilizáveis ────────────────────────────────────────────────────
function SeccaoCartuchos({ titulo, subtitulo, cartuchos, valores, onChange }: {
  titulo: string; subtitulo?: string; cartuchos: Cartucho[]; valores: Record<string, string>; onChange: (id: string, v: string) => void
}) {
  return (
    <Seccao titulo={titulo} subtitulo={subtitulo}>
      {cartuchos.length === 0 && <div style={c.hint}>Sem cartuchos ativos configurados.</div>}
      {cartuchos.map((cart) => (
        <div key={cart.id} style={c.linhaTopo}>
          <span style={{ fontWeight: 700 }}>{rotuloCartucho(cart)}</span>
          <input inputMode="numeric" value={valores[cart.id] ?? ''} onChange={(e) => onChange(cart.id, e.target.value.replace(/[^0-9]/g, ''))} placeholder="Contador" style={c.inputNum} />
        </div>
      ))}
    </Seccao>
  )
}

function SeccaoClinica(p: {
  clinicaResp: string; setClinicaResp: (v: string) => void
  validacao: boolean; setValidacao: (v: boolean) => void
  assinaturaCaminho: string | null; mostrarPad: boolean; setMostrarPad: (v: boolean) => void
  aGuardarAssinatura: boolean; onAssinatura: (blob: Blob) => void
  obs: string; setObs: (v: string) => void
}) {
  return (
    <Seccao titulo="Tomada de conhecimento da clínica">
      <input value={p.clinicaResp} onChange={(e) => p.setClinicaResp(e.target.value)} placeholder="Nome do responsável da clínica" style={c.inputTexto} />
      {p.assinaturaCaminho ? (
        <div style={c.assinaturaOk}>✓ Assinatura recolhida <button onClick={() => p.setMostrarPad(true)} style={c.linkBtn}>(refazer)</button></div>
      ) : p.mostrarPad ? (
        <AssinaturaPad aGuardar={p.aGuardarAssinatura} onConfirmar={p.onAssinatura} onCancelar={() => p.setMostrarPad(false)} />
      ) : (
        <button onClick={() => p.setMostrarPad(true)} style={c.btnSecundario}>✍ Assinatura no ecrã</button>
      )}
      {!p.assinaturaCaminho && (
        <label style={c.checkRow}>
          <input type="checkbox" checked={p.validacao} onChange={(e) => p.setValidacao(e.target.checked)} />
          Validação presencial (sem assinatura no ecrã)
        </label>
      )}
      <textarea value={p.obs} onChange={(e) => p.setObs(e.target.value)} placeholder="Observações / ocorrências" style={c.textarea} />
    </Seccao>
  )
}

function ResumoValor({ r }: { r: ResultadoCalculo }) {
  return (
    <div style={c.resumo}>
      <div style={c.resumoTotal}>{r.valorTotal.toFixed(2)} €</div>
      <div style={c.resumoLinha}>{resumoCalculo(r)}</div>
      {r.dias.length > 1 && (
        <div style={c.resumoDias}>
          {r.dias.map((d) => (
            <div key={d.dia} style={c.resumoDia}>
              Dia {d.dia} (escalão {d.escalaoOrdem}): {d.faturado.toFixed(2)} €{d.minimoAplicado ? ' (mínimo)' : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Seccao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section style={c.seccao}>
      <div style={c.seccaoTitulo}>{titulo}</div>
      {subtitulo && <div style={c.seccaoSub}>{subtitulo}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>{children}</div>
    </section>
  )
}

async function baixarFolha(stop: TransportStop) {
  const reg = await registoDaParagem({ id: stop.id, tipo: stop.tipo, google_event_id: stop.google_event_id })
  if (!reg) return
  const sigPath = reg.assinatura_recolha_caminho ?? reg.assinatura_entrega_caminho
  const sig = sigPath ? await assinaturaDataUrl(sigPath) : null
  const blob = await gerarFolhaUltraformerPdf(reg, sig)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Folha Ultraformer - ${reg.cliente_nome ?? 'cliente'}.pdf`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

function BotaoFolha({ stop }: { stop: TransportStop }) {
  const [aGerar, setAGerar] = useState(false)
  return (
    <button disabled={aGerar} style={c.btnSecundario}
      onClick={async () => { setAGerar(true); try { await baixarFolha(stop) } finally { setAGerar(false) } }}>
      {aGerar ? 'A gerar…' : '📄 Descarregar folha (PDF)'}
    </button>
  )
}

function Aviso({ texto }: { texto: string }) { return <main style={c.wrap}><p style={c.info}>{texto}</p></main> }
function Sucesso({ texto, onFim }: { texto: string; onFim?: () => void }) {
  return (
    <div style={c.sucesso}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{texto}</div>
      {onFim && <button onClick={onFim} style={c.btnSecundario}>Voltar à agenda</button>}
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 560, margin: '0 auto', padding: 14 },
  header: { marginBottom: 12 },
  voltar: { fontSize: 14, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 },
  titulo: { fontSize: 20, fontWeight: 800, margin: '6px 0' },
  sub: { fontSize: 14 },
  meta: { fontSize: 13, color: 'var(--muted)', marginTop: 2 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 },
  seccaoTitulo: { fontWeight: 800, fontSize: 15 },
  seccaoSub: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  linhaTopo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  linhaRec: { borderBottom: '1px solid var(--border)', paddingBottom: 10 },
  linhaInputs: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 },
  entregaTag: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  usados: { fontWeight: 800, fontSize: 15 },
  inputNum: { width: 130, fontSize: 20, fontWeight: 700, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center', boxSizing: 'border-box' },
  inputTexto: { width: '100%', fontSize: 15, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 60, fontSize: 15, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, boxSizing: 'border-box', resize: 'vertical' },
  file: { fontSize: 14 },
  totais: { display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10, fontSize: 15, borderTop: '1px solid var(--border)', paddingTop: 10 },
  overrideBox: { marginTop: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  overrideAviso: { fontSize: 13, color: '#B91C1C', fontWeight: 600 },
  checkRow: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.3 },
  assinaturaOk: { fontSize: 14, color: '#166534', fontWeight: 600 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 },
  resumo: { background: 'var(--accent-bg)', borderRadius: 10, padding: 12, textAlign: 'center' },
  resumoTotal: { fontSize: 28, fontWeight: 800, color: 'var(--primary)' },
  resumoLinha: { fontSize: 13, color: 'var(--foreground)', marginTop: 4 },
  resumoDias: { marginTop: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'left' },
  resumoDia: { marginTop: 2 },
  erro: { background: '#FEE2E2', color: '#B91C1C', borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600 },
  aviso: { background: '#FEF3C7', color: '#92400E', borderRadius: 10, padding: 14, fontSize: 14 },
  info: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  sucesso: { background: '#DCFCE7', color: '#166534', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' },
  btnPrincipal: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 12, padding: '16px', fontWeight: 800, fontSize: 16, cursor: 'pointer' },
  btnSecundario: { background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  hint: { fontSize: 12, color: 'var(--muted)' },
}
