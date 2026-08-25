'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { descarregarPdf } from '@/lib/fichaPdf'
import { obterProduto, listarHandpieces, listarAcessorios } from '@/lib/fichaProduto'
import { gerarPdfFichaProduto, type IdiomaFicha } from '@/lib/fichaProdutoPdf'

// Botão + opções para gerar a ficha de produto em PDF (on-demand, dados atuais).
const IDIOMAS: { v: IdiomaFicha; label: string }[] = [
  { v: 'pt', label: 'Português' }, { v: 'en', label: 'English' },
  { v: 'es', label: 'Español' }, { v: 'fr', label: 'Français' },
]

export default function GerarFichaProduto({ equipamentoId, marca, modelo, ano, serialNumber, precoVenda }: {
  equipamentoId: string
  marca: string | null
  modelo: string | null
  ano: string | null
  serialNumber: string | null
  precoVenda: number | null
}) {
  const [aberto, setAberto] = useState(false)
  const [idioma, setIdioma] = useState<IdiomaFicha>('pt')
  const [incluirPreco, setIncluirPreco] = useState(false)
  const [incluirSn, setIncluirSn] = useState(false)
  const [aGerar, setAGerar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar() {
    setAGerar(true); setErro(null)
    try {
      const [produto, handpieces, acess, mediaR] = await Promise.all([
        obterProduto(equipamentoId),
        listarHandpieces(equipamentoId),
        listarAcessorios(equipamentoId),
        supabase.from('media').select('url, capa, ordem, tipo, created_at')
          .eq('equipamento_id', equipamentoId).or('tipo.is.null,tipo.eq.foto'),
      ])
      const fotos = ((mediaR.data as { url: string; capa: boolean | null; ordem: number | null; created_at: string }[]) ?? [])
        .sort((a, b) => (Number(b.capa) - Number(a.capa)) || ((a.ordem ?? 0) - (b.ordem ?? 0)) || a.created_at.localeCompare(b.created_at))
        .map((m) => m.url)

      const blob = await gerarPdfFichaProduto({
        idioma,
        marca, modelo, ano,
        serialCompleto: serialNumber, incluirSnCompleto: incluirSn,
        condicao: produto?.condicao ?? null,
        condicaoDescricao: produto?.condicao_descricao ?? null,
        voltagem: produto?.voltagem ?? null,
        frequencia: produto?.frequencia ?? null,
        dimensoes: produto?.dimensoes ?? null,
        pesoKg: produto?.peso_kg ?? null,
        softwareVersao: produto?.software_versao ?? null,
        handpieces: handpieces.map((h) => ({ nome: h.nome, contador_pulsos: h.contador_pulsos, data_leitura: h.data_leitura })),
        acessorios: acess.map((a) => a.descricao),
        preco: incluirPreco ? precoVenda : null,
        fotos,
      })
      const nomeFich = `All4laser - ${[marca, modelo, ano].filter(Boolean).join(' ')} - Ref ${equipamentoId.slice(0, 8)}`
      await descarregarPdf(blob, nomeFich)
      setAberto(false)
    } catch (e) {
      setErro('Não foi possível gerar a ficha: ' + (e instanceof Error ? e.message : 'erro'))
    } finally {
      setAGerar(false)
    }
  }

  return (
    <>
      <button type="button" style={s.btn} onClick={() => { setErro(null); setAberto(true) }}>📄 Gerar ficha de produto</button>

      {aberto && (
        <div style={s.overlay} onClick={() => setAberto(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.cab}>
              <h2 style={s.titulo}>Gerar ficha de produto</h2>
              <button onClick={() => setAberto(false)} style={s.fechar} aria-label="Fechar">✕</button>
            </div>
            {erro && <div style={s.erro}>{erro}</div>}

            <label style={s.label}>Idioma</label>
            <select style={s.input} value={idioma} onChange={(e) => setIdioma(e.target.value as IdiomaFicha)}>
              {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
            </select>

            <label style={s.check}>
              <input type="checkbox" checked={incluirPreco} onChange={(e) => setIncluirPreco(e.target.checked)} />
              Incluir preço {precoVenda == null && <span style={s.muted}>(sem preço de venda definido)</span>}
            </label>
            <label style={s.check}>
              <input type="checkbox" checked={incluirSn} onChange={(e) => setIncluirSn(e.target.checked)} />
              Incluir S/N completo <span style={s.muted}>(por defeito só os últimos 4)</span>
            </label>

            <div style={s.acoes}>
              <button style={s.btnSec} onClick={() => setAberto(false)}>Cancelar</button>
              <button style={s.btnPrim} disabled={aGerar} onClick={gerar}>{aGerar ? 'A gerar…' : 'Gerar PDF'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  btn: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420, margin: 'auto', display: 'flex', flexDirection: 'column' },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, marginBottom: 8 },
  label: { fontWeight: 600, fontSize: 13.5, marginTop: 10, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  check: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14 },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
}
