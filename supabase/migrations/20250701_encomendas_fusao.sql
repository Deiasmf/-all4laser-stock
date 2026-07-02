-- Fusão Envio + Receção → módulo único "Encomendas".
-- A tabela recepcao_movimentos passa a ser o livro central de TODAS as encomendas.
-- Cada envio (envios_pecas) passa a gerar automaticamente um movimento de SAÍDA,
-- tal como já acontece com as reparações. A ficha detalhada do envio mantém-se.

-- ── Sincronização automática: envios_pecas → recepcao_movimentos ──
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
      'fechado',                       -- uma venda não aguarda devolução
      'Estado: ' || new.estado,
      new.criado_por, new.criado_por_nome
    );
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    update public.recepcao_movimentos
       set notas = 'Estado: ' || new.estado,
           data_movimento = coalesce(new.expedido_em::date, data_movimento)
     where referencia_tipo = 'envio_pecas' and referencia_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_sync_recepcao_envio_ins on public.envios_pecas;
create trigger trigger_sync_recepcao_envio_ins
  after insert on public.envios_pecas
  for each row execute function public.sync_recepcao_from_envio();

drop trigger if exists trigger_sync_recepcao_envio_upd on public.envios_pecas;
create trigger trigger_sync_recepcao_envio_upd
  after update on public.envios_pecas
  for each row execute function public.sync_recepcao_from_envio();

-- ── Backfill: envios já existentes que ainda não estão no livro central ──
insert into public.recepcao_movimentos (
  tipo, data_movimento, origem_destino, descricao, quantidade,
  referencia_tipo, referencia_id, referencia_numero, match_status,
  notas, criado_por, criado_por_nome
)
select
  'saida',
  coalesce(e.expedido_em::date, e.created_at::date, current_date),
  coalesce(e.cliente_nome, 'Cliente'),
  'Envio ' || coalesce(e.numero, ''),
  1,
  'envio_pecas', e.id, e.numero,
  'fechado',
  'Estado: ' || e.estado,
  e.criado_por, e.criado_por_nome
from public.envios_pecas e
where not exists (
  select 1 from public.recepcao_movimentos m
  where m.referencia_tipo = 'envio_pecas' and m.referencia_id = e.id
);
