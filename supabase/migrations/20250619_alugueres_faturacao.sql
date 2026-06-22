-- Faturação dos alugueres na tabela mensal:
--  • valor_a_faturar / nao_faturar — quanto (e se) faturar cada aluguer
--  • fatura_* — ficheiro da fatura anexada (PDF ou imagem)

-- ───────────────────────────────────────────────────────────────────────────
-- Colunas novas na tabela alugueres
-- ───────────────────────────────────────────────────────────────────────────
alter table alugueres add column if not exists valor_a_faturar numeric;
alter table alugueres add column if not exists nao_faturar boolean default false;
alter table alugueres add column if not exists fatura_url text;
alter table alugueres add column if not exists fatura_caminho text;
alter table alugueres add column if not exists fatura_nome text;

-- ───────────────────────────────────────────────────────────────────────────
-- STORAGE — bucket público para os ficheiros das faturas dos alugueres
-- (mesmo padrão do bucket contratos-aluguer)
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('faturas-alugueres', 'faturas-alugueres', true)
on conflict (id) do nothing;

drop policy if exists faturas_alugueres_storage_select on storage.objects;
drop policy if exists faturas_alugueres_storage_insert on storage.objects;
drop policy if exists faturas_alugueres_storage_delete on storage.objects;

create policy faturas_alugueres_storage_select on storage.objects
  for select using (bucket_id = 'faturas-alugueres');
create policy faturas_alugueres_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'faturas-alugueres');
create policy faturas_alugueres_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'faturas-alugueres');
