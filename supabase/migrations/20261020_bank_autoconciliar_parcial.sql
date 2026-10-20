-- Conciliação PARCIAL por referência + marcação de transferências próprias.
--
-- 1) Recebimentos da própria All4laser (crédito "… DE/RECEBIDA … ALL4LASER") são
--    transferências internas, não receita de cliente → regra INTERNO/interna.
insert into public.bank_category_rules (ordem, campo, operador, sentido, padrao, categoria, rubrica, marcar_interna, nota)
select 6,'descritivo','contem','credito','ALL4LASER','INTERNO','Transferência própria',true,
       'Recebimento da própria All4laser = transferência interna'
where not exists (select 1 from public.bank_category_rules where padrao='ALL4LASER' and categoria='INTERNO');

-- 2) Conciliação parcial: um recebimento com ref a UMA fatura, valor <= ao que falta
--    liquidar (pagamento parcial / prestação). Aloca o recebimento todo à fatura;
--    processa por fatura, recebimentos por data, acumulando prestações até a fatura
--    ficar paga. Recebimentos > ao que falta ficam para a fila manual.
create or replace function public.bank_autoconciliar_parcial()
returns table(conciliados int, valor_total numeric)
language plpgsql security definer set search_path to 'public'
as $$
declare f record; pay record; v_rem numeric; v_mindata date; v_count int := 0; v_sum numeric := 0;
begin
  if not public.has_financeiro_access() then raise exception 'Sem acesso ao financeiro'; end if;
  for f in
    select distinct fm.id fid, fm.keyinvoice_doc_id kdi, fm.valor_debito vd, coalesce(fm.valor_liquidado,0) liq
    from bank_movements b
    join financeiro_movimentos fm
      on fm.keyinvoice_doc_id = 'ki|4|'||(regexp_match(b.observacoes,'(\d+)\s*/'))[1]||'|'||(regexp_match(b.observacoes,'/\s*(\d+)'))[1]
     and fm.tipo_documento='fatura' and fm.afeta_saldo
    where b.sentido='credito' and b.estado='por_conciliar' and b.categoria in ('CLIENTES SEPA','CLIENTES INTL')
      and b.observacoes ~* 'FT' and b.observacoes !~ '\+'
      and (fm.valor_debito - coalesce(fm.valor_liquidado,0)) > 0.005
  loop
    v_rem := f.vd - f.liq; v_mindata := null;
    for pay in
      select b.id pid, b.valor, b.data
      from bank_movements b
      where b.sentido='credito' and b.estado='por_conciliar' and b.categoria in ('CLIENTES SEPA','CLIENTES INTL')
        and b.observacoes ~* 'FT' and b.observacoes !~ '\+'
        and 'ki|4|'||(regexp_match(b.observacoes,'(\d+)\s*/'))[1]||'|'||(regexp_match(b.observacoes,'/\s*(\d+)'))[1] = f.kdi
      order by b.data
    loop
      exit when v_rem <= 0.005;
      if pay.valor <= v_rem + 0.01 then
        insert into bank_reconciliation_allocations(bank_movement_id, movimento_id, valor_aplicado, criado_por_nome)
          values (pay.pid, f.fid, pay.valor, 'Conciliação automática (parcial)');
        update bank_movements set estado='conciliado', updated_at=now() where id=pay.pid;
        v_rem := v_rem - pay.valor; v_count := v_count + 1; v_sum := v_sum + pay.valor;
        if v_mindata is null or pay.data < v_mindata then v_mindata := pay.data; end if;
      end if;
    end loop;
    if v_mindata is not null then
      update financeiro_movimentos
         set valor_liquidado = f.vd - v_rem,
             data_pagamento = coalesce(data_pagamento, v_mindata),
             metodo_pagamento = coalesce(metodo_pagamento, 'Transferência (banco)')
       where id = f.fid;
    end if;
  end loop;
  return query select v_count, v_sum;
end $$;
grant execute on function public.bank_autoconciliar_parcial() to authenticated;
