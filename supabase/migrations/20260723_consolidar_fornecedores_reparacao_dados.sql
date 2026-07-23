-- ============================================================
-- Consolidação de fornecedores_reparacao em fornecedores (passo 1/2: DADOS).
-- A tabela fornecedores_reparacao era só uma lista de sugestões (4 nomes) para
-- o dropdown das reparações. O campo reparacao_pecas.fornecedor é texto livre
-- e NÃO é alterado. Aqui apenas garantimos que os nomes dessa lista existem em
-- fornecedores. O passo 2 (drop da tabela) corre depois do deploy do código.
-- ============================================================
insert into public.fornecedores (nome, email, telefone, notas, ativo)
select fr.nome, fr.email, fr.telefone, fr.notas, coalesce(fr.ativo, true)
from public.fornecedores_reparacao fr
where not exists (
  select 1 from public.fornecedores f where lower(f.nome) = lower(fr.nome)
);
