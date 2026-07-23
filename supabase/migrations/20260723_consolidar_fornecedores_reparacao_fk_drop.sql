-- ============================================================
-- Consolidação de fornecedores_reparacao em fornecedores (passo 2/2).
-- A receção (processos_pecas) referenciava o fornecedor por id
-- (FK -> fornecedores_reparacao). Repontamos essa FK para fornecedores,
-- remapeando o valor existente por nome, e apagamos a tabela antiga.
-- Corre DEPOIS do deploy do código que já usa fornecedores.
-- ============================================================

-- 1) Largar primeiro a FK antiga (senão bloqueia o remap para ids de fornecedores).
alter table public.processos_pecas drop constraint if exists processos_pecas_fornecedor_reparacao_id_fkey;

-- 2) Remapear processos_pecas.fornecedor_reparacao_id do id antigo
--    (fornecedores_reparacao) para o id correspondente em fornecedores (por nome).
update public.processos_pecas pp
set fornecedor_reparacao_id = f.id
from public.fornecedores_reparacao fr
join public.fornecedores f on lower(f.nome) = lower(fr.nome)
where pp.fornecedor_reparacao_id = fr.id;

-- 3) Criar a FK nova a apontar para fornecedores.
alter table public.processos_pecas
  add constraint processos_pecas_fornecedor_reparacao_id_fkey
  foreign key (fornecedor_reparacao_id) references public.fornecedores(id) on delete set null;

-- 4) Apagar a tabela antiga (já sem dependências nem uso no código).
drop table public.fornecedores_reparacao;
