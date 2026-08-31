-- Reutilização de FOs por S/N: cópia versionada + bloqueio + histórico +
-- normalização de S/N + limiar de idade configurável.
alter table public.folhas_obra
  add column if not exists fo_origem_id uuid references public.folhas_obra(id) on delete set null,
  add column if not exists bloqueada    boolean not null default false,
  add column if not exists bloqueada_em timestamptz;

create table if not exists public.folha_obra_historico (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid not null references public.folhas_obra(id) on delete cascade,
  campo text not null, valor_antigo text, valor_novo text,
  por_id uuid, em timestamptz not null default now()
);
create index if not exists idx_fo_hist on public.folha_obra_historico(folha_id, em desc);

create table if not exists public.folha_obra_desbloqueios (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid not null references public.folhas_obra(id) on delete cascade,
  por_id uuid references auth.users(id), por_nome text, motivo text,
  em timestamptz not null default now()
);

create or replace function public.normalizar_sn(s text) returns text
  language sql immutable as $$ select upper(regexp_replace(coalesce(s,''),'[^A-Za-z0-9]','','g')) $$;
create index if not exists idx_fo_sn_norm on public.folhas_obra (public.normalizar_sn(equipamento_sn));

create table if not exists public.folha_obra_config (
  id int primary key default 1 check (id=1), meses_aviso int not null default 12
);
insert into public.folha_obra_config (id) values (1) on conflict do nothing;

do $$ declare t text; begin
  foreach t in array array['folha_obra_historico','folha_obra_desbloqueios','folha_obra_config'] loop
    execute format('alter table public.%s enable row level security;', t);
    execute format('create policy %1$s_sel on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check (true);', t);
    execute format('grant select, insert, update on public.%s to authenticated;', t);
  end loop;
end $$;
create policy folha_obra_config_upd on public.folha_obra_config for update to authenticated using (public.is_admin()) with check (public.is_admin());
