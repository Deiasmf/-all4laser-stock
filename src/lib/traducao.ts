import { supabase } from './supabase'

// Traduz uma lista de textos (PT → idioma) via /api/fichas/traduzir (com cache).
// Textos vazios mantêm-se; em erro devolve os originais (a ficha nunca falha por isto).
export async function traduzirTextos(textos: string[], idioma: string): Promise<string[]> {
  if (idioma === 'pt' || textos.every((t) => !t || !t.trim())) return textos
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  if (!token) return textos
  try {
    const res = await fetch('/api/fichas/traduzir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ textos, idioma }),
    })
    const j = await res.json()
    return j.ok && Array.isArray(j.traducoes) && j.traducoes.length === textos.length ? j.traducoes : textos
  } catch {
    return textos
  }
}
