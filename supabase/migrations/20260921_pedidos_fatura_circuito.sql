-- Pedidos de Fatura: circuito Bruno/equipa → Vanessa → cliente (aplicada via MCP).
-- Estende a tabela existente (20260831_pedidos_fatura.sql) + config única.

alter table public.pedidos_fatura
  add column if not exists num_fatura              text,
  add column if not exists data_fatura             date,
  add column if not exists valor_total             numeric(12,2),
  add column if not exists motivo_recusa           text,
  add column if not exists comprovativo_url        text,
  add column if not exists comprovativo_caminho    text,
  add column if not exists enviado_whatsapp_em      timestamptz,
  add column if not exists respondido_em           timestamptz,
  add column if not exists canais_usados           text[] not null default '{}',
  add column if not exists financeiro_movimento_id uuid references public.financeiro_movimentos(id) on delete set null,
  add column if not exists lembrete_ultimo         timestamptz,
  add column if not exists lembretes_count         int not null default 0;

-- Acrescentar o estado 'recusado' (devolução ao colega com motivo).
alter table public.pedidos_fatura drop constraint if exists pedidos_fatura_estado_check;
alter table public.pedidos_fatura add constraint pedidos_fatura_estado_check
  check (estado in ('nao_realizado','a_realizar','realizado','enviado_cliente','recusado'));

-- Config single-row: template do email + lembretes + substituto de faturação.
create table if not exists public.pedidos_fatura_config (
  id                   boolean primary key default true check (id),
  assunto_template     text not null default 'All4laser – Fatura {n_fatura} – {nome_cliente}',
  corpo_template       text not null default
'Exmo.(a) Sr.(a) {nome_contacto},

Serve o presente email para envio do documento {n_fatura}, referente a {nome_cliente}, com data de {data_fatura}, no valor total de {valor_total} €.

O documento segue em anexo.

Para qualquer esclarecimento adicional, estamos inteiramente ao dispor.

Com os melhores cumprimentos,',
  lembrete_horas       int not null default 48 check (lembrete_horas between 1 and 720),
  lembrete_horas_uteis boolean not null default true,
  escalona_cc_andreia  boolean not null default true,
  substituto_id        uuid references public.profiles(id) on delete set null,
  substituto_nome      text,
  atualizado_em        timestamptz,
  atualizado_por_nome  text
);
insert into public.pedidos_fatura_config(id) values (true) on conflict do nothing;

alter table public.pedidos_fatura_config enable row level security;
drop policy if exists pf_cfg_sel on public.pedidos_fatura_config;
create policy pf_cfg_sel on public.pedidos_fatura_config for select using (public.is_staff());
drop policy if exists pf_cfg_upd on public.pedidos_fatura_config;
create policy pf_cfg_upd on public.pedidos_fatura_config for update
  using (public.has_financeiro_access()) with check (public.has_financeiro_access());
drop policy if exists pf_cfg_ins on public.pedidos_fatura_config;
create policy pf_cfg_ins on public.pedidos_fatura_config for insert
  with check (public.has_financeiro_access());
