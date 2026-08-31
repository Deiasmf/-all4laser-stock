-- ───────────────────────────────────────────────────────────────────────────
-- TAREFAS — histórico automático (quem alterou o quê e quando).
-- Registado por triggers na BD (SECURITY DEFINER), à prova de adulteração:
-- criação, edição de campos, mudança de estado e reatribuição.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.user_task_history (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.user_tasks(id) on delete cascade,
  ator_id    uuid,
  ator_nome  text,
  tipo       text not null,   -- 'criacao' | 'campo' | 'estado' | 'reatribuicao'
  descricao  text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_uth_task on public.user_task_history(task_id, created_at);

grant select on public.user_task_history to authenticated;
grant all on public.user_task_history to service_role;
alter table public.user_task_history enable row level security;
drop policy if exists uth_select on public.user_task_history;
create policy uth_select on public.user_task_history for select to authenticated
  using (public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id));
-- Sem policy de INSERT: só os triggers (SECURITY DEFINER) escrevem.

create or replace function public.task_ator_nome()
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(nome, email) from public.profiles where id = auth.uid();
$$;

-- Criação
create or replace function public.log_user_task_criacao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.user_task_history(task_id, ator_id, ator_nome, tipo, descricao)
  values (new.id, auth.uid(), public.task_ator_nome(), 'criacao', 'Criou a tarefa');
  return new;
end $$;
drop trigger if exists trg_log_user_task_criacao on public.user_tasks;
create trigger trg_log_user_task_criacao after insert on public.user_tasks
  for each row execute function public.log_user_task_criacao();

-- Edição de campos
create or replace function public.log_user_task_campos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v text := public.task_ator_nome();
begin
  if new.titulo    is distinct from old.titulo    then insert into public.user_task_history(task_id,ator_id,ator_nome,tipo,descricao) values (new.id,auth.uid(),v,'campo','Alterou o título'); end if;
  if new.descricao is distinct from old.descricao then insert into public.user_task_history(task_id,ator_id,ator_nome,tipo,descricao) values (new.id,auth.uid(),v,'campo','Alterou a descrição'); end if;
  if new.prioridade is distinct from old.prioridade then insert into public.user_task_history(task_id,ator_id,ator_nome,tipo,descricao) values (new.id,auth.uid(),v,'campo','Prioridade: '||old.prioridade||' → '||new.prioridade); end if;
  if new.data_limite is distinct from old.data_limite then insert into public.user_task_history(task_id,ator_id,ator_nome,tipo,descricao) values (new.id,auth.uid(),v,'campo','Alterou a data limite'); end if;
  return new;
end $$;
drop trigger if exists trg_log_user_task_campos on public.user_tasks;
create trigger trg_log_user_task_campos after update on public.user_tasks
  for each row execute function public.log_user_task_campos();

-- Estado / reatribuição (na tabela de destinatários)
create or replace function public.log_user_task_assignee()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v text := public.task_ator_nome(); alvo text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nome,email) into alvo from public.profiles where id = new.user_id;
    insert into public.user_task_history(task_id,ator_id,ator_nome,tipo,descricao)
      values (new.task_id,auth.uid(),v,'reatribuicao','Atribuiu a '||coalesce(alvo,'?'));
    return new;
  elsif tg_op = 'DELETE' then
    select coalesce(nome,email) into alvo from public.profiles where id = old.user_id;
    insert into public.user_task_history(task_id,ator_id,ator_nome,tipo,descricao)
      values (old.task_id,auth.uid(),v,'reatribuicao','Removeu '||coalesce(alvo,'?'));
    return old;
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    select coalesce(nome,email) into alvo from public.profiles where id = new.user_id;
    insert into public.user_task_history(task_id,ator_id,ator_nome,tipo,descricao)
      values (new.task_id,auth.uid(),v,'estado', coalesce(alvo,'?')||': '||
        coalesce((select label from public.task_estados where slug=old.estado),old.estado)||' → '||
        coalesce((select label from public.task_estados where slug=new.estado),new.estado));
    return new;
  end if;
  return null;
end $$;
drop trigger if exists trg_log_uta on public.user_task_assignees;
create trigger trg_log_uta after insert or update or delete on public.user_task_assignees
  for each row execute function public.log_user_task_assignee();

-- Funções de trigger não devem ser chamáveis por RPC (correm como triggers).
revoke all on function public.task_ator_nome() from public, anon, authenticated;
revoke all on function public.log_user_task_criacao() from public, anon, authenticated;
revoke all on function public.log_user_task_campos() from public, anon, authenticated;
revoke all on function public.log_user_task_assignee() from public, anon, authenticated;
