-- Enquadrar os Processos de Peças nos Envios/Receções de Encomenda:
-- cada movimento de envio/receção de um processo gera automaticamente uma linha
-- no livro central recepcao_movimentos (tal como reparações e envios já fazem).

-- Permitir referencia_tipo = 'processo'
alter table public.recepcao_movimentos
  drop constraint if exists recepcao_movimentos_referencia_tipo_check;
alter table public.recepcao_movimentos
  add constraint recepcao_movimentos_referencia_tipo_check
  check (referencia_tipo in ('reparacao','envio_pecas','nota_encomenda','manual','rececao','processo'));

create or replace function public.sync_recepcao_from_processo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  proc  public.processos_pecas%rowtype;
  v_tipo        text;
  v_contraparte text;
  v_label       text;
  v_desc        text;
begin
  -- Só sincroniza movimentos que são um envio ou uma receção reais.
  if new.tipo in ('enviamos_substituta','enviamos_para_reparacao','enviamos_reparada_cliente') then
    v_tipo := 'saida';
  elsif new.tipo in ('cliente_enviou_avariada','recebemos_de_reparacao','cliente_devolveu_cortesia') then
    v_tipo := 'entrada';
  else
    return new; -- entrou_no_stock / manual: não vão para o livro
  end if;

  select * into proc from public.processos_pecas where id = new.processo_id;

  if new.tipo in ('enviamos_para_reparacao','recebemos_de_reparacao') then
    v_contraparte := coalesce(proc.fornecedor_reparacao_nome, new.destino, 'Fornecedor');
  else
    v_contraparte := coalesce(proc.cliente_nome, 'Cliente');
  end if;

  v_label := case new.tipo
    when 'enviamos_substituta' then 'Envio de substituta'
    when 'enviamos_para_reparacao' then 'Envio para reparação'
    when 'enviamos_reparada_cliente' then 'Envio da peça reparada'
    when 'cliente_enviou_avariada' then 'Receção da avariada'
    when 'recebemos_de_reparacao' then 'Receção da peça reparada'
    when 'cliente_devolveu_cortesia' then 'Devolução da cortesia'
    else new.tipo end;

  v_desc := coalesce(proc.peca_descricao, 'Peça') || ' · ' || v_label;

  insert into public.recepcao_movimentos (
    tipo, data_movimento, origem_destino, descricao, quantidade,
    serial_numbers, equipamento_sn, equipamento_id,
    referencia_tipo, referencia_id, referencia_numero, match_status,
    notas, criado_por, criado_por_nome
  ) values (
    v_tipo,
    coalesce(new.data_movimento, current_date),
    v_contraparte,
    v_desc,
    coalesce(new.quantidade, 1),
    case when new.sn is not null then array[new.sn] else null end,
    proc.equipamento_sn, proc.equipamento_id,
    'processo', proc.id, proc.numero,
    'fechado',                       -- o processo controla o seu próprio ciclo
    'Processo ' || coalesce(proc.numero, ''),
    new.criado_por, new.criado_por_nome
  );
  return new;
end;
$$;

drop trigger if exists trigger_sync_recepcao_processo on public.processos_pecas_movimentos;
create trigger trigger_sync_recepcao_processo
  after insert on public.processos_pecas_movimentos
  for each row execute function public.sync_recepcao_from_processo();
