-- ─────────────────────────────────────────────────────────────────────────────
-- TRACKING — soft delete (eliminação com auditoria + filtro "eliminados")
-- ─────────────────────────────────────────────────────────────────────────────
-- Eliminar um tracking passa a marcar deleted_at/deleted_by (não apaga a linha),
-- para: (a) guardar quem/quando; (b) filtro "eliminados" + restauro; (c) impedir
-- que a sincronização automática ressuscite uma entrada eliminada de propósito.
-- A eliminação NÃO toca no documento de origem (a EP/expedição fica intacta).

alter table public.shipments_tracking
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_by     uuid,
  add column if not exists deleted_by_nome text;

-- Índice parcial: a lista normal só vê os não-eliminados.
create index if not exists shipments_tracking_ativos_idx
  on public.shipments_tracking (data_expedicao desc)
  where deleted_at is null;

-- ── Sincronização passa a respeitar eliminações ─────────────────────────────────
-- Se a entrada desta origem foi eliminada manualmente (deleted_at not null), não
-- a ressuscita nem cria nova. O dedup por tracking/AWB também ignora eliminadas.
create or replace function public.sync_shipment_tracking(
  p_origem        text,
  p_source_type   text,
  p_source_id     uuid,
  p_direcao       text,
  p_tipo          text,
  p_tracking      text,
  p_awb           text,
  p_carrier_nome  text,
  p_entidade_tipo text,
  p_cliente_id    uuid,
  p_supplier_id   uuid,
  p_entidade_nome text,
  p_descricao     text,
  p_carta_url     text,
  p_carta_caminho text,
  p_data_exped    date,
  p_anulada       boolean
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id       uuid;
  v_deleted  timestamptz;
  v_key      text := lower(coalesce(nullif(trim(p_tracking),''), nullif(trim(p_awb),'')));
  v_carrier  uuid;
begin
  if p_carrier_nome is not null and btrim(p_carrier_nome) <> '' then
    select id into v_carrier from public.carriers
      where lower(nome) = lower(btrim(p_carrier_nome)) or lower(codigo) = lower(btrim(p_carrier_nome))
      limit 1;
  end if;

  -- 1) Já existe entrada para esta origem?
  select id, deleted_at into v_id, v_deleted from public.shipments_tracking
    where source_type = p_source_type and source_id = p_source_id;

  if v_id is not null then
    -- Entrada eliminada manualmente: respeitar a eliminação (não ressuscitar).
    if v_deleted is not null then
      return v_id;
    end if;
    update public.shipments_tracking set
      tracking_number = coalesce(nullif(trim(p_tracking),''), tracking_number),
      awb             = coalesce(nullif(trim(p_awb),''), awb),
      tipo_transporte = coalesce(p_tipo, tipo_transporte),
      direcao         = coalesce(p_direcao, direcao),
      carrier_id      = coalesce(v_carrier, carrier_id),
      carrier_nome    = coalesce(nullif(trim(p_carrier_nome),''), carrier_nome),
      entidade_tipo   = coalesce(p_entidade_tipo, entidade_tipo),
      cliente_id      = coalesce(p_cliente_id, cliente_id),
      supplier_id     = coalesce(p_supplier_id, supplier_id),
      entidade_nome   = coalesce(nullif(trim(p_entidade_nome),''), entidade_nome),
      descricao_conteudo = coalesce(nullif(trim(p_descricao),''), descricao_conteudo),
      carta_porte_url = coalesce(p_carta_url, carta_porte_url),
      carta_porte_caminho = coalesce(p_carta_caminho, carta_porte_caminho),
      data_expedicao  = coalesce(p_data_exped, data_expedicao),
      origem_anulada  = p_anulada
    where id = v_id;

    update public.shipments_tracking_sources
      set anulada = p_anulada
      where source_type = p_source_type and source_id = p_source_id;
    return v_id;
  end if;

  -- 2) Dedup por tracking/AWB (ignora eliminadas).
  if v_key is not null then
    select id into v_id from public.shipments_tracking
      where dedup_key = v_key and deleted_at is null limit 1;
  end if;

  -- 3) Criar nova entrada se não houver dedup.
  if v_id is null then
    insert into public.shipments_tracking (
      tracking_number, awb, tipo_transporte, carrier_id, carrier_nome, direcao,
      descricao_conteudo, entidade_tipo, cliente_id, supplier_id, entidade_nome,
      origem, source_type, source_id, origem_anulada,
      carta_porte_url, carta_porte_caminho, data_expedicao
    ) values (
      nullif(trim(p_tracking),''), nullif(trim(p_awb),''), coalesce(p_tipo,'expresso'),
      v_carrier, nullif(trim(p_carrier_nome),''), coalesce(p_direcao,'envio'),
      nullif(trim(p_descricao),''), p_entidade_tipo, p_cliente_id, p_supplier_id,
      nullif(trim(p_entidade_nome),''), coalesce(p_origem,'manual'), p_source_type, p_source_id,
      p_anulada, p_carta_url, p_carta_caminho, p_data_exped
    ) returning id into v_id;
  end if;

  insert into public.shipments_tracking_sources (tracking_id, origem, source_type, source_id, anulada)
    values (v_id, coalesce(p_origem,'manual'), p_source_type, p_source_id, p_anulada)
    on conflict (source_type, source_id) do update set anulada = excluded.anulada;

  return v_id;
end;
$$;
