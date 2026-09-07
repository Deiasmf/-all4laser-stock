'use client'

import { useEffect, useState } from 'react'
import { listarCanais } from './marketing'
import { CANAIS, CANAL_LABEL, CANAL_EMOJI, type CanalDef } from '@/types/marketing'

// Fallback (antes de a BD carregar): os 4 canais por omissão.
const DEFAULT: CanalDef[] = CANAIS.map((slug, i) => ({
  id: slug, slug, label: CANAL_LABEL[slug] ?? slug, emoji: CANAL_EMOJI[slug] ?? null, ordem: i + 1, ativo: true,
}))

// Cache ao nível do módulo (evita recarregar em cada componente/página).
let cache: CanalDef[] | null = null
let inflight: Promise<CanalDef[]> | null = null

export function invalidarCanais() { cache = null; inflight = null }

// Lista de canais ativos (dinâmica). Devolve o default enquanto carrega.
export function useCanais(): CanalDef[] {
  const [canais, setCanais] = useState<CanalDef[]>(cache ?? DEFAULT)
  useEffect(() => {
    let vivo = true
    if (cache) { setCanais(cache); return }
    inflight ??= listarCanais().then((r) => { cache = r.length ? r : DEFAULT; return cache })
    inflight.then((r) => { if (vivo) setCanais(r) })
    return () => { vivo = false }
  }, [])
  return canais
}

// Resolve label/emoji de um slug a partir de uma lista carregada, com recurso
// aos nomes por omissão e, em último caso, ao próprio slug.
export function resolverCanais(canais: CanalDef[]) {
  const m = new Map(canais.map((c) => [c.slug, c]))
  return {
    label: (slug: string) => m.get(slug)?.label ?? CANAL_LABEL[slug] ?? slug,
    emoji: (slug: string) => m.get(slug)?.emoji ?? CANAL_EMOJI[slug] ?? '',
  }
}
