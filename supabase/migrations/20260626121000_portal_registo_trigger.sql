-- ───────────────────────────────────────────────────────────────────────────
-- REGISTO DE CLIENTES DO PORTAL
-- Ajusta o trigger handle_new_user para distinguir clientes do portal de staff.
--
-- Antes: qualquer signUp cujo email não esteja em utilizadores_autorizados era
--        REJEITADO, e os autorizados viravam staff (registo em profiles).
-- Agora: se o signUp trouxer metadata { role: 'cliente' }, cria um registo em
--        clientes_portal SEM exigir autorização prévia. Caso contrário, mantém
--        exatamente o comportamento de staff anterior.
--
-- O metadata vem de supabase.auth.signUp({ email, password, options:{ data:{...} }})
-- e fica acessível em new.raw_user_meta_data.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  aut    public.utilizadores_autorizados;
  v_role text := coalesce(new.raw_user_meta_data->>'role', '');
begin
  -- ── Cliente do portal ──
  if v_role = 'cliente' then
    insert into public.clientes_portal (id, nome, email, telefone)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data->>'nome'), ''), new.email),
      new.email,
      nullif(btrim(new.raw_user_meta_data->>'telefone'), '')
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
