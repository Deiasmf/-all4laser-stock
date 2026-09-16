-- ───────────────────────────────────────────────────────────────────────────
-- COTAÇÕES v3 — Fase 3: assinatura POR remetente, agradecimento aos não
-- escolhidos e tracking do agradecimento. ADITIVO.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Assinatura por remetente (uma linha por conta @all4laser.com). O
--    email_config singleton mantém-se como assinatura global de recurso; esta
--    tabela tem prioridade quando o email é enviado em nome de uma conta.
create table if not exists public.email_assinaturas (
  remetente              text primary key,
  fonte                  text not null default 'manual' check (fonte in ('gmail','manual')),
  assinatura_html        text,
  assinatura_manual_html text,
  atualizada_em          timestamptz,
  atualizada_por_nome    text
);
alter table public.email_assinaturas enable row level security;
grant select, insert, update, delete on public.email_assinaturas to authenticated;
grant all on public.email_assinaturas to service_role;
drop policy if exists email_assinaturas_all on public.email_assinaturas;
create policy email_assinaturas_all on public.email_assinaturas
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 2) Template do email de AGRADECIMENTO aos não escolhidos (PT/EN).
alter table public.freight_email_templates
  add column if not exists agrad_assunto text,
  add column if not exists agrad_corpo   text;

-- 3) Registo de quem recebeu agradecimento e quando (no destinatário).
alter table public.freight_quote_recipients
  add column if not exists agradecido_em       timestamptz,
  add column if not exists agradecido_por_nome text;

-- 4) Textos-base do agradecimento (só se ainda estiverem vazios). Nunca
--    mencionam o vencedor nem valores. {{saudacao}} e {{referencia}}.
update public.freight_email_templates set
  agrad_assunto = coalesce(agrad_assunto, 'Pedido {{referencia}} — obrigado pela vossa cotação'),
  agrad_corpo = coalesce(agrad_corpo, $PT${{saudacao}}

Agradecemos a cotação apresentada para o nosso pedido {{referencia}}. Nesta ocasião, optámos por adjudicar o transporte a outra empresa.

Continuaremos a contar com a vossa colaboração em futuros pedidos de cotação, esperando ter oportunidade de trabalhar convosco brevemente.

Com os melhores cumprimentos,$PT$)
where idioma = 'pt';

update public.freight_email_templates set
  agrad_assunto = coalesce(agrad_assunto, 'Request {{referencia}} — thank you for your quote'),
  agrad_corpo = coalesce(agrad_corpo, $EN${{saudacao}}

Thank you for the quote you kindly provided for our request {{referencia}}. On this occasion, we have decided to award the transport to another company.

We look forward to continuing to count on your collaboration in future quote requests and hope to have the opportunity to work with you soon.

Best regards,$EN$)
where idioma = 'en';
