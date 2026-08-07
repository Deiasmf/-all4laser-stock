-- EXPEDIÇÕES AGRUPADAS — lógica: sincronização com Tracking, expedir, cancelar.

-- Sincroniza para o separador Tracking (origem='expedicao' já existe no CHECK).
-- A entrada de tracking referencia a expedição e, por ela, todas as NEs.
create or replace function public.trg_sync_expedition_tracking() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_n int;
begin
  if coalesce(new.transportadora,'')='' and coalesce(new.tracking_numero,'')=''
     and coalesce(new.awb_numero,'')='' then return new; end if;
  select count(*) into v_n from public.expedition_notas where expedition_id=new.id and removida_em is null;
  perform public.sync_shipment_tracking(
    p_origem=>'expedicao', p_source_type=>'expeditions', p_source_id=>new.id, p_direcao=>'envio',
    p_tipo=>case when coalesce(new.awb_numero,'')<>'' then 'carga_aerea' else coalesce(new.tipo_transporte,'expresso') end,
    p_tracking=>new.tracking_numero, p_awb=>new.awb_numero, p_carrier_nome=>new.transportadora,
    p_entidade_tipo=>'cliente', p_cliente_id=>new.cliente_id, p_supplier_id=>null, p_entidade_nome=>new.cliente_nome,
    p_descricao=>new.numero||' — '||coalesce(new.cliente_nome,'')||' ('||v_n||' NE)',
    p_carta_url=>new.carta_porte_url, p_carta_caminho=>new.carta_porte_caminho,
    p_data_exped=>coalesce(new.data_expedicao,new.data_prevista), p_anulada=>(new.estado='cancelada'));
  return new;
end $$;
drop trigger if exists trg_expeditions_tracking on public.expeditions;
create trigger trg_expeditions_tracking after insert or update on public.expeditions
  for each row execute function public.trg_sync_expedition_tracking();

-- Expedir: reproduz os efeitos por NE (estado→expedida dispara bloqueio de FOs;
-- equipamento 'Enviado'; conclui a fase admin_expedicao; denormaliza ne_expedicao).
create or replace function public.expedir_expedition(p_exp_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_exp public.expeditions; r record;
begin
  select * into v_exp from public.expeditions where id=p_exp_id;
  if not found then raise exception 'Expedição não encontrada'; end if;
  for r in select en.nota_id, n.equipamento_id from public.expedition_notas en
           join public.notas_encomenda n on n.id=en.nota_id
           where en.expedition_id=p_exp_id and en.removida_em is null loop
    update public.ne_fluxo set estado='concluido', concluido_at=now()
      where nota_id=r.nota_id and fase='admin_expedicao';
    update public.notas_encomenda set estado='expedida' where id=r.nota_id and estado<>'expedida';
    if r.equipamento_id is not null then
      update public.equipamentos set status='Enviado' where id=r.equipamento_id; end if;
    insert into public.ne_expedicao (nota_id, transportador, notas)
      values (r.nota_id, v_exp.transportadora, 'Expedida na '||v_exp.numero)
      on conflict (nota_id) do update set transportador=coalesce(ne_expedicao.transportador, excluded.transportador);
  end loop;
  update public.expeditions set estado='expedida', data_expedicao=coalesce(data_expedicao,current_date) where id=p_exp_id;
end $$;
grant execute on function public.expedir_expedition(uuid) to authenticated;

-- Cancelar (só antes de expedida): NEs voltam a prontas; tracking anulado.
create or replace function public.cancelar_expedition(p_exp_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_estado text;
begin
  select estado into v_estado from public.expeditions where id=p_exp_id;
  if v_estado in ('expedida','entregue') then
    raise exception 'Não é possível cancelar uma expedição já expedida/entregue.'; end if;
  update public.expedition_notas set removida_em=now() where expedition_id=p_exp_id and removida_em is null;
  update public.expeditions set estado='cancelada' where id=p_exp_id;
end $$;
grant execute on function public.cancelar_expedition(uuid) to authenticated;
