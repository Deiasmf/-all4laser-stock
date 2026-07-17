'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import { formatarEuro, parseNumeroPt } from '@/lib/alugueres'
import { TIPOS_ALUGUER, TIPOS_INTERNACIONAL } from '@/types/aluguer'

// Modelos com preço. As chaves de grupo têm de coincidir com as que a função
// grupoPreco() devolve em /alugueres (senão a sugestão automática não encontra o preço).
const MODELOS: { grupo: string; label: string }[] = [
  { grupo: 'gentlepro', label: 'GentlePro' },
  { grupo: 'gentlemaxpro', label: 'GentleMax Pro' },
  { grupo: 'gentlemaxproplus', label: 'GentleMax Pro Plus' },
  { grupo: 'sopranoice', label: 'Soprano ICE' },
  { grupo: 'sopranoplatinum', label: 'Soprano Platinum' },
]

// Mercados e os tipos de aluguer de cada um
const MERCADOS: { chave: string; label: string; tipos: readonly string[] }[] = [
  { chave: 'nacional', label: 'Nacional', tipos: TIPOS_ALUGUER },
  { chave: 'internacional', label: 'Internacional', tipos: TIPOS_INTERNACIONAL },
]

const chave = (grupo: string, mercado: string, tipo: string) => `${grupo}|${mercado}|${tipo}`

type LinhaPreco = { modelo_grupo: string; mercado: string; tipo_aluguer: string; valor: number }

export default function PrecosAlugueresPage() {
  const { isAdmin } = useAuth()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [orig, setOrig] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('precos_aluguer')
      .select('modelo_grupo, mercado, tipo_aluguer, valor')
      .then(({ data }) => {
        const m: Record<string, string> = {}
        for (const r of (data ?? []) as LinhaPreco[]) {
          m[chave(r.modelo_grupo, r.mercado, r.tipo_aluguer)] = String(r.valor)
        }
        setVals(m)
        setOrig(m)
        setCarregando(false)
      })
  }, [])

  function alterar(k: string, v: string) {
    setOkMsg(null)
    setVals((prev) => ({ ...prev, [k]: v }))
  }

  // Quantas células foram alteradas em relação ao que está guardado
  const alteracoes = Object.keys({ ...orig, ...vals }).filter(
    (k) => (vals[k] ?? '').trim() !== (orig[k] ?? '').trim()
  ).length

  async function guardar() {
    setErro(null)
    setOkMsg(null)

    const upserts: { modelo_grupo: string; modelo_label: string; mercado: string; tipo_aluguer: string; valor: number }[] = []
    const remover: { grupo: string; mercado: string; tipo: string }[] = []

    for (const modelo of MODELOS) {
      for (const merc of MERCADOS) {
        for (const tipo of merc.tipos) {
          const k = chave(modelo.grupo, merc.chave, tipo)
          const atual = (vals[k] ?? '').trim()
          const antigo = (orig[k] ?? '').trim()
          if (atual === antigo) continue // sem alteração
          if (atual === '') {
            if (antigo !== '') remover.push({ grupo: modelo.grupo, mercado: merc.chave, tipo })
            continue
          }
          const n = parseNumeroPt(atual)
          if (n === null) {
            return setErro(`Valor inválido em ${modelo.label} · ${merc.label} · ${tipo}.`)
          }
          upserts.push({
            modelo_grupo: modelo.grupo,
            modelo_label: modelo.label,
            mercado: merc.chave,
            tipo_aluguer: tipo,
            valor: n,
          })
        }
      }
    }

    if (upserts.length === 0 && remover.length === 0) {
      return setOkMsg('Não há alterações para guardar.')
    }

    setAGuardar(true)

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('precos_aluguer')
        .upsert(upserts, { onConflict: 'modelo_grupo,mercado,tipo_aluguer' })
      if (error) {
        setAGuardar(false)
        return setErro('Erro a guardar: ' + error.message)
      }
    }

    for (const d of remover) {
      const { error } = await supabase
        .from('precos_aluguer')
        .delete()
        .eq('modelo_grupo', d.grupo)
        .eq('mercado', d.mercado)
        .eq('tipo_aluguer', d.tipo)
      if (error) {
        setAGuardar(false)
        return setErro('Erro a remover um preço: ' + error.message)
      }
    }

    setAGuardar(false)
    setOrig({ ...vals })
    setOkMsg('Preços guardados.')
  }

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <h1 style={s.titulo}>Preços</h1>
        <Link href="/alugueres" style={s.voltar}>← Alugueres</Link>
      </div>
      <AlugueresNav />

      <p style={s.intro}>
        Preços por modelo, mercado e tipo de aluguer. Servem de sugestão automática ao registar um aluguer.
        {isAdmin ? ' Podes escrever com vírgula (ex.: 255 ou 255,50). Deixa em branco para retirar o preço.' : ''}
      </p>

      {erro && <div style={s.erro}>{erro}</div>}
      {okMsg && <div style={s.ok}>{okMsg}</div>}

      {carregando ? (
        <p style={s.estado}>A carregar...</p>
      ) : (
        <>
          {MODELOS.map((modelo) => (
            <section key={modelo.grupo} style={s.cartao}>
              <span style={s.cartaoTitulo}>{modelo.label}</span>
              {MERCADOS.map((merc) => {
                // Para viewers, esconde mercados sem qualquer preço definido
                const temAlgum = merc.tipos.some((t) => (vals[chave(modelo.grupo, merc.chave, t)] ?? '').trim() !== '')
                if (!isAdmin && !temAlgum) return null
                return (
                  <div key={merc.chave} style={s.mercado}>
                    <span style={s.mercadoTitulo}>{merc.label}</span>
                    {merc.tipos.map((tipo) => {
                      const k = chave(modelo.grupo, merc.chave, tipo)
                      const valor = vals[k] ?? ''
                      if (!isAdmin && valor.trim() === '') return null
                      return (
                        <div key={tipo} style={s.linha}>
                          <span style={s.tipoLabel}>{tipo}</span>
                          {isAdmin ? (
                            <span style={s.inputWrap}>
                              <input
                                style={s.input}
                                type="text"
                                inputMode="decimal"
                                placeholder="—"
                                value={valor}
                                onChange={(e) => alterar(k, e.target.value)}
                              />
                              <span style={s.euro}>€</span>
                            </span>
                          ) : (
                            <span style={s.valorTexto}>{formatarEuro(Number(valor) || 0)}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </section>
          ))}

          {isAdmin && (
            <div style={s.barraGuardar}>
              <span style={s.contador}>
                {alteracoes === 0 ? 'Sem alterações por guardar' : `${alteracoes} alteração(ões) por guardar`}
              </span>
              <button
                style={{ ...s.botao, opacity: aGuardar || alteracoes === 0 ? 0.6 : 1 }}
                disabled={aGuardar || alteracoes === 0}
                onClick={guardar}
              >
                {aGuardar ? 'A guardar...' : 'Guardar preços'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  intro: { fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 },
  estado: { color: 'var(--muted)', padding: 8 },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginBottom: 12, color: '#c62828' },
  ok: { background: '#e8f5ec', border: '1px solid #a5d6b7', borderRadius: 8, padding: 12, marginBottom: 12, color: '#1b873f' },

  cartao: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  cartaoTitulo: { fontSize: 16, fontWeight: 700, color: 'var(--primary)' },
  mercado: { display: 'flex', flexDirection: 'column', gap: 6 },
  mercadoTitulo: { fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 },
  linha: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #f2f2f2', padding: '4px 0' },
  tipoLabel: { fontSize: 14, color: 'var(--foreground)' },
  inputWrap: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  input: { width: 110, padding: 8, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, textAlign: 'right', boxSizing: 'border-box' },
  euro: { fontSize: 14, color: 'var(--muted)' },
  valorTexto: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)' },

  barraGuardar: { position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginTop: 4 },
  contador: { fontSize: 13, color: 'var(--muted)' },
  botao: { padding: '12px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' },
}
