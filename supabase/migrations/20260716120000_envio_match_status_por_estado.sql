-- Corrige o "fechada" indevido nos envios (saídas) no livro de Encomendas.
-- Antes: o trigger marcava match_status='fechado' na criação de QUALQUER envio,
-- pelo que todas as encomendas apareciam "Fechado" sem ninguém as ter fechado.
-- Agora: match_status deriva do estado do envio — 'fechado' só quando 'expedido',
-- caso contrário 'pendente' (e o UPDATE trigger passa a acompanhar o estado).
create or replace function public.sync_recepcao_from_envio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.recepcao_movimentos (
      tipo, data_movimento, origem_destino, descricao, quantidade,
      referencia_tipo, referencia_id, referencia_numero, match_status,
      notas, criado_por, criado_por_nome
    ) values (
      'saida',
      coalesce(new.expedido_em::date, new.created_at::date, current_date),
      coalesce(new.cliente_nome, 'Cliente'),
      'Envio ' || coalesce(new.numero, ''),
      1,
      'envio_pecas', new.id, new.numero,
      case when new.estado = 'expedido' then 'fechado' else 'pendente' end,
      'Estado: ' || new.estado,
      new.criado_por, new.criado_por_nome
    );
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    update public.recepcao_movimentos
       set notas = 'Estado: ' || new.estado,
           match_status = case when new.estado = 'expedido' then 'fechado' else 'pendente' end,
           data_movimento = coalesce(new.expedido_em::date, data_movimento)
     where referencia_tipo = 'envio_pecas' and referencia_id = new.id;
  end if;
  return new;
end;
$$;

-- One-off: corrigir os movimentos de envios já existentes (estavam todos 'fechado')
update public.recepcao_movimentos m
   set match_status = case when e.estado = 'expedido' then 'fechado' else 'pendente' end
  from public.envios_pecas e
 where m.referencia_tipo = 'envio_pecas' and m.referencia_id = e.id;
