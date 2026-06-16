'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import AssinaturaPad from '@/components/AssinaturaPad'
import { supabase } from '@/lib/supabase'

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onloadend = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('leitura falhou'))
    fr.readAsDataURL(blob)
  })
}

type FolhaPublica = {
  numero: string
  data_intervencao: string
  tipo_servico: string | null
  tecnico_nome: string | null
  cliente_nome: string | null
  equipamento_modelo: string | null
  equipamento_sn: string | null
  trabalho_realizado: string | null
  estado: string
  assinatura_cliente_at: string | null
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

export default function AssinarPage() {
  const params = useParams()
  const token = params.token as string

  const [folha, setFolha] = useState<FolhaPublica | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    let activo = true
    supabase
      .rpc('folha_por_token', { p_token: token })
      .then(({ data, error }) => {
        if (!activo) return
        if (error || !data) setErro('Link inválido ou expirado.')
        else setFolha(data as FolhaPublica)
      })
      .then(() => { if (activo) setCarregando(false) })
    return () => { activo = false }
  }, [token])

  async function enviar(blob: Blob) {
    setAEnviar(true)
    setErro(null)
    try {
      const dataUrl = await blobParaDataUrl(blob)
      const { data, error } = await supabase.rpc('assinar_folha_cliente', {
        p_token: token,
        p_assinatura: dataUrl,
      })
      if (error || data !== true) { setErro('Não foi possível registar a assinatura.'); return }
      setConcluido(true)
    } catch {
      setErro('Erro de ligação. Tenta novamente.')
    } finally {
      setAEnviar(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.cartao}>
        <div style={s.marca}>All4laser</div>

        {carregando ? (
          <p style={s.estado}>A carregar...</p>
        ) : erro && !folha ? (
          <p style={s.estado}>{erro}</p>
        ) : concluido ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
            <h1 style={s.titulo}>Assinatura registada</h1>
            <p style={s.sub}>Obrigado. Pode fechar esta página.</p>
          </div>
        ) : folha ? (
          <>
            <h1 style={s.titulo}>Assinatura da folha de obra</h1>
            <p style={s.sub}>{folha.numero} · {formatarData(folha.data_intervencao)}</p>

            <div style={s.dados}>
              {folha.cliente_nome && <Linha rotulo="Cliente" valor={folha.cliente_nome} />}
              {folha.tipo_servico && <Linha rotulo="Serviço" valor={folha.tipo_servico} />}
              {(folha.equipamento_modelo || folha.equipamento_sn) && (
                <Linha rotulo="Equipamento" valor={`${folha.equipamento_modelo ?? ''}${folha.equipamento_sn ? ` (${folha.equipamento_sn})` : ''}`} />
              )}
              {folha.tecnico_nome && <Linha rotulo="Técnico" valor={folha.tecnico_nome} />}
              {folha.trabalho_realizado && <Linha rotulo="Trabalho realizado" valor={folha.trabalho_realizado} />}
            </div>

            {folha.assinatura_cliente_at && (
              <p style={s.aviso}>Esta folha já tinha sido assinada em {formatarData(folha.assinatura_cliente_at)}. Pode voltar a assinar abaixo.</p>
            )}

            <div style={{ marginTop: 8 }}>
              <p style={s.instrucao}>Assine no quadro abaixo:</p>
              <AssinaturaPad aGuardar={aEnviar} onConfirmar={enviar} onCancelar={() => {}} />
            </div>

            {erro && <p style={s.erro}>{erro}</p>}
          </>
        ) : null}
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 14 }}>
      <span style={{ color: 'var(--muted)', minWidth: 120 }}>{rotulo}</span>
      <span style={{ fontWeight: 500 }}>{valor}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, background: 'var(--background)' },
  cartao: { width: '100%', maxWidth: 560, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 },
  marca: { fontWeight: 800, fontSize: 18, color: 'var(--primary)' },
  titulo: { fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  estado: { color: 'var(--muted)', padding: 20, textAlign: 'center' },
  dados: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, marginTop: 4, borderTop: '1px solid var(--border)' },
  aviso: { fontSize: 13, color: '#D4820A', background: '#fdf2e3', borderRadius: 8, padding: '8px 12px', margin: 0 },
  instrucao: { fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600, margin: 0 },
}
