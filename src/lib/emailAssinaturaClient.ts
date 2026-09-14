import { supabase } from './supabase'

// Cliente para gerir a assinatura única (chama /api/email/assinatura com o
// token da sessão).
export type EmailConfig = {
  fonte: 'gmail' | 'manual'
  assinatura_html: string | null
  assinatura_manual_html: string | null
  remetente: string
  atualizada_em: string | null
  atualizada_por_nome: string | null
}

async function chamar(method: 'GET' | 'POST', body?: unknown): Promise<{ ok: boolean; erro?: string; config?: EmailConfig; assinatura_html?: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, erro: 'Sessão em falta.' }
  const res = await fetch('/api/email/assinatura', {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  try { return await res.json() } catch { return { ok: false, erro: `Erro ${res.status}.` } }
}

export const obterConfigAssinatura = () => chamar('GET')
export const atualizarAssinaturaDoGmail = () => chamar('POST', { acao: 'refresh_gmail' })
export const guardarAssinaturaManual = (html: string) => chamar('POST', { acao: 'manual', html })
