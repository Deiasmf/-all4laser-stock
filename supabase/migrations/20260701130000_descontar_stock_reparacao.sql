-- Desconto atómico de stock quando se envia uma peça substituta numa reparação.
-- SECURITY DEFINER para descontar mesmo que o utilizador não tenha escrita direta
-- na tabela pecas (a barreira continua a ser quem chama a função na app).

create or replace function public.descontar_stock_peca(p_peca_id uuid, p_qtd integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_peca_id is null or coalesce(p_qtd, 0) <= 0 then
    return;
  end if;
  update public.pecas
     set quantidade = quantidade - p_qtd,
         updated_at = now()
   where id = p_peca_id;
end;
$$;

grant execute on function public.descontar_stock_peca(uuid, integer) to authenticated;
