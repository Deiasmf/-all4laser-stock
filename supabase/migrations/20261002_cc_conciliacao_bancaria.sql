-- Fase 3 dos Processos de Equipamentos: articular a Conciliação Bancária com as
-- Contas Correntes (parceria, ex.: Laserix). Um movimento bancário é alocado a
-- UM livro: ou liquida uma fatura fiscal (financeiro_movimentos, fluxo atual via
-- bank_confirmar_match), ou cria um recebimento na conta corrente (este ficheiro).
-- A coluna bank_movement_id dá rastreio e evita dupla contagem (idempotência).

alter table public.cc_movimentos
  add column if not exists bank_movement_id uuid references public.bank_movements(id) on delete set null;
create index if not exists cc_movimentos_bank_mov_idx on public.cc_movimentos(bank_movement_id);

-- Casar um movimento bancário com uma ou mais vendas/prestações da conta corrente.
-- p_alocacoes: jsonb array de { origem_tipo:'venda'|'prestacao', origem_id, valor,
--              moeda, taxa } (taxa = unidades por 1 EUR; default 1 para EUR).
create or replace function public.cc_conciliar_bank(
  p_bank_movement uuid,
  p_conta_id uuid,
  p_alocacoes jsonb,
  p_data date,
  p_autor_nome text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a jsonb;
  v_val numeric;
  v_soma numeric := 0;
  v_ja numeric := 0;
  v_banco numeric;
  v_ref text;
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem acesso ao financeiro';
  end if;

  select valor, coalesce(referencia, hash) into v_banco, v_ref
    from bank_movements where id = p_bank_movement;
  if v_banco is null then
    raise exception 'Movimento bancário não encontrado';
  end if;

  -- Quanto já foi alocado deste movimento bancário à conta corrente (idempotência).
  select coalesce(sum(valor_eur), 0) into v_ja
    from cc_movimentos where bank_movement_id = p_bank_movement;

  for a in select * from jsonb_array_elements(p_alocacoes) loop
    v_val := (a->>'valor')::numeric;
    if v_val is null or v_val <= 0 then
      raise exception 'Valor inválido na alocação';
    end if;
    insert into cc_movimentos(
      conta_id, tipo, data, valor, moeda, taxa_cambio_eur,
      origem_tipo, origem_id, bank_movement_id, referencia_bancaria, criado_por_nome, notas
    ) values (
      p_conta_id, 'recebido', coalesce(p_data, current_date), v_val,
      coalesce(a->>'moeda', 'EUR'), coalesce((a->>'taxa')::numeric, 1),
      coalesce(a->>'origem_tipo', 'reconciliacao'),
      nullif(a->>'origem_id','')::uuid, p_bank_movement, v_ref, p_autor_nome,
      'Conciliação bancária'
    );
    -- soma em EUR (o trigger cc_movimentos_eur calcula valor_eur na linha inserida)
    v_soma := v_soma + round(v_val / coalesce((a->>'taxa')::numeric, 1), 2);
  end loop;

  -- Guarda anti-dupla-contagem: o total alocado (em EUR) não pode exceder o valor
  -- do movimento bancário (tolerância de 1 cêntimo).
  if (v_ja + v_soma) > (v_banco + 0.01) then
    raise exception 'A alocação (% EUR) excede o valor do movimento bancário (% EUR)', round(v_ja + v_soma, 2), v_banco;
  end if;

  update bank_movements set estado = 'conciliado', updated_at = now() where id = p_bank_movement;
end $$;

-- Desfazer: apaga os cc_movimentos criados a partir deste movimento bancário e
-- repõe o estado do banco para "por conciliar".
create or replace function public.cc_desconciliar_bank(p_bank_movement uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem acesso ao financeiro';
  end if;
  delete from cc_movimentos where bank_movement_id = p_bank_movement;
  update bank_movements set estado = 'por_conciliar', updated_at = now() where id = p_bank_movement;
end $$;

grant execute on function public.cc_conciliar_bank(uuid, uuid, jsonb, date, text) to authenticated;
grant execute on function public.cc_desconciliar_bank(uuid) to authenticated;
