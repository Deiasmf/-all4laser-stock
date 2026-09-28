-- Area de Cliente All4laser
-- Portal completo com convites, documentos privados, reservas, galeria, chat,
-- pedidos de assistencia e lembretes. Todas as tabelas usam RLS.

create extension if not exists pgcrypto;

alter table public.clientes_portal
  add column if not exists empresa text,
  add column if not exists nif text,
  add column if not exists morada text,
  add column if not exists faturacao_nome text,
  add column if not exists faturacao_nif text,
  add column if not exists faturacao_morada text,
  add column if not exists preferencias_lembretes jsonb not null default '{"email":true,"sms":false,"whatsapp":false,"push":false}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.cliente_convites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  email text not null,
  nome text,
  empresa text,
  expira_em timestamptz not null,
  usado_em timestamptz,
  usado_por uuid references auth.users(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create table if not exists public.cliente_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_portal_id uuid references public.clientes_portal(id) on delete set null,
  categoria text not null check (categoria in ('fatura','contrato','certificado_formacao','outro')),
  titulo text not null,
  descricao text,
  data_documento date,
  caminho text not null,
  mime_type text,
  tamanho_bytes bigint,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create table if not exists public.cliente_equipamentos_reserva (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid references public.equipamentos(id) on delete set null,
  nome text not null,
  modelo text,
  numero_serie text,
  descricao text,
  zona text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_disponibilidade_bloqueios (
  id uuid primary key default gen_random_uuid(),
  equipamento_reserva_id uuid not null references public.cliente_equipamentos_reserva(id) on delete cascade,
  data_inicio date not null,
  data_fim date not null,
  motivo text not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  constraint cliente_bloqueios_datas check (data_fim >= data_inicio)
);

create table if not exists public.cliente_reservas (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  equipamento_reserva_id uuid not null references public.cliente_equipamentos_reserva(id) on delete restrict,
  modelo text,
  data_inicio date not null,
  data_fim date not null,
  local_utilizacao text,
  observacoes text,
  estado text not null default 'pendente' check (estado in ('pendente','confirmada','concluida','cancelada')),
  pedido_alteracao text,
  validado_por uuid references auth.users(id) on delete set null,
  validado_por_nome text,
  validado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cliente_reservas_datas check (data_fim >= data_inicio)
);

create table if not exists public.cliente_galeria_materiais (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  equipamento text,
  tratamento text,
  campanha text,
  formato text not null default 'publicacao' check (formato in ('publicacao','story','reel','outro')),
  legenda_sugerida text,
  caminho text not null,
  mime_type text,
  tamanho_bytes bigint,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_assistente_conteudos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null default 'geral',
  conteudo text not null,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_chat_conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  titulo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.cliente_chat_conversas(id) on delete cascade,
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  papel text not null check (papel in ('cliente','assistente','equipa')),
  conteudo text not null,
  sustentado boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cliente_assistencia_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  equipamento text not null,
  numero_serie text,
  descricao text not null,
  equipamento_parado boolean not null default false,
  contacto text,
  estado text not null default 'recebido' check (estado in ('recebido','em_analise','em_resolucao','resolvido')),
  email_assistencia_estado text not null default 'pendente' check (email_assistencia_estado in ('pendente','enviado','falhou')),
  email_assistencia_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_assistencia_anexos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.cliente_assistencia_pedidos(id) on delete cascade,
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  caminho text not null,
  nome_original text,
  mime_type text,
  tamanho_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.cliente_assistencia_mensagens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.cliente_assistencia_pedidos(id) on delete cascade,
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  visivel_cliente boolean not null default true,
  autor_tipo text not null check (autor_tipo in ('cliente','equipa')),
  autor_nome text,
  mensagem text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cliente_agendamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo text not null check (tipo in ('aluguer','formacao','assistencia')),
  titulo text not null,
  descricao text,
  inicio timestamptz not null,
  fim timestamptz,
  timezone text not null default 'Europe/Lisbon',
  estado text not null default 'agendado' check (estado in ('agendado','confirmado','alteracao_pedida','cancelado','concluido')),
  referencia_tipo text,
  referencia_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_lembretes (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.cliente_agendamentos(id) on delete cascade,
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  canal text not null check (canal in ('email','sms','whatsapp','push')),
  enviar_em timestamptz not null,
  estado text not null default 'pendente' check (estado in ('pendente','enviado','falhou','cancelado')),
  erro text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (agendamento_id, canal, enviar_em)
);

create table if not exists public.cliente_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  cliente_portal_id uuid not null references public.clientes_portal(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_config (
  id boolean primary key default true check (id),
  email_assistencia text not null default 'assistencia@all4laser.com',
  lembrete_48h boolean not null default true,
  lembrete_24h boolean not null default true,
  canais_ativos jsonb not null default '{"email":true,"sms":true,"whatsapp":false,"push":true}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.cliente_config(id) values (true) on conflict do nothing;

create table if not exists public.cliente_admin_auditoria (
  id uuid primary key default gen_random_uuid(),
  ator_id uuid references auth.users(id) on delete set null,
  ator_nome text,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  detalhe jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cliente_numero_contador (
  chave text primary key,
  ano int not null,
  ultimo int not null default 0
);

create or replace function public.cliente_next_numero(p_chave text, p_prefixo text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ano int := extract(year from now())::int; v_seq int;
begin
  insert into public.cliente_numero_contador(chave, ano, ultimo)
  values (p_chave, v_ano, 1)
  on conflict (chave) do update
    set ultimo = case when public.cliente_numero_contador.ano = excluded.ano then public.cliente_numero_contador.ultimo + 1 else 1 end,
        ano = excluded.ano
  returning ultimo into v_seq;
  return p_prefixo || '-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
end $$;

create or replace function public.cliente_reserva_numero()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := public.cliente_next_numero('cliente_reservas', 'CR');
  end if;
  return new;
end $$;

create or replace function public.cliente_assistencia_numero()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := public.cliente_next_numero('cliente_assistencia', 'AS');
  end if;
  return new;
end $$;

drop trigger if exists trg_cliente_reserva_numero on public.cliente_reservas;
create trigger trg_cliente_reserva_numero before insert on public.cliente_reservas
for each row execute function public.cliente_reserva_numero();

drop trigger if exists trg_cliente_assistencia_numero on public.cliente_assistencia_pedidos;
create trigger trg_cliente_assistencia_numero before insert on public.cliente_assistencia_pedidos
for each row execute function public.cliente_assistencia_numero();

create or replace function public.cliente_reserva_sem_conflito()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from public.cliente_reservas r
    where r.equipamento_reserva_id = new.equipamento_reserva_id
      and r.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and r.estado in ('pendente','confirmada')
      and daterange(r.data_inicio, r.data_fim, '[]') && daterange(new.data_inicio, new.data_fim, '[]')
  ) then
    raise exception 'Equipamento indisponivel nas datas escolhidas.';
  end if;
  if exists (
    select 1 from public.cliente_disponibilidade_bloqueios b
    where b.equipamento_reserva_id = new.equipamento_reserva_id
      and daterange(b.data_inicio, b.data_fim, '[]') && daterange(new.data_inicio, new.data_fim, '[]')
  ) then
    raise exception 'Equipamento bloqueado nas datas escolhidas.';
  end if;
  return new;
end $$;

drop trigger if exists trg_cliente_reserva_sem_conflito on public.cliente_reservas;
create trigger trg_cliente_reserva_sem_conflito before insert or update of equipamento_reserva_id, data_inicio, data_fim, estado
on public.cliente_reservas for each row execute function public.cliente_reserva_sem_conflito();

create or replace function public.cliente_criar_lembretes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.cliente_lembretes where agendamento_id = new.id and estado = 'pendente';
  if new.estado in ('cancelado','concluido') then
    update public.cliente_lembretes set estado = 'cancelado' where agendamento_id = new.id and estado = 'pendente';
    return new;
  end if;
  insert into public.cliente_lembretes(agendamento_id, cliente_portal_id, canal, enviar_em)
  select new.id, new.cliente_portal_id, canal, new.inicio - intervalo
  from (values ('email'::text, interval '48 hours'), ('email', interval '24 hours')) v(canal, intervalo)
  where new.inicio - intervalo > now()
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_cliente_criar_lembretes_ins on public.cliente_agendamentos;
create trigger trg_cliente_criar_lembretes_ins after insert on public.cliente_agendamentos
for each row execute function public.cliente_criar_lembretes();
drop trigger if exists trg_cliente_criar_lembretes_upd on public.cliente_agendamentos;
create trigger trg_cliente_criar_lembretes_upd after update of inicio, estado on public.cliente_agendamentos
for each row execute function public.cliente_criar_lembretes();

create or replace function public.cliente_is_owner(p_cliente_portal_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_cliente_portal_id = auth.uid();
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'cliente_convites','cliente_documentos','cliente_equipamentos_reserva',
    'cliente_disponibilidade_bloqueios','cliente_reservas','cliente_galeria_materiais',
    'cliente_assistente_conteudos','cliente_chat_conversas','cliente_chat_mensagens',
    'cliente_assistencia_pedidos','cliente_assistencia_anexos','cliente_assistencia_mensagens',
    'cliente_agendamentos','cliente_lembretes','cliente_push_subscriptions',
    'cliente_config','cliente_admin_auditoria','cliente_numero_contador'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create policy cliente_convites_staff on public.cliente_convites for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_documentos_select on public.cliente_documentos for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_documentos_staff on public.cliente_documentos for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_equipamentos_select on public.cliente_equipamentos_reserva for select to authenticated using (ativo or public.is_staff());
create policy cliente_equipamentos_staff on public.cliente_equipamentos_reserva for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_bloqueios_select on public.cliente_disponibilidade_bloqueios for select to authenticated using (public.is_staff());
create policy cliente_bloqueios_staff on public.cliente_disponibilidade_bloqueios for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_reservas_select on public.cliente_reservas for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_reservas_insert on public.cliente_reservas for insert to authenticated with check (cliente_portal_id = auth.uid());
create policy cliente_reservas_update_cliente on public.cliente_reservas for update to authenticated using (cliente_portal_id = auth.uid()) with check (cliente_portal_id = auth.uid());
create policy cliente_reservas_staff on public.cliente_reservas for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_galeria_select on public.cliente_galeria_materiais for select to authenticated using (ativo or public.is_staff());
create policy cliente_galeria_staff on public.cliente_galeria_materiais for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_assistente_select on public.cliente_assistente_conteudos for select to authenticated using (ativo or public.is_staff());
create policy cliente_assistente_staff on public.cliente_assistente_conteudos for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_chat_conversas_select on public.cliente_chat_conversas for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_chat_conversas_insert on public.cliente_chat_conversas for insert to authenticated with check (cliente_portal_id = auth.uid());
create policy cliente_chat_mensagens_select on public.cliente_chat_mensagens for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_chat_mensagens_insert on public.cliente_chat_mensagens for insert to authenticated with check (cliente_portal_id = auth.uid() or public.is_staff());

create policy cliente_assistencia_select on public.cliente_assistencia_pedidos for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_assistencia_insert on public.cliente_assistencia_pedidos for insert to authenticated with check (cliente_portal_id = auth.uid());
create policy cliente_assistencia_update_cliente on public.cliente_assistencia_pedidos for update to authenticated using (cliente_portal_id = auth.uid()) with check (cliente_portal_id = auth.uid());
create policy cliente_assistencia_staff on public.cliente_assistencia_pedidos for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_assistencia_anexos_select on public.cliente_assistencia_anexos for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_assistencia_anexos_insert on public.cliente_assistencia_anexos for insert to authenticated with check (cliente_portal_id = auth.uid() or public.is_staff());
create policy cliente_assistencia_msg_select on public.cliente_assistencia_mensagens for select to authenticated using (public.is_staff() or (cliente_portal_id = auth.uid() and visivel_cliente));
create policy cliente_assistencia_msg_insert on public.cliente_assistencia_mensagens for insert to authenticated with check (cliente_portal_id = auth.uid() or public.is_staff());

create policy cliente_agendamentos_select on public.cliente_agendamentos for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_agendamentos_staff on public.cliente_agendamentos for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy cliente_lembretes_select on public.cliente_lembretes for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_lembretes_staff on public.cliente_lembretes for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cliente_push_select on public.cliente_push_subscriptions for select to authenticated using (public.is_staff() or cliente_portal_id = auth.uid());
create policy cliente_push_all on public.cliente_push_subscriptions for all to authenticated using (public.is_staff() or cliente_portal_id = auth.uid()) with check (public.is_staff() or cliente_portal_id = auth.uid());

create policy cliente_config_select on public.cliente_config for select to authenticated using (true);
create policy cliente_config_staff on public.cliente_config for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy cliente_auditoria_staff on public.cliente_admin_auditoria for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public)
values
  ('cliente-documentos','cliente-documentos', false),
  ('cliente-assistencia','cliente-assistencia', false),
  ('cliente-galeria','cliente-galeria', false)
on conflict (id) do nothing;

create policy cliente_docs_storage_staff on storage.objects for all to authenticated
  using (bucket_id = 'cliente-documentos' and public.is_staff())
  with check (bucket_id = 'cliente-documentos' and public.is_staff());
create policy cliente_assistencia_storage on storage.objects for all to authenticated
  using (bucket_id = 'cliente-assistencia' and (public.is_staff() or owner = auth.uid()))
  with check (bucket_id = 'cliente-assistencia' and (public.is_staff() or owner = auth.uid()));
create policy cliente_galeria_storage_staff on storage.objects for all to authenticated
  using (bucket_id = 'cliente-galeria' and public.is_staff())
  with check (bucket_id = 'cliente-galeria' and public.is_staff());

