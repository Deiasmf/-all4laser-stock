-- ───────────────────────────────────────────────────────────────────────────
-- ALERTAS DE CLIENTES INATIVOS (alugueres)
-- Cliente que não aluga há mais de X dias (fim do último período de aluguer).
-- Limiares configuráveis (settings). Follow-up + silenciar + arquivar por cliente.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.client_inactivity_settings (
  id                 int primary key default 1,
  dias_atencao       int not null default 30,
  dias_critico       int not null default 45,
  email_resumo_ativo boolean not null default true,
  email_destinatarios text,
  updated_at         timestamptz not null default now(),
  constraint client_inactivity_settings_singleton check (id = 1)
);
insert into public.client_inactivity_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.client_inactivity_followup (
  cliente_id      uuid primary key references public.clientes(id) on delete cascade,
  nota            text,
  silenciado_ate  date,
  arquivado       boolean not null default false,
  updated_by      uuid,
  updated_by_nome text,
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_cinativ_touch on public.client_inactivity_followup;
create trigger trg_cinativ_touch before update on public.client_inactivity_followup
  for each row execute function public.financeiro_touch_updated_at();

create or replace view public.client_rental_inactivity
with (security_invoker = true) as
with ativos as (
  select distinct cliente_id
  from public.alugueres
  where cliente_id is not null and (data_recolha is null or data_recolha > current_date)
),
ult as (
  select distinct on (cliente_id)
    cliente_id, data_recolha as ultimo_fim, data_entrega,
    modelo, marca, serial_number, equipamento_id
  from public.alugueres
  where cliente_id is not null and data_recolha is not null and data_recolha <= current_date
  order by cliente_id, data_recolha desc, created_at desc
)
select
  c.id as cliente_id, c.nome as cliente_nome, c.email, c.telefone, c.contacto_nome,
  u.ultimo_fim, u.modelo, u.marca, u.serial_number,
  (current_date - u.ultimo_fim)::int as dias_inatividade,
  f.nota, f.silenciado_ate, coalesce(f.arquivado, false) as arquivado
from ult u
join public.clientes c on c.id = u.cliente_id
left join public.client_inactivity_followup f on f.cliente_id = u.cliente_id
where coalesce(f.arquivado, false) = false
  and u.cliente_id not in (select cliente_id from ativos);

do $$
declare t text;
begin
  foreach t in array array['client_inactivity_settings','client_inactivity_followup'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_acesso', t);
  end loop;
end $$;

grant select on public.client_rental_inactivity to authenticated;
grant select on public.client_rental_inactivity to service_role;
