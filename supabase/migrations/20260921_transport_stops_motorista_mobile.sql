-- Vista mobile do motorista: marcar paragem feita + nota do motorista.
-- Aplicada via apply_migration.

alter table public.transport_stops
  add column if not exists concluida_em   timestamptz,
  add column if not exists nota_motorista text;

-- Marcar/desmarcar uma paragem como feita. Ao desmarcar volta a 'confirmada'.
create or replace function public.transport_stop_marcar(p_stop uuid, p_feita boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissao.'; end if;
  update public.transport_stops
     set estado       = case when p_feita then 'concluida' else 'confirmada' end,
         concluida_em = case when p_feita then now() else null end,
         updated_at   = now()
   where id = p_stop;
end $$;

-- Guardar a nota do motorista numa paragem.
create or replace function public.transport_stop_nota(p_stop uuid, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissao.'; end if;
  update public.transport_stops
     set nota_motorista = nullif(trim(p_nota), ''), updated_at = now()
   where id = p_stop;
end $$;
