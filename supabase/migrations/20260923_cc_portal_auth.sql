-- ───────────────────────────────────────────────────────────────────────────
-- PORTAL CONTAS CORRENTES — auth
-- Ensina o handle_new_user a reconhecer os utilizadores do portal de Contas
-- Correntes: são criados pela rota de convite (service role) com
-- app_metadata.role = 'portal'. Esses NÃO são staff — não podem ganhar um
-- registo em `profiles` (senão teriam acesso interno). A ligação à(s) conta(s)
-- vive em portal_users, criada pela própria rota de convite.
--
-- app_metadata (raw_app_meta_data) só é definível pela API de admin (service
-- role), nunca pelo próprio utilizador — por isso é seguro decidir o acesso por
-- ela. Preserva todo o comportamento anterior (app família, clientes CRM, staff).
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
  -- App da família: independente da autorização da All4laser.
  if new.raw_user_meta_data->>'app' = 'familia' then
    return new;
  end if;

  -- Portal de Contas Correntes: sem profile (não é staff). O acesso às contas
  -- é controlado por portal_users + RLS/views v_cc_portal_*.
  if coalesce(new.raw_app_meta_data->>'role', '') = 'portal' then
    return new;
  end if;

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

  select * into aut from public.utilizadores_autorizados where lower(email) = lower(new.email);
  if aut.email is null then
    raise exception 'Email não autorizado. Contacte a administração da All4laser.';
  end if;
  insert into public.profiles (id, email, nome, role)
  values (new.id, new.email, coalesce(aut.nome, new.email), aut.role);
  return new;
end;
$$;
