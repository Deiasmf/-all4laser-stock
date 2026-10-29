-- Reviewed on the isolated branch only. No automatic deployment is configured.
-- Staff roles follow public.is_staff(): admin, financeiro, standard.
-- Retain RPC signatures; never trust actor identity supplied by a client.

CREATE OR REPLACE FUNCTION public.descontar_stock_peca(p_peca_id uuid, p_qtd integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Only provisioned staff may bypass RLS. User-editable metadata is never trusted.
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not public.is_staff() then
    raise exception 'Acesso reservado a colaboradores autorizados' using errcode = '42501';
  end if;
  if p_peca_id is null or p_qtd is null or p_qtd <= 0 then
    raise exception 'Peca e quantidade positiva obrigatorias' using errcode = '22023';
  end if;
  update public.pecas set quantidade = quantidade - p_qtd, updated_at = now()
    where id = p_peca_id and quantidade >= p_qtd;
  if not found then
    if not exists (select 1 from public.pecas where id = p_peca_id) then
      raise exception 'Peca inexistente' using errcode = 'P0002';
    end if;
    raise exception 'Stock insuficiente' using errcode = '22003';
  end if;
end;
$function$
;
revoke all on function public.descontar_stock_peca(uuid,integer) from public, anon, authenticated;
grant execute on function public.descontar_stock_peca(uuid,integer) to authenticated;

CREATE OR REPLACE FUNCTION public.incrementar_stock_peca(p_peca_id uuid, p_qtd integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Only provisioned staff may bypass RLS. User-editable metadata is never trusted.
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not public.is_staff() then
    raise exception 'Acesso reservado a colaboradores autorizados' using errcode = '42501';
  end if;
  if p_peca_id is null or p_qtd is null or p_qtd <= 0 then
    raise exception 'Peca e quantidade positiva obrigatorias' using errcode = '22023';
  end if;
  update public.pecas set quantidade = quantidade + p_qtd, updated_at = now()
    where id = p_peca_id;
  if not found then
    if not exists (select 1 from public.pecas where id = p_peca_id) then
      raise exception 'Peca inexistente' using errcode = 'P0002';
    end if;
    raise exception 'Stock insuficiente' using errcode = '22003';
  end if;
end;
$function$
;
revoke all on function public.incrementar_stock_peca(uuid,integer) from public, anon, authenticated;
grant execute on function public.incrementar_stock_peca(uuid,integer) to authenticated;

CREATE OR REPLACE FUNCTION public.anular_envio_pecas(p_envio_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_nome text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_estado text; v_numero text; r record;
begin
  -- Only provisioned staff may bypass RLS. User-editable metadata is never trusted.
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not public.is_staff() then
    raise exception 'Acesso reservado a colaboradores autorizados' using errcode = '42501';
  end if;
  if p_user_id is not null and p_user_id <> auth.uid() then
    raise exception 'Identidade do autor invalida' using errcode = '42501';
  end if;
  p_user_id := auth.uid();
  select coalesce(p.nome, p.email) into p_user_nome
    from public.profiles p where p.id = auth.uid();
  select estado, numero into v_estado, v_numero
    from public.envios_pecas where id = p_envio_id for update;
  if not found then raise exception 'Envio % nao existe', p_envio_id; end if;
  if v_estado = 'cancelado' then raise exception 'Envio % ja esta anulado', v_numero; end if;

  -- repõe stock: para cada saida_ep ainda não revertida, cria movimento simétrico
  for r in
    select m.id, m.peca_id, m.quantidade
      from public.stock_movements m
     where m.referencia_tipo='envio_pecas' and m.referencia_id=p_envio_id and m.tipo='saida_ep'
       and not exists (select 1 from public.stock_movements rv where rv.reverte_movimento_id = m.id)
     order by m.peca_id, m.id
  loop
    insert into public.stock_movements
      (peca_id, quantidade, tipo, referencia_tipo, referencia_id, referencia,
       reverte_movimento_id, user_id, criado_por_nome, notas)
    values
      (r.peca_id, -r.quantidade, 'reversao', 'envio_pecas', p_envio_id, v_numero,
       r.id, p_user_id, p_user_nome, p_motivo);
    update public.pecas set quantidade = quantidade - r.quantidade, updated_at = now()
      where id = r.peca_id;
  end loop;

  update public.envios_pecas set estado='cancelado', updated_at=now() where id = p_envio_id;

  -- Recalcula o "em reparação" das peças deste envio (após anular)
  for r in select distinct peca_id from public.envios_pecas_itens
            where envio_id = p_envio_id and peca_id is not null
  loop
    perform public.recalcular_reparacao_peca(r.peca_id);
  end loop;
end; $function$
;
revoke all on function public.anular_envio_pecas(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.anular_envio_pecas(uuid,uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.expedir_envio_pecas(p_envio_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_nome text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_estado text; v_numero text; v_motivo text; r record;
begin
  -- Only provisioned staff may bypass RLS. User-editable metadata is never trusted.
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not public.is_staff() then
    raise exception 'Acesso reservado a colaboradores autorizados' using errcode = '42501';
  end if;
  if p_user_id is not null and p_user_id <> auth.uid() then
    raise exception 'Identidade do autor invalida' using errcode = '42501';
  end if;
  p_user_id := auth.uid();
  select coalesce(p.nome, p.email) into p_user_nome
    from public.profiles p where p.id = auth.uid();
  select estado, numero, motivo into v_estado, v_numero, v_motivo
    from public.envios_pecas where id = p_envio_id for update;
  if not found then raise exception 'Envio % nao existe', p_envio_id; end if;
  if v_estado = 'cancelado' then raise exception 'Envio cancelado'; end if;
  if v_estado = 'expedido' then raise exception 'Envio % ja esta expedido', v_numero; end if;

  if coalesce(v_motivo,'') <> 'reparacao' then
    for r in
      select peca_id, sum(quantidade) as qtd
        from public.envios_pecas_itens
       where envio_id = p_envio_id and peca_id is not null and quantidade > 0
       group by peca_id order by peca_id
    loop
      insert into public.stock_movements
        (peca_id, quantidade, tipo, referencia_tipo, referencia_id, referencia, user_id, criado_por_nome)
      values
        (r.peca_id, -r.qtd, 'saida_ep', 'envio_pecas', p_envio_id, v_numero, p_user_id, p_user_nome);
      update public.pecas set quantidade = quantidade - r.qtd, updated_at = now()
        where id = r.peca_id and quantidade >= r.qtd;
      if not found then raise exception 'Stock insuficiente ou peca inexistente' using errcode = '22003'; end if;
    end loop;
  end if;

  update public.envios_pecas
     set estado='expedido', expedido_em=now(), updated_at=now()
   where id = p_envio_id;

  -- Recalcula o "em reparação" das peças deste envio (após mudar o estado)
  for r in select distinct peca_id from public.envios_pecas_itens
            where envio_id = p_envio_id and peca_id is not null
  loop
    perform public.recalcular_reparacao_peca(r.peca_id);
  end loop;
end; $function$
;
revoke all on function public.expedir_envio_pecas(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.expedir_envio_pecas(uuid,uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_reparacao_peca(p_peca_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Only provisioned staff may bypass RLS. User-editable metadata is never trusted.
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not public.is_staff() then
    raise exception 'Acesso reservado a colaboradores autorizados' using errcode = '42501';
  end if;
  if p_peca_id is null then return; end if;
  update public.pecas p
     set quantidade_reparacao = coalesce((
           select sum(i.quantidade)
             from public.envios_pecas_itens i
             join public.envios_pecas e on e.id = i.envio_id
            where i.peca_id = p_peca_id
              and e.destinatario_tipo = 'fornecedor'
              and e.motivo = 'reparacao'
              and e.estado = 'expedido'
              and e.reparacao_voltou_em is null
         ), 0),
         updated_at = now()
   where p.id = p_peca_id;
end; $function$
;
revoke all on function public.recalcular_reparacao_peca(uuid) from public, anon, authenticated;
grant execute on function public.recalcular_reparacao_peca(uuid) to authenticated;
