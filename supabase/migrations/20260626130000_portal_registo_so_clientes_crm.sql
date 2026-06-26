-- ───────────────────────────────────────────────────────────────────────────
-- REGISTO DO PORTAL RESTRITO A CLIENTES AUTORIZADOS (CRM)
-- Antes: qualquer email podia criar conta de cliente no portal.
-- Agora: só emails já registados na ficha de Clientes (public.clientes) o podem
--        fazer. A conta do portal fica automaticamente ligada ao cliente do CRM
--        (clientes_portal.cliente_id) e herda nome/telefone se não vierem no registo.
-- O staff continua a precisar de estar em utilizadores_autorizados (inalterado).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  aut    public.utilizadores_autorizados;
  cli    public.clientes;
  v_role text := coalesce(new.raw_user_meta_data->>'role', '');
begin
  -- ── Cliente do portal: só se o email existir na ficha de Clientes (CRM) ──
  if v_role = 'cliente' then
    select * into cli
      from public.clientes
     where email is not null and lower(email) = lower(new.email)
     limit 1;
    if cli.id is null then
      raise exception 'Email não autorizado. Contacte a All4laser para ativar o seu acesso ao portal.';
    end if;
    insert into public.clientes_portal (id, cliente_id, nome, email, telefone)
    values (
      new.id,
      cli.id,
      coalesce(nullif(btrim(new.raw_user_meta_data->>'nome'), ''), cli.nome, new.email),
      new.email,
      coalesce(nullif(btrim(new.raw_user_meta_data->>'telefone'), ''), cli.telefone)
    )
    on conflict (id) do nothing;
    return new;
  end if;

  -- ── Staff interno (comportamento original) ──
  select * into aut from public.utilizadores_autorizados where lower(email) = lower(new.email);
  if aut.email is null then
    raise exception 'Email não autorizado. Contacte a administração da All4laser.';
  end if;
  insert into public.profiles (id, email, nome, role)
  values (new.id, new.email, coalesce(aut.nome, new.email), aut.role);
  return new;
end;
$$;
