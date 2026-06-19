-- Vários ficheiros por contrato de aluguer.
-- O contrato passa a ser só os dados (título, cliente, serial, notas) e os
-- ficheiros vão para uma tabela-filha (mesmo padrão de folhas_obra_fotos).

-- ───────────────────────────────────────────────────────────────────────────
-- contratos_aluguer_ficheiros — N ficheiros por contrato
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.contratos_aluguer_ficheiros (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.contratos_aluguer(id) on delete cascade,
  url          text,
  caminho      text,
  nome         text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_contratos_aluguer_ficheiros_contrato
  on public.contratos_aluguer_ficheiros(contrato_id);

-- Migrar o ficheiro único já existente (se houver) para a tabela-filha
insert into public.contratos_aluguer_ficheiros (contrato_id, url, caminho, nome)
  select id, ficheiro_url, ficheiro_caminho, ficheiro_nome
  from public.contratos_aluguer
  where ficheiro_url is not null;

-- Remover as colunas de ficheiro único do contrato
alter table public.contratos_aluguer
  drop column if exists ficheiro_url,
  drop column if exists ficheiro_caminho,
  drop column if exists ficheiro_nome;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — leitura/insert para autenticados; apagar só admin (igual aos contratos)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.contratos_aluguer_ficheiros enable row level security;

drop policy if exists contratos_aluguer_ficheiros_select on public.contratos_aluguer_ficheiros;
drop policy if exists contratos_aluguer_ficheiros_insert on public.contratos_aluguer_ficheiros;
drop policy if exists contratos_aluguer_ficheiros_delete on public.contratos_aluguer_ficheiros;

create policy contratos_aluguer_ficheiros_select on public.contratos_aluguer_ficheiros
  for select to authenticated using (true);
create policy contratos_aluguer_ficheiros_insert on public.contratos_aluguer_ficheiros
  for insert to authenticated with check (true);
create policy contratos_aluguer_ficheiros_delete on public.contratos_aluguer_ficheiros
  for delete to authenticated using (is_admin());

grant select, insert, delete on public.contratos_aluguer_ficheiros to authenticated;
