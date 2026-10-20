-- Conciliação automática por referência: liga recebimentos de clientes às faturas
-- do livro financeiro usando a referência "A4L FT <série>/<nº>" que a equipa escreve
-- nas Observações do extrato. Só atua em casos de ALTA confiança:
--   • crédito de cliente (CLIENTES SEPA/INTL) ainda por conciliar
--   • referência a UMA só fatura (sem "+")
--   • a fatura existe (keyinvoice_doc_id = ki|4|<série>|<nº>) e é única
--   • o valor do recebimento == exatamente o que falta liquidar na fatura
-- Parciais, multi-fatura e sem referência ficam para a fila manual.
-- Espelha bank_confirmar_match (alocação + valor_liquidado + estado conciliado).
create or replace function public.bank_autoconciliar_referencia()
returns table(conciliados int, valor_total numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count int := 0;
  v_sum numeric := 0;
  r record;
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem acesso ao financeiro';
  end if;

  for r in
    with cand as (
      select b.id pid, b.valor, b.data,
             (regexp_match(b.observacoes, '(\d+)\s*/\s*(\d+)'))[1] serie,
             (regexp_match(b.observacoes, '(\d+)\s*/\s*(\d+)'))[2] num,
             (b.observacoes ~ '\+') multi
      from bank_movements b
      where b.sentido = 'credito' and b.estado = 'por_conciliar'
        and b.categoria in ('CLIENTES SEPA', 'CLIENTES INTL')
        and b.observacoes ~* 'FT'
    )
    select distinct on (f.id) c.pid, c.valor, c.data, f.id fid
    from cand c
    join financeiro_movimentos f
      on f.keyinvoice_doc_id = 'ki|4|' || c.serie || '|' || c.num
     and f.tipo_documento = 'fatura' and f.afeta_saldo
    where not c.multi and c.serie is not null
      and abs((f.valor_debito - coalesce(f.valor_liquidado, 0)) - c.valor) < 0.01
      and (select count(*) from financeiro_movimentos f2
             where f2.keyinvoice_doc_id = f.keyinvoice_doc_id) = 1
    order by f.id, c.pid
  loop
    insert into bank_reconciliation_allocations(bank_movement_id, movimento_id, valor_aplicado, criado_por_nome)
      values (r.pid, r.fid, r.valor, 'Conciliação automática (ref.)');
    update financeiro_movimentos
       set valor_liquidado  = least(valor_debito, coalesce(valor_liquidado, 0) + r.valor),
           data_pagamento   = coalesce(data_pagamento, r.data),
           metodo_pagamento = coalesce(metodo_pagamento, 'Transferência (banco)')
     where id = r.fid;
    update bank_movements set estado = 'conciliado', updated_at = now() where id = r.pid;
    v_count := v_count + 1;
    v_sum := v_sum + r.valor;
  end loop;

  return query select v_count, v_sum;
end $$;

grant execute on function public.bank_autoconciliar_referencia() to authenticated;
