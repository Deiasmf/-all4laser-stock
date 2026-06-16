-- Dashboard interno: comunicados, tarefas e chat de equipa
-- (Nota: o repo salta o 004; numeração 005 conforme pedido.)

create table if not exists public.comunicados (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  corpo           text not null,
  autor_id        uuid references auth.users(id) on delete set null,
  autor_nome      text not null,
  autor_iniciais  text not null,
  area            text,
  prioridade      text default 'normal' check (prioridade in ('normal','importante','urgente')),
  created_at      timestamptz default now()
);

create table if not exists public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descricao      text,
  area           text not null,
  assignee_id    uuid references auth.users(id) on delete set null,
  assignee_nome  text,
  data_limite    date,
  estado         text default 'pendente' check (estado in ('pendente','em_curso','concluida')),
  prioridade     text default 'normal' check (prioridade in ('normal','importante','urgente')),
  created_at     timestamptz default now()
);

create table if not exists public.chat_mensagens (
  id              uuid primary key default gen_random_uuid(),
  autor_id        uuid references auth.users(id) on delete set null,
  autor_nome      text not null,
  autor_iniciais  text not null,
  mensagem        text not null,
  created_at      timestamptz default now()
);

create index if not exists idx_comunicados_data on public.comunicados(created_at desc);
create index if not exists idx_tarefas_data_estado on public.tarefas(data_limite, estado);
create index if not exists idx_chat_data on public.chat_mensagens(created_at asc);

alter table public.comunicados enable row level security;
alter table public.tarefas enable row level security;
alter table public.chat_mensagens enable row level security;

drop policy if exists comunicados_select on public.comunicados;
drop policy if exists comunicados_insert on public.comunicados;
create policy comunicados_select on public.comunicados for select to authenticated using (true);
create policy comunicados_insert on public.comunicados for insert to authenticated with check (true);

drop policy if exists tarefas_select on public.tarefas;
drop policy if exists tarefas_all on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated using (true);
create policy tarefas_all on public.tarefas for all to authenticated using (true) with check (true);

drop policy if exists chat_select on public.chat_mensagens;
drop policy if exists chat_insert on public.chat_mensagens;
create policy chat_select on public.chat_mensagens for select to authenticated using (true);
create policy chat_insert on public.chat_mensagens for insert to authenticated with check (true);

-- Tabelas criadas por SQL não recebem privilégios automáticos (mesmo problema do módulo processos).
grant select, insert on public.comunicados to authenticated;
grant select, insert, update, delete on public.tarefas to authenticated;
grant select, insert on public.chat_mensagens to authenticated;

-- Realtime para o chat de equipa
alter publication supabase_realtime add table public.chat_mensagens;
