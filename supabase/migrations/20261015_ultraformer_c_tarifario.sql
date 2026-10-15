-- Ultraformer III pay-per-use — PARTE C: tarifário versionado.
-- Preço por pulso degressivo (por dias de aluguer) + mínimos diários. Tudo gerível
-- sem código (preços e mínimos mudam por administração). As recolhas passadas ficam
-- intactas porque a recolha grava um SNAPSHOT do tarifário aplicado (colunas na Parte B).
-- RLS: ver = todo o staff (is_staff); editar = só admin (is_admin).

create table if not exists public.ultraformer_tarifario (
  id                   uuid primary key default gen_random_uuid(),
  vigente_desde        date not null,
  vigente_ate          date,                      -- null = em vigor
  ativo                boolean not null default true,
  minimo_dia1          numeric(10,2) not null,    -- 1.º dia da reserva (inclui transporte)
  minimo_dia_seguinte  numeric(10,2) not null,    -- cada dia consecutivo da mesma reserva
  notas                text,
  criado_por           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.ultraformer_tarifario_escaloes (
  id            uuid primary key default gen_random_uuid(),
  tarifario_id  uuid not null references public.ultraformer_tarifario(id) on delete cascade,
  ordem         int  not null,
  dia_min       int  not null,            -- aplica-se a dias de aluguer >= dia_min
  dia_max       int,                      -- ... e <= dia_max (null = sem limite, "4+")
  preco_rosto   numeric(10,4) not null,   -- € por pulso
  preco_corpo   numeric(10,4) not null,
  unique (tarifario_id, ordem)
);

create index if not exists uf_escaloes_tarifario_idx
  on public.ultraformer_tarifario_escaloes(tarifario_id);

alter table public.ultraformer_tarifario          enable row level security;
alter table public.ultraformer_tarifario_escaloes enable row level security;
grant select, insert, update, delete on public.ultraformer_tarifario          to authenticated;
grant select, insert, update, delete on public.ultraformer_tarifario_escaloes to authenticated;
grant all on public.ultraformer_tarifario          to service_role;
grant all on public.ultraformer_tarifario_escaloes to service_role;

-- Ver: todo o staff.
drop policy if exists uf_tarifario_select on public.ultraformer_tarifario;
create policy uf_tarifario_select on public.ultraformer_tarifario
  for select to authenticated using (public.is_staff());
drop policy if exists uf_escaloes_select on public.ultraformer_tarifario_escaloes;
create policy uf_escaloes_select on public.ultraformer_tarifario_escaloes
  for select to authenticated using (public.is_staff());

-- Editar (criar/alterar/apagar): só admin.
drop policy if exists uf_tarifario_write on public.ultraformer_tarifario;
create policy uf_tarifario_write on public.ultraformer_tarifario
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists uf_escaloes_write on public.ultraformer_tarifario_escaloes;
create policy uf_escaloes_write on public.ultraformer_tarifario_escaloes
  for all to authenticated using (is_admin()) with check (is_admin());

drop trigger if exists trg_uf_tarifario_updated_at on public.ultraformer_tarifario;
create trigger trg_uf_tarifario_updated_at before update on public.ultraformer_tarifario
  for each row execute function public.set_updated_at();

-- Seed do tarifário atual (proposta vigente). Só corre se ainda não existir nenhum.
insert into public.ultraformer_tarifario (vigente_desde, ativo, minimo_dia1, minimo_dia_seguinte, notas)
select current_date, true, 150.00, 100.00, 'Tarifário inicial Ultraformer III (seed).'
where not exists (select 1 from public.ultraformer_tarifario);

insert into public.ultraformer_tarifario_escaloes (tarifario_id, ordem, dia_min, dia_max, preco_rosto, preco_corpo)
select t.id, v.ordem, v.dia_min, v.dia_max, v.preco_rosto, v.preco_corpo
  from public.ultraformer_tarifario t
  cross join (values
    (1, 1, 2::int,     0.4400, 0.2200),   -- Dias 1 e 2
    (2, 3, 3::int,     0.4000, 0.2000),   -- Dia 3
    (3, 4, null::int,  0.3400, 0.1700)    -- Dia 4+
  ) as v(ordem, dia_min, dia_max, preco_rosto, preco_corpo)
 where t.ativo = true and t.vigente_ate is null
   and not exists (select 1 from public.ultraformer_tarifario_escaloes e where e.tarifario_id = t.id);
