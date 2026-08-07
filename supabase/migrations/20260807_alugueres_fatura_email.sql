-- Envio de faturas de aluguer por email (Gmail comercial@) com template gerível.
-- Acesso: admin + financeiro (has_financeiro_access()).

-- Email de faturação do cliente (nullable; fallback ao email geral)
alter table public.clientes add column if not exists email_faturacao text;

-- Templates (2 variantes: normal / curto), geríveis em Definições
create table if not exists public.alugueres_email_templates (
  chave            text primary key check (chave in ('normal','curto')),
  assunto_template text not null,
  corpo_template   text not null,
  updated_at       timestamptz not null default now()
);
insert into public.alugueres_email_templates (chave, assunto_template, corpo_template) values
('normal',
 'All4laser – Fatura {{n_fatura}} – Aluguer {{periodo}}',
 E'Exmo.(a) Sr.(a) {{nome_contacto}},\n\nServe o presente email para envio da fatura {{n_fatura}}, no valor de {{valor}} €, referente ao aluguer do equipamento {{equipamento}} ({{serial_number}}), relativa ao período de {{periodo}}.\n\nO documento segue em anexo.\n\nPara qualquer esclarecimento adicional, estamos inteiramente ao dispor.\n\nCom os melhores cumprimentos,\n\n{{nome_colaborador}}\nAll4laser International Group\nRua dos Caniços 31/33, 2625-253 Vialonga\n{{telefone}} | {{email_colaborador}}'),
('curto',
 'All4laser – Fatura {{n_fatura}} – Aluguer {{periodo}}',
 E'Exmo.(a) Sr.(a) {{nome_contacto}},\n\nSegue em anexo a fatura {{n_fatura}}, no valor de {{valor}} €, referente ao aluguer do período de {{periodo}}.\n\nQualquer questão, estamos ao dispor.\n\nCom os melhores cumprimentos,\n{{nome_colaborador}} | All4laser')
on conflict (chave) do nothing;

-- Log de envios (histórico; permite reenvios sem duplicar o indicador)
create table if not exists public.alugueres_fatura_envios (
  id uuid primary key default gen_random_uuid(),
  faturacao_id uuid references public.alugueres_faturacao_mensal(id) on delete set null,
  aluguer_id uuid, mes text, para text, cc text, template_chave text, assunto text,
  estado text not null default 'enviado' check (estado in ('enviado','falhou')),
  erro text, gmail_message_id text, gmail_thread_id text,
  enviado_por uuid, enviado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_alug_fat_envios_fat on public.alugueres_fatura_envios(faturacao_id, created_at desc);

-- RLS — admin + financeiro
alter table public.alugueres_email_templates enable row level security;
alter table public.alugueres_fatura_envios enable row level security;
grant select, insert, update on public.alugueres_email_templates to authenticated;
grant select, insert on public.alugueres_fatura_envios to authenticated;
grant all on public.alugueres_email_templates to service_role;
grant all on public.alugueres_fatura_envios to service_role;
drop policy if exists alug_email_templates_acesso on public.alugueres_email_templates;
create policy alug_email_templates_acesso on public.alugueres_email_templates
  for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access());
drop policy if exists alug_fat_envios_select on public.alugueres_fatura_envios;
drop policy if exists alug_fat_envios_insert on public.alugueres_fatura_envios;
create policy alug_fat_envios_select on public.alugueres_fatura_envios for select to authenticated using (public.has_financeiro_access());
create policy alug_fat_envios_insert on public.alugueres_fatura_envios for insert to authenticated with check (public.has_financeiro_access());
