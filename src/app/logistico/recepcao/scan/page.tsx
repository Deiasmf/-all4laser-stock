'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '@/lib/supabase'
import RecepcaoMovimentoModal from '@/components/RecepcaoMovimentoModal'
import type { RecepcaoMovimento } from '@/types/recepcao'

const REGIAO_ID = 'qr-reader'

type Resultado =
  | { tipo: 'rpc'; numero: string; reparacaoId: string | null; fornecedor: string | null; peca: string | null }
  | { tipo: 'ep'; numero: string }
  | { tipo: 'equip'; id: string; modelo: string | null; sn: string | null }
  | { tipo: 'desconhecido'; valor: string }

export default function RecepcaoScanPage() {
  const router = useRouter()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const aProcessarRef = useRef(false)

  const [aLer, setALer] = useState(false)
  const [erroCamera, setErroCamera] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [historico, setHistorico] = useState<string[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [prefill, setPrefill] = useState<Parameters<typeof RecepcaoMovimentoModal>[0]['prefill']>(undefined)

  const pararCamara = useCallback(async () => {
    const sc = scannerRef.current
    if (!sc) return
    try {
      // Só é possível parar se estiver a filmar
      if (sc.getState && sc.getState() === 2 /* SCANNING */) await sc.stop()
      await sc.clear()
    } catch { /* já parado */ }
    setALer(false)
  }, [])

  const processar = useCallback(async (texto: string) => {
    if (aProcessarRef.current) return
    aProcessarRef.current = true
    setHistorico((h) => [texto, ...h].slice(0, 5))
    await pararCamara()

    // 1) URL da app → redireciona
    if (/^https?:\/\//i.test(texto)) {
      try {
        const url = new URL(texto)
        router.push(url.pathname + url.search)
        return
      } catch { /* URL inválido — segue */ }
    }

    // 2) Número RPC (reparação)
    const rpc = texto.match(/RPC-\d{4}-\d{3,}/i)
    if (rpc) {
      const numero = rpc[0].toUpperCase()
      const { data } = await supabase
        .from('reparacao_pecas')
        .select('id, numero, fornecedor, peca')
        .ilike('numero', numero)
        .maybeSingle()
      setResultado({
        tipo: 'rpc',
        numero,
        reparacaoId: (data as { id: string } | null)?.id ?? null,
        fornecedor: (data as { fornecedor: string | null } | null)?.fornecedor ?? null,
        peca: (data as { peca: string | null } | null)?.peca ?? null,
      })
      aProcessarRef.current = false
      return
    }

    // 3) Número EP (envio de peças)
    const ep = texto.match(/EP-\d{4}-\d{3,}/i)
    if (ep) {
      setResultado({ tipo: 'ep', numero: ep[0].toUpperCase() })
      aProcessarRef.current = false
      return
    }

    // 4) SN de equipamento → ficha do equipamento
    const { data: eq } = await supabase
      .from('equipamentos')
      .select('id, modelo, serial_number')
      .eq('serial_number', texto.trim())
      .maybeSingle()
    if (eq) {
      const e = eq as { id: string; modelo: string | null; serial_number: string | null }
      setResultado({ tipo: 'equip', id: e.id, modelo: e.modelo, sn: e.serial_number })
      aProcessarRef.current = false
      return
    }

    // 5) Não reconhecido
    setResultado({ tipo: 'desconhecido', valor: texto })
    aProcessarRef.current = false
  }, [pararCamara, router])

  const iniciarCamara = useCallback(async () => {
    setErroCamera(null)
    setResultado(null)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const sc = scannerRef.current ?? new Html5Qrcode(REGIAO_ID)
      scannerRef.current = sc
      aProcessarRef.current = false
      await sc.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (texto) => { processar(texto) },
        () => { /* frames sem QR — ignora */ }
      )
      setALer(true)
    } catch (e) {
      setErroCamera('Não foi possível aceder à câmara. ' + (e instanceof Error ? e.message : ''))
      setALer(false)
    }
  }, [processar])

  useEffect(() => {
    iniciarCamara()
    return () => { pararCamara() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirModal(pf: NonNullable<typeof prefill>) {
    setPrefill(pf)
    setModalAberto(true)
  }

  function aoGravar(_m: RecepcaoMovimento) {
    setModalAberto(false)
    setResultado(null)
    // volta a ler o próximo QR
    iniciarCamara()
  }

  return (
    <div style={s.wrap}>
      <div style={s.topo}>
        <Link href="/logistico/recepcao" style={s.voltar}>← Receção</Link>
        <span style={s.tituloTopo}>Scan QR</span>
      </div>

      {/* Câmara */}
      <div style={s.cameraCard}>
        <div id={REGIAO_ID} style={s.camera} />
        {aLer && <div style={s.mira}>Aponta ao QR code</div>}
      </div>

      {erroCamera && (
        <div style={s.erroBox}>
          <div>{erroCamera}</div>
          <button style={s.btnClaro} onClick={() => abrirModal({ qr_lido: false })}>Registar manualmente</button>
        </div>
      )}

      {/* Resultado do scan */}
      {resultado && (
        <div style={s.resultado}>
          {resultado.tipo === 'rpc' && (
            <>
              <div style={s.resTitulo}>🔧 Reparação {resultado.numero}</div>
              {resultado.peca && <div style={s.resSub}>{resultado.peca}</div>}
              {resultado.reparacaoId ? (
                <div style={s.resBtns}>
                  <button style={s.btnClaro} onClick={() => router.push(`/logistico/reparacao-pecas/${resultado.reparacaoId}`)}>Abrir ficha</button>
                  <button style={s.btnPrimario} onClick={() => abrirModal({
                    tipo: 'entrada',
                    origem_destino: resultado.fornecedor ?? '',
                    descricao: resultado.peca ?? '',
                    referencia_tipo: 'reparacao',
                    referencia_id: resultado.reparacaoId ?? undefined,
                    referencia_numero: resultado.numero,
                    qr_lido: true,
                  })}>Registar entrada</button>
                </div>
              ) : (
                <>
                  <div style={s.resSub}>Reparação não encontrada na base de dados.</div>
                  <button style={s.btnPrimario} onClick={() => abrirModal({ referencia_tipo: 'reparacao', referencia_numero: resultado.numero, qr_lido: true })}>Registar movimento</button>
                </>
              )}
            </>
          )}

          {resultado.tipo === 'ep' && (
            <>
              <div style={s.resTitulo}>📬 Envio {resultado.numero}</div>
              <button style={s.btnPrimario} onClick={() => abrirModal({ tipo: 'entrada', referencia_tipo: 'envio_pecas', referencia_numero: resultado.numero, qr_lido: true })}>Registar entrada</button>
            </>
          )}

          {resultado.tipo === 'equip' && (
            <>
              <div style={s.resTitulo}>🔬 {resultado.modelo || 'Equipamento'}</div>
              <div style={s.resSub}>S/N {resultado.sn}</div>
              <button style={s.btnPrimario} onClick={() => router.push(`/equipamentos/${resultado.id}`)}>Abrir ficha do equipamento</button>
            </>
          )}

          {resultado.tipo === 'desconhecido' && (
            <>
              <div style={s.resTitulo}>QR não reconhecido</div>
              <div style={s.resCodigo}>{resultado.valor}</div>
              <button style={s.btnPrimario} onClick={() => abrirModal({ descricao: resultado.valor, qr_lido: true })}>Registar manualmente</button>
            </>
          )}

          <button style={s.btnGhostEscuro} onClick={() => iniciarCamara()}>↻ Ler outro QR</button>
        </div>
      )}

      {/* Ações sempre disponíveis */}
      {!resultado && (
        <div style={s.acoes}>
          <button style={s.btnClaro} onClick={() => abrirModal({ qr_lido: false })}>Registar manualmente</button>
        </div>
      )}

      {/* Histórico da sessão */}
      {historico.length > 0 && (
        <div style={s.historico}>
          <div style={s.histTitulo}>Últimos scans</div>
          {historico.map((h, i) => (
            <div key={i} style={s.histItem}>{h}</div>
          ))}
        </div>
      )}

      <RecepcaoMovimentoModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onGravado={aoGravar}
        prefill={prefill}
      />
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#0f0f18', color: '#fff', padding: 16, maxWidth: 560, margin: '0 auto' },
  topo: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  voltar: { color: '#b9b4d6', textDecoration: 'none', fontSize: 15 },
  tituloTopo: { fontSize: 18, fontWeight: 700, marginLeft: 'auto', marginRight: 'auto' },
  cameraCard: { background: '#000', borderRadius: 16, overflow: 'hidden', position: 'relative', minHeight: 260 },
  camera: { width: '100%' },
  mira: { position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontSize: 14, color: '#e6e3f0', textShadow: '0 1px 3px #000' },
  erroBox: { background: '#2a1620', border: '1px solid #7a2a3a', borderRadius: 12, padding: 16, marginTop: 16, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 },
  resultado: { background: '#1a1a28', border: '1px solid #33334d', borderRadius: 16, padding: 20, marginTop: 16, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 },
  resTitulo: { fontSize: 20, fontWeight: 800 },
  resSub: { fontSize: 15, color: '#b9b4d6' },
  resCodigo: { fontSize: 13, color: '#8f8ab0', wordBreak: 'break-all', background: '#0f0f18', borderRadius: 8, padding: 10 },
  resBtns: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  acoes: { marginTop: 16, textAlign: 'center' },
  btnPrimario: { background: 'var(--primary, #644de3)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 20px', fontWeight: 700, fontSize: 16, cursor: 'pointer' },
  btnClaro: { background: '#fff', color: '#1b1b2e', border: 'none', borderRadius: 12, padding: '14px 20px', fontWeight: 700, fontSize: 16, cursor: 'pointer' },
  btnGhostEscuro: { background: 'transparent', color: '#b9b4d6', border: '1px solid #33334d', borderRadius: 12, padding: '12px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  historico: { marginTop: 24 },
  histTitulo: { fontSize: 13, color: '#8f8ab0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  histItem: { fontSize: 13, color: '#c9c5e0', background: '#1a1a28', borderRadius: 8, padding: '8px 12px', marginBottom: 6, wordBreak: 'break-all' },
}
