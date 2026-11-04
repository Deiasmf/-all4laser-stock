// Fonte ÚNICA da assinatura dos emails. Todos os envios via Gmail passam a
// acrescentar esta assinatura no fim, em vez de a repetirem hardcoded.
import type { SupabaseClient } from '@supabase/supabase-js'

// Lê a assinatura em uso (cache do Gmail ou colada à mão). '' se não houver.
// Se `remetente` for indicado, usa a assinatura DESSA conta (email_assinaturas);
// se não existir, cai na assinatura global (email_config singleton).
export async function obterAssinaturaHtml(sb: SupabaseClient, remetente?: string | null): Promise<string> {
  if (remetente && remetente.trim()) {
    const { data } = await sb.from('email_assinaturas').select('assinatura_html').eq('remetente', remetente.trim()).maybeSingle()
    const html = (data as { assinatura_html: string | null } | null)?.assinatura_html
    if (html && html.trim()) return html
  }
  const { data } = await sb.from('email_config').select('assinatura_html').eq('id', true).maybeSingle()
  return ((data as { assinatura_html: string | null } | null)?.assinatura_html) ?? ''
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Converte TEXTO em HTML de forma robusta em TODOS os clientes de email —
// incluindo o Outlook, que usa o motor do Word e IGNORA `white-space:pre-wrap`.
// Em vez de depender dessa propriedade (que colapsa as quebras de linha e os
// espaços no Outlook, deixando o email "desconfigurado"), converte-se à mão:
// cada quebra de linha vira <br> e os espaços múltiplos viram &nbsp; para manter
// o alinhamento. Os espaços simples ficam normais, para o texto poder quebrar.
export function textoParaHtml(texto: string): string {
  return escapar(texto)
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
}

// Converte um corpo em TEXTO num corpo HTML (preserva quebras de linha e espaços,
// para as tabelas do email não perderem o alinhamento) e acrescenta a assinatura.
export function corpoHtmlComAssinatura(corpoTexto: string, assinaturaHtml: string): string {
  const corpo = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5;">${textoParaHtml(corpoTexto)}</div>`
  const assin = assinaturaHtml && assinaturaHtml.trim() ? `<br><div>${assinaturaHtml}</div>` : ''
  return corpo + assin
}

// Acrescenta a assinatura a um corpo que JÁ é HTML.
export function anexarAssinaturaHtml(corpoHtml: string, assinaturaHtml: string): string {
  return assinaturaHtml && assinaturaHtml.trim() ? `${corpoHtml}<br><div>${assinaturaHtml}</div>` : corpoHtml
}
