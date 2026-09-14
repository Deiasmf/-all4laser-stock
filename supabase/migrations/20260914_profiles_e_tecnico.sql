-- Técnicos: marcar quem aparece como técnico nas Folhas de Obra / Comissões.
-- Até aqui a lista de "Técnico" mostrava TODOS os perfis da app. Passa a mostrar
-- só quem estiver marcado como técnico (profiles.e_tecnico).
-- Ninguém é apagado: os restantes utilizadores mantêm as contas e os acessos,
-- apenas deixam de constar na lista de técnicos.

alter table public.profiles
  add column if not exists e_tecnico boolean not null default false;

comment on column public.profiles.e_tecnico is
  'Aparece na lista de Técnico (Folhas de Obra, Comissões). Gerido em /definicoes/utilizadores.';

-- Marcação inicial: Bruno e Dinis.
update public.profiles
   set e_tecnico = true
 where lower(email) in ('bruno.liborio@all4laser.com', 'dinis.agueda@all4laser.com');

-- ── RPC: só o admin marca/desmarca técnicos (mesma regra do admin_set_role) ─────
create or replace function public.admin_set_tecnico(p_user_id uuid, p_e_tecnico boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem definir quem é técnico.';
  end if;

  update public.profiles set e_tecnico = coalesce(p_e_tecnico, false) where id = p_user_id;
  if not found then
    raise exception 'Utilizador não encontrado.';
  end if;
end;
$$;

revoke all on function public.admin_set_tecnico(uuid, boolean) from public, anon;
grant execute on function public.admin_set_tecnico(uuid, boolean) to authenticated;
