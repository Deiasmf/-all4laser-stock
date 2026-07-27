-- ───────────────────────────────────────────────────────────────────────────
-- LIMPEZA DE NOMES (Fase B): estruturar os "fornecedores" de reparação que
-- existiam só em texto livre (reparacao_pecas.fornecedor) como fornecedores
-- próprios. São técnicos/oficinas de reparação (Ivan, David Velasco, MR-WEI,
-- Weldon, Jesus, SYNOPTICS…) que não existiam na tabela fornecedores.
--
-- Cria APENAS os nomes que ainda não existem em fornecedores NEM em clientes
-- (não duplica os já estruturados nem mexe no Laserix, que é cliente).
-- Idempotente. Como os saldos agrupam por NOME, os registos legados juntam-se
-- automaticamente a estes novos fornecedores.
-- ───────────────────────────────────────────────────────────────────────────

insert into public.fornecedores (nome, ativo, notas, updated_at)
select distinct btrim(r.fornecedor), true, 'Criado a partir dos saldos de reparação (limpeza de nomes)', now()
from public.reparacao_pecas r
where r.fornecedor is not null and btrim(r.fornecedor) <> ''
  and not exists (select 1 from public.fornecedores f where lower(btrim(f.nome)) = lower(btrim(r.fornecedor)))
  and not exists (select 1 from public.clientes c where lower(btrim(c.nome)) = lower(btrim(r.fornecedor)));
