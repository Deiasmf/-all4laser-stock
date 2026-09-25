-- ───────────────────────────────────────────────────────────────────────────
-- ALUGUERES — sair automaticamente ao mudar o status para fora de aluguer
--
-- Quando um equipamento deixa de ter status "Aluguer nacional/internacional"
-- (ex.: passa a "Vendido", "Enviado", "Em stock"…), faz a MESMA limpeza do botão
-- "Tirar dos alugueres" (src/lib/situacaoAlugueres.ts → terminarAluguer), mas
-- automática, aconteça onde acontecer a mudança de status (ficha de stock,
-- edição em massa, etc.):
--   • fecha a(s) entrada(s) aberta(s) em `alugueres` (data_recolha), preservando
--     o histórico para a rentabilidade;
--   • remove a ficha `aluguer_situacao` (deixa de aparecer na Situação/Lista).
--
-- Mover entre quadros (Nacional ↔ Internacional) NÃO limpa nada (ambos são
-- estados de aluguer). Colocar em aluguer (Em stock → Aluguer) também não.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.trg_equip_sai_de_aluguer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.status in ('Aluguer nacional', 'Aluguer internacional')
     and new.status is distinct from old.status
     and new.status not in ('Aluguer nacional', 'Aluguer internacional') then

    -- Fecha os alugueres em aberto (preserva o histórico/rentabilidade).
    update public.alugueres
       set data_recolha = coalesce(new.data_saida, current_date),
           updated_at = now()
     where equipamento_id = new.id
       and data_recolha is null;

    -- Remove a ficha de situação (sai da Situação atual e da Lista).
    delete from public.aluguer_situacao where equipamento_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_equipamentos_sai_aluguer on public.equipamentos;
create trigger trg_equipamentos_sai_aluguer
  after update of status on public.equipamentos
  for each row
  execute function public.trg_equip_sai_de_aluguer();
