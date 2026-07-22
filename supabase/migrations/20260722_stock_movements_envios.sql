-- ============================================================
-- Stock movements para Envios de Peças (EP)
-- - stock_movements: fonte de verdade auditável
-- - expedir_envio_pecas: baixa de stock transacional ao expedir
-- - anular_envio_pecas: soft delete + reversão simétrica
-- - trigger: bloqueia hard delete de EP expedida
-- ============================================================

-- ============================================================
-- 1) TABELA stock_movements (fonte de verdade)
-- ============================================================
create table if not exists public.stock_movements (
  id                    uuid primary key default gen_random_uuid(),
  peca_id               uuid not null references public.pecas(id) on delete restrict,
  quantidade            integer not null check (quantidade <> 0),  -- + entrada / - saida
  tipo                  text not null check (tipo in
                          ('saldo_inicial','saida_ep','entrada_devolucao','ajuste','reversao')),
  referencia_tipo       text,        -- ex: 'envio_pecas'
  referencia_id         uuid,        -- id da EP
  referencia            text,        -- nº legível, ex: 'EP-2026-0011'
  reverte_movimento_id  uuid references public.stock_movements(id) on delete restrict,
  user_id               uuid,
  criado_por_nome       text,
  notas                 text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_stock_movements_peca on public.stock_movements(peca_id);
create index if not exists idx_stock_movements_ref  on public.stock_movements(referencia_tipo, referencia_id);

alter table public.stock_movements enable row level security;
grant select on public.stock_movements to authenticated;   -- escrita só via RPC
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated using (true);

-- ============================================================
-- 2) EXPEDIR EP (transacional: baixa de stock + estado)
--    Motivo 'reparacao' NÃO desconta (usa quantidade_reparacao).
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
end; $$;
grant execute on function public.expedir_envio_pecas(uuid,uuid,text) to authenticated;

-- ============================================================
-- 3) ANULAR EP (soft delete + reversão simétrica)
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
    update public.pecas set quantidade = quantidade - r.quantidade, updated_at = now()  -- -(-x) repõe
      where id = r.peca_id;
  end loop;

  update public.envios_pecas set estado='cancelado', updated_at=now() where id = p_envio_id;
end; $$;
grant execute on function public.anular_envio_pecas(uuid,uuid,text,text) to authenticated;

-- ============================================================
-- 4) Bloquear HARD DELETE de EP expedida
-- ============================================================
create or replace function public.impedir_delete_envio_expedido()
returns trigger language plpgsql as $$
begin
  if old.estado = 'expedido' then
    raise exception 'Nao e permitido apagar um envio expedido (%). Use anular_envio_pecas.', old.numero;
  end if;
  return old;
end; $$;
drop trigger if exists trg_impedir_delete_envio_expedido on public.envios_pecas;
create trigger trg_impedir_delete_envio_expedido
  before delete on public.envios_pecas
  for each row execute function public.impedir_delete_envio_expedido();
