-- Registo de notificações já enviadas (dedup), para não repetir o mesmo evento.
-- Só a rota de cron (service role) lê/escreve; RLS sem políticas bloqueia o resto.
create table if not exists public.alugueres_notificacoes (
  chave       text primary key,
  enviado_em  timestamptz not null default now()
);
alter table public.alugueres_notificacoes enable row level security;
