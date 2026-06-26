-- ───────────────────────────────────────────────────────────────────────────
-- PORTAL DE RESERVAS PARA CLIENTES DA ALL4LASER
-- Tabelas: clientes_portal (contas das clientes) + reservas_portal
--          (+ contador para numeração RP-YYYY-NNNN).
-- Segue os padrões dos módulos existentes (envios_pecas, notas_encomenda).
--
-- NOTA DE DESENHO (ver explicação no fim do ficheiro):
--  • A identidade liga-se a auth.users (como a tabela `profiles`) para que as
--    políticas RLS "só o próprio cliente" sejam expressáveis com auth.uid().
--  • Não existe coluna password_hash: as passwords são geridas pelo Supabase
--    Auth na tabela auth.users, nunca em tabelas da aplicação.
--  • Esta migração NÃO altera o trigger handle_new_user (registo de clientes).
--    Essa alteração é crítica e fica para confirmação à parte (ver fim).
-- ───────────────────────────────────────────────────────────────────────────

-- ── clientes_portal: conta de acesso da cliente (id = id do utilizador auth) ──
create table if not exists public.clientes_portal (
  id          uuid primary key references auth.users(id) on delete cascade,
  cliente_id  uuid references public.clientes(id),   -- liga ao cliente do CRM, se já existir
  nome        text not null,
  email       text unique not null,
  telefone    text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── reservas_portal: pedidos de reserva submetidos pelas clientes ──
create table if not exists public.reservas_portal (
  id                      uuid primary key default gen_random_uuid(),
  numero                  text unique,                 -- RP-YYYY-NNNN (trigger)
  cliente_portal_id       uuid references public.clientes_portal(id) on delete set null,
  cliente_nome            text,
  cliente_email           text,
  cliente_telefone        text,
  modelo_equipamento      text,
  modalidade              text check (modalidade in ('1_dia','3_dias','semanal','quinzenal')),
  data_inicio_pretendida  date not null,
  data_fim_pretendida     date not null,
  notas_cliente           text,
  estado                  text not null default 'pendente'
                            check (estado in ('pendente','confirmada','rejeitada','cancelada')),
  motivo_rejeicao         text,
  validado_por            uuid references auth.users(id),
  validado_por_nome       text,
  validado_at             timestamptz,
  sms_confirmacao_enviado boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- NUMERAÇÃO AUTOMÁTICA: RP-YYYY-NNNN (sequência por ano, reinicia em 0001)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.reservas_portal_contador (
  ano    int primary key,
  ultimo int not null default 0
);

create or replace function public.gerar_numero_reserva_portal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ano int;
  v_seq int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then
    return new;
  end if;

  v_ano := extract(year from coalesce(new.created_at, now()))::int;

  insert into public.reservas_portal_contador as c (ano, ultimo)
       values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;

  new.numero := 'RP-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

-- ── Triggers ──
drop trigger if exists trg_reservas_portal_numero on public.reservas_portal;
create trigger trg_reservas_portal_numero
  before insert on public.reservas_portal
  for each row execute function public.gerar_numero_reserva_portal();

drop trigger if exists trg_reservas_portal_updated_at on public.reservas_portal;
create trigger trg_reservas_portal_updated_at
  before update on public.reservas_portal
  for each row execute function public.set_updated_at();

-- ── Índices ──
create index if not exists idx_reservas_portal_numero  on public.reservas_portal(numero);
create index if not exists idx_reservas_portal_estado  on public.reservas_portal(estado);
create index if not exists idx_reservas_portal_cliente on public.reservas_portal(cliente_portal_id);
create index if not exists idx_reservas_portal_created on public.reservas_portal(created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
--  • staff = quem tem registo em public.profiles (utilizadores internos)
--  • cliente = quem tem registo em public.clientes_portal (id = auth.uid())
-- ───────────────────────────────────────────────────────────────────────────
alter table public.clientes_portal          enable row level security;
alter table public.reservas_portal          enable row level security;
alter table public.reservas_portal_contador enable row level security; -- sem políticas: só via função

-- Helper: o utilizador atual é staff interno?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- ── clientes_portal: o próprio vê/edita o seu registo; staff vê todos ──
drop policy if exists clientes_portal_select on public.clientes_portal;
drop policy if exists clientes_portal_insert on public.clientes_portal;
drop policy if exists clientes_portal_update on public.clientes_portal;
create policy clientes_portal_select on public.clientes_portal
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy clientes_portal_insert on public.clientes_portal
  for insert to authenticated with check (id = auth.uid());
create policy clientes_portal_update on public.clientes_portal
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── reservas_portal: cliente vê/cria/edita as suas; staff vê e valida todas ──
drop policy if exists reservas_portal_select on public.reservas_portal;
drop policy if exists reservas_portal_insert on public.reservas_portal;
drop policy if exists reservas_portal_update on public.reservas_portal;
drop policy if exists reservas_portal_delete on public.reservas_portal;
create policy reservas_portal_select on public.reservas_portal
  for select to authenticated using (cliente_portal_id = auth.uid() or public.is_staff());
create policy reservas_portal_insert on public.reservas_portal
  for insert to authenticated with check (cliente_portal_id = auth.uid());
create policy reservas_portal_update on public.reservas_portal
  for update to authenticated
  using (cliente_portal_id = auth.uid() or public.is_staff())
  with check (cliente_portal_id = auth.uid() or public.is_staff());
create policy reservas_portal_delete on public.reservas_portal
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.clientes_portal to authenticated;
grant select, insert, update, delete on public.reservas_portal to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- POR FAZER FORA DESTA MIGRAÇÃO (precisa de confirmação — alteração sensível):
--  O trigger public.handle_new_user() rejeita QUALQUER email que não esteja em
--  utilizadores_autorizados e cria sempre um registo de STAFF em `profiles`.
--  Para o registo de clientes do portal funcionar, esse trigger tem de passar a
--  distinguir clientes (ex.: signUp com metadata { role: 'cliente' }) e, nesse
--  caso, criar um registo em clientes_portal em vez de profiles, sem exigir
--  autorização prévia. Essa mudança será proposta à parte.
-- ───────────────────────────────────────────────────────────────────────────
