-- Ingestão automática de leads por email: anti-duplicados + rasto da origem.
-- email_message_id = id da mensagem Gmail (trava de duplicados, único).
-- email_fonte      = fonte da lead por email ('bimedis' | 'website').
alter table public.leads
  add column if not exists email_message_id text unique,
  add column if not exists email_fonte       text;
