-- Novo Envio: destinatário (cliente ou fornecedor), motivo, faturável e S/N por item.

-- ── Colunas novas em envios_pecas ──
alter table public.envios_pecas add column if not exists destinatario_tipo text
  check (destinatario_tipo in ('cliente','fornecedor')) default 'cliente';
alter table public.envios_pecas add column if not exists fornecedor_id uuid references public.fornecedores(id);
alter table public.envios_pecas add column if not exists fornecedor_nome text;
alter table public.envios_pecas add column if not exists motivo text
  check (motivo in ('venda','reparacao','garantia','pecas_falta')) default 'venda';
alter table public.envios_pecas add column if not exists faturavel boolean not null default true;

-- ── S/N por item ──
alter table public.envios_pecas_itens add column if not exists serial_number text;

-- ── Trigger de sincronização com o livro central (usa o destinatário certo) ──
create or replace function public.sync_recepcao_from_envio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destino text;
  v_motivo  text;
begin
  v_destino := case when new.destinatario_tipo = 'fornecedor'
                    then coalesce(new.fornecedor_nome, 'Fornecedor')
                    else coalesce(new.cliente_nome, 'Cliente') end;
  v_motivo := case new.motivo
                when 'venda' then 'Venda'
                when 'reparacao' then 'Reparação'
                when 'garantia' then 'Garantia'
                when 'pecas_falta' then 'Peças em falta'
                else coalesce(new.motivo, '') end;

  if tg_op = 'INSERT' then
    insert into public.recepcao_movimentos (
      tipo, data_movimento, origem_destino, descricao, quantidade,
      referencia_tipo, referencia_id, referencia_numero, match_status,
      notas, criado_por, criado_por_nome
    ) values (
      'saida',
      coalesce(new.expedido_em::date, new.created_at::date, current_date),
      v_destino,
      'Envio ' || coalesce(new.numero, '') || nullif(' · ' || v_motivo, ' · '),
      1,
      'envio_pecas', new.id, new.numero,
      'fechado',
      'Estado: ' || new.estado,
      new.criado_por, new.criado_por_nome
    );
  elsif tg_op = 'UPDATE' and (new.estado is distinct from old.estado
       or new.destinatario_tipo is distinct from old.destinatario_tipo
       or new.fornecedor_nome is distinct from old.fornecedor_nome
       or new.cliente_nome is distinct from old.cliente_nome) then
    update public.recepcao_movimentos
       set notas = 'Estado: ' || new.estado,
           origem_destino = v_destino,
           data_movimento = coalesce(new.expedido_em::date, data_movimento)
     where referencia_tipo = 'envio_pecas' and referencia_id = new.id;
  end if;
  return new;
end;
$$;

-- ── Corrigir o destino dos movimentos já existentes (envios que são p/ fornecedor) ──
update public.recepcao_movimentos m
   set origem_destino = case when e.destinatario_tipo = 'fornecedor'
                             then coalesce(e.fornecedor_nome, 'Fornecedor')
                             else coalesce(e.cliente_nome, 'Cliente') end
  from public.envios_pecas e
 where m.referencia_tipo = 'envio_pecas' and m.referencia_id = e.id
   and e.destinatario_tipo = 'fornecedor';
