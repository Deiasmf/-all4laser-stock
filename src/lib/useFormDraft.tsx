'use client'

import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Rascunho automático de formulários longos.
//
// Guarda o estado do formulário em localStorage (com debounce) sob a chave
// `draft:<formKey>` — ex.: draft:cliente:novo, draft:carta-porte:novo.
// Ao montar, se existir rascunho válido (< maxAgeDays), restaura-o e assinala
// que foi recuperado (para mostrar o aviso "Rascunho recuperado — Descartar").
// Ao gravar/cancelar deve chamar-se limparRascunho(formKey) (ou limpar()).
// ─────────────────────────────────────────────────────────────────────────────

const PREFIXO = 'draft:'
const DIA_MS = 24 * 60 * 60 * 1000

type Opcoes<T> = {
  // Liga/desliga o rascunho (ex.: só em modo "novo", não em edição).
  enabled?: boolean
  // Atraso antes de gravar, para não escrever a cada tecla. Por omissão 1s.
  debounceMs?: number
  // Rascunhos mais antigos que isto são descartados. Por omissão 7 dias.
  maxAgeDays?: number
  // Estado vazio do formulário: evita gravar um rascunho vazio e é o que o
  // botão "Descartar" repõe.
  emptyState?: T
}

function chaveDe(formKey: string) {
  return PREFIXO + formKey
}

// Remove um rascunho guardado. Usar após gravar com sucesso ou cancelar.
export function limparRascunho(formKey: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(chaveDe(formKey))
  } catch {
    /* localStorage indisponível — ignora */
  }
}

export function useFormDraft<T>(
  formKey: string,
  valores: T,
  restaurar: (data: T) => void,
  opcoes: Opcoes<T> = {}
): { rascunhoRecuperado: boolean; descartar: () => void; limpar: () => void } {
  const { enabled = true, debounceMs = 1000, maxAgeDays = 7, emptyState } = opcoes
  const chave = chaveDe(formKey)

  const [rascunhoRecuperado, setRascunhoRecuperado] = useState(false)
  const hidratado = useRef(false) // já tentámos restaurar? (não gravar antes disso)
  const parado = useRef(false)    // após limpar(), não voltar a gravar

  // Ref viva para o callback de restauro, para o efeito de montagem não depender dele.
  const restaurarRef = useRef(restaurar)
  restaurarRef.current = restaurar

  const serial = JSON.stringify(valores ?? null)
  const serialVazio = emptyState === undefined ? undefined : JSON.stringify(emptyState)

  // Restauro — uma vez, ao montar.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      hidratado.current = true
      return
    }
    try {
      const raw = window.localStorage.getItem(chave)
      if (raw) {
        const guardado = JSON.parse(raw) as { savedAt?: number; data?: T }
        const expirado = !guardado?.savedAt || Date.now() - guardado.savedAt > maxAgeDays * DIA_MS
        if (expirado || guardado.data === undefined) {
          window.localStorage.removeItem(chave)
        } else {
          restaurarRef.current(guardado.data)
          setRascunhoRecuperado(true)
        }
      }
    } catch {
      /* rascunho corrompido — ignora */
    }
    hidratado.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, enabled])

  // Gravação — com debounce, sempre que o conteúdo muda.
  useEffect(() => {
    if (!enabled || parado.current || !hidratado.current || typeof window === 'undefined') return
    // Não gravar formulário vazio (nem o inicial, nem logo após "Descartar").
    if (serialVazio !== undefined && serial === serialVazio) return
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(chave, JSON.stringify({ savedAt: Date.now(), data: JSON.parse(serial) }))
      } catch {
        /* quota cheia / indisponível — ignora */
      }
    }, debounceMs)
    return () => clearTimeout(t)
  }, [serial, serialVazio, enabled, chave, debounceMs])

  // Apaga o rascunho e deixa de gravar (usar ao gravar/cancelar com sucesso).
  function limpar() {
    parado.current = true
    setRascunhoRecuperado(false)
    limparRascunho(formKey)
  }

  // Botão "Descartar" do aviso: apaga o rascunho e repõe o formulário vazio,
  // continuando a permitir um novo rascunho se o utilizador voltar a preencher.
  function descartar() {
    setRascunhoRecuperado(false)
    limparRascunho(formKey)
    if (emptyState !== undefined) restaurarRef.current(emptyState)
  }

  return { rascunhoRecuperado, descartar, limpar }
}

// Aviso discreto de rascunho recuperado, com botão para descartar.
export function RascunhoAviso({ onDescartar }: { onDescartar: () => void }) {
  return (
    <div style={aviso.box}>
      <span>📝 Rascunho recuperado.</span>
      <button type="button" onClick={onDescartar} style={aviso.btn}>
        Descartar
      </button>
    </div>
  )
}

const aviso: Record<string, React.CSSProperties> = {
  box: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    background: '#fff8e1',
    border: '1px solid #f0d98a',
    color: '#7a5b00',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
  },
  btn: {
    background: 'transparent',
    border: '1px solid #d9b84a',
    color: '#7a5b00',
    borderRadius: 6,
    padding: '4px 10px',
    fontWeight: 700,
    cursor: 'pointer',
    font: 'inherit',
  },
}
