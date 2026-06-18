-- Notas de Encomenda: opção de capas "Substituição" passa a "Pintadas".
-- Atualiza a constraint CHECK do campo capas. (Sem dados a migrar — a tabela
-- não tinha notas com capas preenchidas quando esta alteração foi feita.)

alter table public.notas_encomenda drop constraint if exists notas_encomenda_capas_check;
alter table public.notas_encomenda add constraint notas_encomenda_capas_check
  check (capas in ('Originais', 'Pintadas', 'Sem capas'));
