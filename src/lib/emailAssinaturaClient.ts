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

// Assinatura por remetente: uma linha por conta @all4laser.com.
export type EmailAssinatura = {
  remetente: string
  fonte: 'gmail' | 'manual'
  assinatura_html: string | null
  assinatura_manual_html: string | null
  atualizada_em: string | null
  atualizada_por_nome: string | null
}

async function chamar(method: 'GET' | 'POST', url: string, body?: unknown): Promise<{ ok: boolean; erro?: string; config?: EmailConfig & Partial<EmailAssinatura>; assinatura_html?: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, erro: 'Sessão em falta.' }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  try { return await res.json() } catch { return { ok: false, erro: `Erro ${res.status}.` } }
}

// ── Assinatura global (email_config) ──────────────────────────────────────────
export const obterConfigAssinatura = () => chamar('GET', '/api/email/assinatura')
export const atualizarAssinaturaDoGmail = () => chamar('POST', '/api/email/assinatura', { acao: 'refresh_gmail' })
export const guardarAssinaturaManual = (html: string) => chamar('POST', '/api/email/assinatura', { acao: 'manual', html })

// ── Assinatura por remetente (email_assinaturas) ──────────────────────────────
export const obterAssinaturaRemetente = (remetente: string) =>
  chamar('GET', `/api/email/assinatura?remetente=${encodeURIComponent(remetente)}`)
export const atualizarAssinaturaGmailRemetente = (remetente: string) =>
  chamar('POST', '/api/email/assinatura', { acao: 'refresh_gmail', remetente })
export const guardarAssinaturaManualRemetente = (remetente: string, html: string) =>
  chamar('POST', '/api/email/assinatura', { acao: 'manual', remetente, html })
