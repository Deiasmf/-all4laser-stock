-- Conciliação automática MULTI-FATURA: recebimentos cuja referência aponta a várias
-- faturas ("A4L FT 71/352+440"), incluindo pagamentos em prestações que no conjunto
-- fecham o total. Só atua quando TODAS as faturas referidas existem no livro e a soma
-- dos recebimentos do grupo == soma do que falta liquidar (exato). Aloca FIFO.
create or replace function public.bank_autoconciliar_multifatura()
returns table(conciliados int, valor_total numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g record; fat record; pay record;
  v_count int := 0; v_sum numeric := 0;
  v_fat_rem numeric; v_alloc numeric; v_data date;
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem acesso ao financeiro';
  end if;

  create temp table if not exists _mfpay(pid uuid, data date, rem numeric) on commit drop;

  for g in
    with pag as (
      select b.id pid, b.valor, (regexp_match(b.observacoes,'(\d+)\s*/'))[1] serie,
        trim((regexp_match(b.observacoes,'/\s*([0-9+\s]+)'))[1]) nums_raw
      from bank_movements b
      where b.sentido='credito' and b.estado='por_conciliar'
        and b.categoria in ('CLIENTES SEPA','CLIENTES INTL')
        and b.observacoes ~* 'FT' and b.observacoes ~ '\+'
    ),
    norm as (
      select pid, valor, serie,
        (select string_agg(n,'+' order by n::int)
           from unnest(regexp_split_to_array(nums_raw,'\s*\+\s*')) n where n ~ '^\d+$') nums
      from pag
    ),
    grp as (
      select serie, nums, sum(valor) pag_sum,
        (select coalesce(sum(f.valor_debito-coalesce(f.valor_liquidado,0)),0)
           from unnest(regexp_split_to_array(nums,'\+')) nn
           join financeiro_movimentos f on f.keyinvoice_doc_id='ki|4|'||serie||'|'||nn
                and f.tipo_documento='fatura' and f.afeta_saldo) fat_falta,
        (select count(*) from unnest(regexp_split_to_array(nums,'\+')) nn
           join financeiro_movimentos f on f.keyinvoice_doc_id='ki|4|'||serie||'|'||nn
                and f.tipo_documento='fatura' and f.afeta_saldo) n_ok,
        (select count(*) from unnest(regexp_split_to_array(nums,'\+')) nn) n_ref
      from norm group by serie, nums
    )
    select serie, nums from grp
    where n_ok = n_ref and n_ref >= 2 and abs(pag_sum - fat_falta) < 0.01
  loop
    truncate _mfpay;
    insert into _mfpay(pid, data, rem)
      select b.id, b.data, b.valor
      from bank_movements b
      where b.sentido='credito' and b.estado='por_conciliar'
        and b.categoria in ('CLIENTES SEPA','CLIENTES INTL')
        and (regexp_match(b.observacoes,'(\d+)\s*/'))[1] = g.serie
        and (select string_agg(n,'+' order by n::int)
               from unnest(regexp_split_to_array(trim((regexp_match(b.observacoes,'/\s*([0-9+\s]+)'))[1]),'\s*\+\s*')) n
               where n ~ '^\d+$') = g.nums;

    select min(data) into v_data from _mfpay;

    for fat in
      select f.id fid, (f.valor_debito - coalesce(f.valor_liquidado,0)) rem
      from unnest(regexp_split_to_array(g.nums,'\+')) nn
      join financeiro_movimentos f on f.keyinvoice_doc_id='ki|4|'||g.serie||'|'||nn
           and f.tipo_documento='fatura' and f.afeta_saldo
      where (f.valor_debito - coalesce(f.valor_liquidado,0)) > 0.005
      order by f.data_documento, f.id
    loop
      v_fat_rem := fat.rem;
      for pay in select ctid, pid, rem from _mfpay where rem > 0.005 order by data loop
        exit when v_fat_rem <= 0.005;
        v_alloc := least(v_fat_rem, pay.rem);
        insert into bank_reconciliation_allocations(bank_movement_id, movimento_id, valor_aplicado, criado_por_nome)
          values (pay.pid, fat.fid, v_alloc, 'Conciliação automática (multi-fatura)');
        update _mfpay set rem = rem - v_alloc where ctid = pay.ctid;
        v_fat_rem := v_fat_rem - v_alloc;
      end loop;
      update financeiro_movimentos
         set valor_liquidado  = valor_debito,
             data_pagamento   = coalesce(data_pagamento, v_data),
             metodo_pagamento = coalesce(metodo_pagamento, 'Transferência (banco)')
       where id = fat.fid;
    end loop;

    update bank_movements b set estado='conciliado', updated_at=now()
      where b.id in (select pid from _mfpay)
        and not exists (select 1 from _mfpay p where p.pid=b.id and p.rem > 0.005);
    v_count := v_count + (select count(*) from _mfpay where rem <= 0.005);
    v_sum := v_sum + (select coalesce(sum(valor_aplicado),0) from bank_reconciliation_allocations
                       where bank_movement_id in (select pid from _mfpay)
                         and criado_por_nome='Conciliação automática (multi-fatura)');
  end loop;

  return query select v_count, v_sum;
end $$;

grant execute on function public.bank_autoconciliar_multifatura() to authenticated;
