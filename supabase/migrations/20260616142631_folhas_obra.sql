-- Módulo Folhas de Obra (Área Técnica) — All4laser Internal Platform
-- Tabelas: folhas_obra, folhas_obra_fotos (+ contador para a numeração)
-- Numeração automática FO-YYYY-NNNN (sequência reinicia a cada ano),
-- trigger de updated_at, RLS e índices.

-- ───────────────────────────────────────────────────────────────────────────
-- Função genérica de updated_at (reutilizável; idempotente)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- TABELA PRINCIPAL: folhas_obra
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.folhas_obra (
  id                       uuid primary key default gen_random_uuid(),
  numero                   text unique not null,          -- FO-YYYY-NNNN (gerado por trigger)
  data_intervencao         date not null,

  -- Cliente (id ligado + cópia desnormalizada para histórico)
  cliente_id               uuid references public.clientes(id),
  cliente_nome             text,
  cliente_pais             text,

  -- Técnico responsável
  tecnico_id               uuid references public.profiles(id),
  tecnico_nome             text,

  tipo_servico             text check (tipo_servico in (
                             'Reparação','Manutenção preventiva','Preparação para saída',
                             'Instalação','Formação técnica','Outro')),

  -- Equipamento (id ligado + cópia desnormalizada)
  equipamento_id           uuid references public.equipamentos(id),
  equipamento_modelo       text,
  equipamento_sn           text,
  equipamento_ano          text,

  codigos_erro             text,
  problema_observado       text,
  trabalho_realizado       text,

  -- Valores específicos Candela Alex/Yag (só aplicáveis nesses casos)
  valor_cabeca_alex        numeric,
  valor_transmissao_alex   numeric,

  material_utilizado       text,                           -- campo livre por agora
  observacoes              text,

  estado                   text not null default 'rascunho'
                             check (estado in ('rascunho','pendente_assinatura','concluida')),

  -- Assinaturas (URLs no storage)
  assinatura_tecnico_url   text,
  assinatura_tecnico_at    timestamptz,
  assinatura_cliente_url   text,
  assinatura_cliente_at    timestamptz,
  token_assinatura_cliente uuid not null default gen_random_uuid(),  -- link único p/ cliente assinar

  pdf_url                  text,

  criado_por               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- FOTOS associadas a cada folha de obra
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.folhas_obra_fotos (
  id         uuid primary key default gen_random_uuid(),
  folha_id   uuid not null references public.folhas_obra(id) on delete cascade,
  url        text not null,
  caminho    text,                                         -- path no storage
  nome       text,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- NUMERAÇÃO AUTOMÁTICA: FO-YYYY-NNNN (sequência por ano, reinicia em 0001)
-- Usa uma tabela-contador atómica (ON CONFLICT) para ser seguro em concorrência.
-- A função é SECURITY DEFINER para gerir o contador sem expor a tabela à RLS.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.folhas_obra_contador (
  ano    int  primary key,
  ultimo int  not null default 0
);

create or replace function public.gerar_numero_folha_obra()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ano int;
  v_seq int;
begin
  -- Respeita um número já fornecido manualmente (caso raro de migração/importação)
  if new.numero is not null and btrim(new.numero) <> '' then
    return new;
  end if;

  v_ano := extract(year from coalesce(new.data_intervencao, current_date))::int;

  insert into public.folhas_obra_contador as c (ano, ultimo)
       values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;

  new.numero := 'FO-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_folhas_obra_numero on public.folhas_obra;
create trigger trg_folhas_obra_numero
  before insert on public.folhas_obra
  for each row execute function public.gerar_numero_folha_obra();

drop trigger if exists trg_folhas_obra_updated_at on public.folhas_obra;
create trigger trg_folhas_obra_updated_at
  before update on public.folhas_obra
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- ÍNDICES
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists idx_folhas_obra_numero    on public.folhas_obra(numero);
create index if not exists idx_folhas_obra_tecnico    on public.folhas_obra(tecnico_id);
create index if not exists idx_folhas_obra_cliente    on public.folhas_obra(cliente_id);
create index if not exists idx_folhas_obra_estado     on public.folhas_obra(estado);
create index if not exists idx_folhas_obra_data       on public.folhas_obra(data_intervencao desc);
create index if not exists idx_folhas_obra_fotos_folha on public.folhas_obra_fotos(folha_id);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.folhas_obra          enable row level security;
alter table public.folhas_obra_fotos    enable row level security;
alter table public.folhas_obra_contador enable row level security;  -- sem políticas: acesso só via função SECURITY DEFINER

-- folhas_obra: leitura/escrita para autenticados; eliminar só admin
drop policy if exists folhas_obra_select on public.folhas_obra;
drop policy if exists folhas_obra_insert on public.folhas_obra;
drop policy if exists folhas_obra_update on public.folhas_obra;
drop policy if exists folhas_obra_delete on public.folhas_obra;

create policy folhas_obra_select on public.folhas_obra
  for select to authenticated using (true);
create policy folhas_obra_insert on public.folhas_obra
  for insert to authenticated with check (true);
create policy folhas_obra_update on public.folhas_obra
  for update to authenticated using (true) with check (true);
create policy folhas_obra_delete on public.folhas_obra
  for delete to authenticated using (is_admin());

-- folhas_obra_fotos: select/insert/delete para autenticados
drop policy if exists folhas_obra_fotos_select on public.folhas_obra_fotos;
drop policy if exists folhas_obra_fotos_insert on public.folhas_obra_fotos;
drop policy if exists folhas_obra_fotos_delete on public.folhas_obra_fotos;

create policy folhas_obra_fotos_select on public.folhas_obra_fotos
  for select to authenticated using (true);
create policy folhas_obra_fotos_insert on public.folhas_obra_fotos
  for insert to authenticated with check (true);
create policy folhas_obra_fotos_delete on public.folhas_obra_fotos
  for delete to authenticated using (true);

-- ───────────────────────────────────────────────────────────────────────────
-- GRANTs (tabelas criadas por SQL não recebem privilégios automáticos;
-- a RLS continua a ser a barreira real). O contador NÃO é concedido —
-- é acedido apenas pela função SECURITY DEFINER.
-- ───────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.folhas_obra       to authenticated;
grant select, insert, delete        on public.folhas_obra_fotos  to authenticated;
