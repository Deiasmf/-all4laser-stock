-- Assinatura única dos emails enviados via Gmail (comercial@).
-- Fonte única: tabela singleton email_config. A assinatura pode vir do Gmail
-- (users.settings.sendAs) ou ser colada à mão (fallback). Todos os emails
-- passam a acrescentar esta assinatura no fim, em vez de a repetirem hardcoded.
create table if not exists public.email_config (
  id                     boolean primary key default true,
  fonte                  text not null default 'manual' check (fonte in ('gmail','manual')),
  assinatura_html        text,                 -- assinatura EM USO (cache do Gmail ou manual)
  assinatura_manual_html text,                 -- HTML colado à mão (fallback)
  remetente              text not null default 'comercial@all4laser.com',
  atualizada_em          timestamptz,
  atualizada_por_nome    text,
  constraint email_config_singleton check (id)
);
-- Arranca com a assinatura simples atual, para nada ficar vazio até ligares o Gmail.
insert into public.email_config (id, fonte, assinatura_html, assinatura_manual_html, atualizada_em)
values (true, 'manual', '<p>All4laser</p>', '<p>All4laser</p>', now())
on conflict (id) do nothing;

grant select, insert, update on public.email_config to authenticated;
grant all on public.email_config to service_role;

alter table public.email_config enable row level security;
drop policy if exists email_config_select on public.email_config;
create policy email_config_select on public.email_config for select to authenticated
  using (public.is_staff());
drop policy if exists email_config_write on public.email_config;
create policy email_config_write on public.email_config for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Cotações: a assinatura passa a vir da fonte única → tirar o "All4laser"
-- hardcoded do fim do template (mantém o "Com os melhores cumprimentos,").
update public.freight_email_templates
set corpo_template = replace(corpo_template, E'Com os melhores cumprimentos,\nAll4laser', 'Com os melhores cumprimentos,'),
    updated_at = now()
where idioma = 'pt' and corpo_template like E'%Com os melhores cumprimentos,\nAll4laser%';
update public.freight_email_templates
set corpo_template = replace(corpo_template, E'Best regards,\nAll4laser', 'Best regards,'),
    updated_at = now()
where idioma = 'en' and corpo_template like E'%Best regards,\nAll4laser%';
