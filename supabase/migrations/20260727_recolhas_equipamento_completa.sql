-- ───────────────────────────────────────────────────────────────────────────
-- RECOLHAS DE EQUIPAMENTO — versão completa.
-- Gestão do processo de ir buscar equipamento (fim de aluguer, incumprimento,
-- recompra, assistência…). Evolui a tabela básica financeiro_recolhas_equipamento:
--   • liga ao inventário (equipamentos)
--   • motivo + estados de processo + custos + condição à chegada
--   • timeline de estados  (financeiro_recolhas_eventos)
--   • fotos da condição    (bucket privado recolhas-fotos + financeiro_recolhas_fotos)
--   • RPC para pôr o equipamento em reacondicionamento (financeiro não é admin,
--     e o UPDATE em equipamentos exige is_admin() — daí SECURITY DEFINER)
-- Acesso: só admin+financeiro (has_financeiro_access()), como o resto do módulo.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1) Colunas novas na tabela existente ─────────────────────────────────────
alter table public.financeiro_recolhas_equipamento
  add column if not exists equipamento_id   uuid references public.equipamentos(id) on delete set null,
  add column if not exists motivo           text,
  add column if not exists transportadora   text,
  add column if not exists custos           numeric(12,2),
  add column if not exists condicao_chegada text;

create index if not exists idx_fin_rec_equip on public.financeiro_recolhas_equipamento(equipamento_id);

-- Motivo da recolha.
alter table public.financeiro_recolhas_equipamento
  drop constraint if exists financeiro_recolhas_equipamento_motivo_check;
alter table public.financeiro_recolhas_equipamento
  add constraint financeiro_recolhas_equipamento_motivo_check
  check (motivo is null or motivo in ('fim_aluguer','incumprimento','recompra','assistencia','outro'));

-- ── 2) Novos estados de processo ─────────────────────────────────────────────
-- Migra os valores antigos para o novo conjunto ANTES de trocar o CHECK.
update public.financeiro_recolhas_equipamento set estado = 'em_transporte' where estado = 'em_curso';
update public.financeiro_recolhas_equipamento set estado = 'cancelado'     where estado = 'cancelada';

alter table public.financeiro_recolhas_equipamento
  drop constraint if exists financeiro_recolhas_equipamento_estado_check;
alter table public.financeiro_recolhas_equipamento
  alter column estado set default 'a_agendar';
alter table public.financeiro_recolhas_equipamento
  add constraint financeiro_recolhas_equipamento_estado_check
  check (estado in ('a_agendar','agendada','em_transporte','recolhido','inspecionado','concluido','cancelado'));

-- ── 3) Timeline de estados ───────────────────────────────────────────────────
create table if not exists public.financeiro_recolhas_eventos (
  id          uuid primary key default gen_random_uuid(),
  recolha_id  uuid not null references public.financeiro_recolhas_equipamento(id) on delete cascade,
  estado      text not null,
  nota        text,
  por_id      uuid,
  por_nome    text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_fin_rec_ev_recolha on public.financeiro_recolhas_eventos(recolha_id, created_at);

-- ── 4) Fotos da condição à chegada (bucket privado) ──────────────────────────
create table if not exists public.financeiro_recolhas_fotos (
  id          uuid primary key default gen_random_uuid(),
  recolha_id  uuid not null references public.financeiro_recolhas_equipamento(id) on delete cascade,
  caminho     text not null,
  nome        text,
  criado_por  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_fin_rec_fotos_recolha on public.financeiro_recolhas_fotos(recolha_id);

-- Bucket privado (URL sempre assinado; nada público).
insert into storage.buckets (id, name, public)
values ('recolhas-fotos', 'recolhas-fotos', false)
on conflict (id) do nothing;

drop policy if exists recolhas_fotos_select on storage.objects;
drop policy if exists recolhas_fotos_insert on storage.objects;
drop policy if exists recolhas_fotos_update on storage.objects;
drop policy if exists recolhas_fotos_delete on storage.objects;
create policy recolhas_fotos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'recolhas-fotos' and public.has_financeiro_access());
create policy recolhas_fotos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recolhas-fotos' and public.has_financeiro_access());
create policy recolhas_fotos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'recolhas-fotos' and public.has_financeiro_access())
  with check (bucket_id = 'recolhas-fotos' and public.has_financeiro_access());
create policy recolhas_fotos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'recolhas-fotos' and public.has_financeiro_access());

-- ── 5) RLS + grants das tabelas novas (admin+financeiro) ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['financeiro_recolhas_eventos','financeiro_recolhas_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access())',
      t || '_acesso', t
    );
  end loop;
end $$;

-- ── 6) RPC: pôr o equipamento do inventário num dado status ──────────────────
-- O UPDATE direto em equipamentos exige is_admin(); esta função permite que o
-- financeiro atualize APENAS o status, e só com acesso ao módulo financeiro.
create or replace function public.recolha_definir_status_equipamento(
  p_equipamento_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem permissão para alterar o status do equipamento.';
  end if;
  update public.equipamentos set status = p_status where id = p_equipamento_id;
  if not found then
    raise exception 'Equipamento não encontrado.';
  end if;
end;
$$;

revoke all on function public.recolha_definir_status_equipamento(uuid, text) from public;
grant execute on function public.recolha_definir_status_equipamento(uuid, text) to authenticated;
