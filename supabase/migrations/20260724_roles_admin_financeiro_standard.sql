-- ───────────────────────────────────────────────────────────────────────────
-- ROLES: admin / financeiro / standard
-- Migra o antigo 'viewer' (role não-privilegiado) para 'standard', introduz o
-- role 'financeiro', e adiciona helpers/RPC para gestão de roles por admin.
-- Nenhuma política RLS dependia do literal 'viewer' (só 'admin' via is_admin()).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Largar os CHECK antigos (admin/viewer) ANTES de migrar os dados.
alter table public.utilizadores_autorizados drop constraint if exists utilizadores_autorizados_role_check;
alter table public.profiles drop constraint if exists profiles_role_check;

-- 2. Migrar dados existentes viewer -> standard
update public.profiles set role = 'standard' where role = 'viewer';
update public.utilizadores_autorizados set role = 'standard' where role = 'viewer';

-- 3. Novos defaults
alter table public.profiles alter column role set default 'standard';
alter table public.utilizadores_autorizados alter column role set default 'standard';

-- 4. Novos CHECK (admin/financeiro/standard)
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','financeiro','standard'));
alter table public.utilizadores_autorizados
  add constraint utilizadores_autorizados_role_check check (role in ('admin','financeiro','standard'));

-- 5. Helper: acesso ao módulo financeiro (admin OU financeiro).
create or replace function public.has_financeiro_access()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','financeiro')
  );
$$;

-- 6. RPC de atribuição de role (só admin). Não abre UPDATE geral a profiles.
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar roles.';
  end if;
  if p_role not in ('admin','financeiro','standard') then
    raise exception 'Role inválido: %', p_role;
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Não podes remover o teu próprio acesso de administrador.';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'Utilizador não encontrado.';
  end if;

  update public.utilizadores_autorizados u
     set role = p_role
    from public.profiles p
   where p.id = p_user_id and lower(u.email) = lower(p.email);
end;
$$;

revoke all on function public.admin_set_role(uuid, text) from public;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.has_financeiro_access() to authenticated;
