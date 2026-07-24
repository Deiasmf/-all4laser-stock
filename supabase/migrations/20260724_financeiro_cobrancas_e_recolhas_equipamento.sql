-- ───────────────────────────────────────────────────────────────────────────
-- RECOLHAS — dois temas:
--   1) Cobranças (acompanhamento de recebimentos de clientes)
--   2) Recolha de equipamentos (logística de ir buscar equipamento)
-- Ambas com RLS: acesso só a admin+financeiro (has_financeiro_access()).
-- ───────────────────────────────────────────────────────────────────────────

-- Placeholder genérico da fase base, substituído por estas duas tabelas.
drop table if exists public.financeiro_recolhas;

-- Função partilhada para manter updated_at.
create or replace function public.financeiro_touch_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── 1) Cobranças ─────────────────────────────────────────────────────────────
create table if not exists public.financeiro_cobrancas (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes(id) on delete set null,
  cliente_nome    text,
  valor           numeric(12,2),
  movimento_id    uuid references public.financeiro_movimentos(id) on delete set null,
  estado          text not null default 'pendente'
                    check (estado in ('pendente','contactado','promessa','recolhido','incobravel')),
  data_promessa   date,
  responsavel_id  uuid,
  responsavel_nome text,
  notas           text,
  criado_por      uuid,
  criado_por_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_fin_cob_cliente on public.financeiro_cobrancas(cliente_id);
create index if not exists idx_fin_cob_estado  on public.financeiro_cobrancas(estado);

drop trigger if exists trg_fin_cob_touch on public.financeiro_cobrancas;
create trigger trg_fin_cob_touch before update on public.financeiro_cobrancas
  for each row execute function public.financeiro_touch_updated_at();

-- ── 2) Recolha de equipamentos ───────────────────────────────────────────────
create table if not exists public.financeiro_recolhas_equipamento (
  id              uuid primary key default gen_random_uuid(),
  descricao       text,
  equipamento_ref text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  origem_nome     text,
  morada          text,
  data_prevista   date,
  data_recolha    date,
  estado          text not null default 'agendada'
                    check (estado in ('agendada','em_curso','recolhido','cancelada')),
  responsavel_nome text,
  notas           text,
  criado_por      uuid,
  criado_por_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_fin_rec_estado on public.financeiro_recolhas_equipamento(estado);
create index if not exists idx_fin_rec_data   on public.financeiro_recolhas_equipamento(data_prevista);

drop trigger if exists trg_fin_rec_touch on public.financeiro_recolhas_equipamento;
create trigger trg_fin_rec_touch before update on public.financeiro_recolhas_equipamento
  for each row execute function public.financeiro_touch_updated_at();

-- ── RLS + grants (admin+financeiro) ──────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['financeiro_cobrancas','financeiro_recolhas_equipamento'] loop
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
