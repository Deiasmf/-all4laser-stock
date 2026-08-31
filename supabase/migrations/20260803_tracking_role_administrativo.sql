-- ───────────────────────────────────────────────────────────────────────────
-- ROLE 'administrativo' — para a Área Administrativa (separador Tracking).
-- Estende o conjunto de roles existente (admin/financeiro/standard) com um novo
-- role 'administrativo'. Helper has_administrativo_access() = admin OU
-- administrativo, para gating por RLS (mesmo padrão de has_financeiro_access()).
-- Não altera dados existentes (ninguém fica 'administrativo' automaticamente —
-- a Andreia atribui o role em /definicoes/utilizadores).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Atualizar os CHECK de role (acrescentar 'administrativo').
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.utilizadores_autorizados drop constraint if exists utilizadores_autorizados_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','financeiro','administrativo','standard'));
alter table public.utilizadores_autorizados
  add constraint utilizadores_autorizados_role_check check (role in ('admin','financeiro','administrativo','standard'));

-- 2. Helper de acesso à Área Administrativa (admin OU administrativo).
create or replace function public.has_administrativo_access()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','administrativo')
  );
$$;

grant execute on function public.has_administrativo_access() to authenticated;

-- 3. Permitir atribuir o novo role via RPC admin_set_role (mantém as restantes regras).
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
  if p_role not in ('admin','financeiro','administrativo','standard') then
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
