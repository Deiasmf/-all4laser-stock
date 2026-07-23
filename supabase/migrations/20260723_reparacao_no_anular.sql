-- ============================================================
-- Anular/Expedir EP passam a repor também o "em reparação" das peças.
-- Bug: ao apagar uma EP de reparação de teste, pecas.quantidade_reparacao
-- ficava preso (sem forma de corrigir pela app). Agora anular/expedir
-- recalculam sempre o "em reparação" das peças do envio.
-- ============================================================

-- Recalcula pecas.quantidade_reparacao a partir das EPs a fornecedor,
-- motivo reparação, expedidas e ainda por voltar.
create or replace function public.recalcular_reparacao_peca(p_peca_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
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
end; $$;
grant execute on function public.recalcular_reparacao_peca(uuid) to authenticated;

-- ============================================================
-- EXPEDIR EP (baixa de stock + estado + recálculo de reparação)
-- ============================================================
create or replace function public.expedir_envio_pecas(
  p_envio_id uuid, p_user_id uuid default null, p_user_nome text default null
) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_estado text; v_numero text; v_motivo text; r record;
begin
  select estado, numero, motivo into v_estado, v_numero, v_motivo
    from public.envios_pecas where id = p_envio_id for update;
  if not found then raise exception 'Envio % nao existe', p_envio_id; end if;
  if v_estado = 'expedido' then raise exception 'Envio % ja esta expedido', v_numero; end if;

  if coalesce(v_motivo,'') <> 'reparacao' then
    for r in
      select peca_id, sum(quantidade) as qtd
        from public.envios_pecas_itens
       where envio_id = p_envio_id and peca_id is not null and quantidade > 0
       group by peca_id
    loop
      insert into public.stock_movements
        (peca_id, quantidade, tipo, referencia_tipo, referencia_id, referencia, user_id, criado_por_nome)
      values
        (r.peca_id, -r.qtd, 'saida_ep', 'envio_pecas', p_envio_id, v_numero, p_user_id, p_user_nome);
      update public.pecas set quantidade = quantidade - r.qtd, updated_at = now()
        where id = r.peca_id;
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
end; $$;
grant execute on function public.expedir_envio_pecas(uuid,uuid,text) to authenticated;

-- ============================================================
-- ANULAR EP (soft delete + reversão de stock + recálculo de reparação)
-- ============================================================
create or replace function public.anular_envio_pecas(
  p_envio_id uuid, p_user_id uuid default null, p_user_nome text default null, p_motivo text default null
) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_estado text; v_numero text; r record;
begin
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
end; $$;
grant execute on function public.anular_envio_pecas(uuid,uuid,text,text) to authenticated;
