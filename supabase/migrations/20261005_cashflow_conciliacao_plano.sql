-- Ligar a Conciliação Bancária aos planos de pagamento manuais do Cashflow:
-- casar um crédito bancário com uma ou mais prestações de plano (marca recebida,
-- liga bank_movement_id). Um movimento é alocado a UM livro (fiscal / conta
-- corrente / plano cashflow) — sem dupla contagem. has_financeiro_access.

create or replace function public.cashflow_conciliar_plano(
  p_bank_movement uuid,
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
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem acesso ao financeiro';
  end if;

  select valor into v_banco from bank_movements where id = p_bank_movement;
  if v_banco is null then
    raise exception 'Movimento bancário não encontrado';
  end if;

  select coalesce(sum(valor_recebido), 0) into v_ja
    from cashflow_payment_plan_prest where bank_movement_id = p_bank_movement;

  for a in select * from jsonb_array_elements(p_alocacoes) loop
    v_val := (a->>'valor')::numeric;
    if v_val is null or v_val <= 0 then
      raise exception 'Valor inválido na alocação';
    end if;
    update cashflow_payment_plan_prest set
      valor_recebido = v_val,
      estado = case when v_val >= valor then 'recebido' else 'parcial' end,
      data_recebimento = coalesce(p_data, current_date),
      bank_movement_id = p_bank_movement
    where id = (a->>'prest_id')::uuid;
    v_soma := v_soma + v_val;
  end loop;

  if (v_ja + v_soma) > (v_banco + 0.01) then
    raise exception 'A alocação (%) excede o valor do movimento bancário (%)', round(v_ja + v_soma, 2), v_banco;
  end if;

  update bank_movements set estado = 'conciliado', updated_at = now() where id = p_bank_movement;
end $$;

create or replace function public.cashflow_desconciliar_plano(p_bank_movement uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem acesso ao financeiro';
  end if;
  update cashflow_payment_plan_prest set
    estado = 'previsto', valor_recebido = 0, data_recebimento = null, bank_movement_id = null
  where bank_movement_id = p_bank_movement;
  update bank_movements set estado = 'por_conciliar', updated_at = now() where id = p_bank_movement;
end $$;

grant execute on function public.cashflow_conciliar_plano(uuid, jsonb, date, text) to authenticated;
grant execute on function public.cashflow_desconciliar_plano(uuid) to authenticated;
