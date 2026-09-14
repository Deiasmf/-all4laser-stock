// Fonte ÚNICA da assinatura dos emails. Todos os envios via Gmail passam a
// acrescentar esta assinatura no fim, em vez de a repetirem hardcoded.
import type { SupabaseClient } from '@supabase/supabase-js'

// Lê a assinatura em uso (cache do Gmail ou colada à mão). '' se não houver.
export async function obterAssinaturaHtml(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from('email_config').select('assinatura_html').eq('id', true).maybeSingle()
  return ((data as { assinatura_html: string | null } | null)?.assinatura_html) ?? ''
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Converte um corpo em TEXTO num corpo HTML (preserva quebras de linha e espaços,
// para as tabelas do email não perderem o alinhamento) e acrescenta a assinatura.
export function corpoHtmlComAssinatura(corpoTexto: string, assinaturaHtml: string): string {
  const corpo = `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5;">${escapar(corpoTexto)}</div>`
  const assin = assinaturaHtml && assinaturaHtml.trim() ? `<br><div>${assinaturaHtml}</div>` : ''
  return corpo + assin
}

// Acrescenta a assinatura a um corpo que JÁ é HTML.
export function anexarAssinaturaHtml(corpoHtml: string, assinaturaHtml: string): string {
  return assinaturaHtml && assinaturaHtml.trim() ? `${corpoHtml}<br><div>${assinaturaHtml}</div>` : corpoHtml
}
