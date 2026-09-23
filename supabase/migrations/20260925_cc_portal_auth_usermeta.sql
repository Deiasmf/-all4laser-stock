-- ───────────────────────────────────────────────────────────────────────────
-- PORTAL CONTAS CORRENTES — auth (correção)
-- O GoTrue só aplica o app_metadata DEPOIS de o trigger handle_new_user correr,
-- por isso o marcador app_metadata.role='portal' NÃO está presente no INSERT e o
-- utilizador do portal caía no ramo "staff" → "Email não autorizado" (erro
-- "Database error creating new user" no GoTrue).
--
-- Correção: aceitar o marcador 'portal' também em user_metadata
-- (raw_user_meta_data), que já está presente no INSERT — o mesmo canal que o
-- portal de reservas usa para 'cliente'. A rota de convite passa a enviar o
-- role em ambos (app_metadata p/ o claim do JWT, user_metadata p/ o trigger).
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
  if new.raw_user_meta_data->>'app' = 'familia' then
    return new;
  end if;

  -- Portal de Contas Correntes: sem profile (não é staff). Marcador em
  -- app_metadata (claim) OU user_metadata (presente já no INSERT).
  if coalesce(new.raw_app_meta_data->>'role', '') = 'portal'
     or v_role = 'portal' then
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
