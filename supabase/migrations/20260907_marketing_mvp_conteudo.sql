-- ───────────────────────────────────────────────────────────────────────────
-- MARKETING — MVP de Conteúdo & Partilha (modelo simples PT/EN)
--
-- ADITIVO. Não altera nem migra dados existentes. Acrescenta à publicação
-- (marketing_posts) o conteúdo simples pedido no MVP e duas tabelas de apoio:
--   • marketing_post_publicacoes — estado "publicada" POR CANAL, com data real;
--   • marketing_post_anexos      — media (imagens/vídeo) DIRETAMENTE na publicação.
--
-- O modelo avançado da Fase 1 (variantes por plataforma, biblioteca de media)
-- fica intacto e continua a funcionar. Acesso: is_staff() (todo o staff), como
-- o resto do módulo. Reutiliza set_updated_at() e o bucket 'marketing-media'.
-- ───────────────────────────────────────────────────────────────────────────

-- ═══ 1. Conteúdo simples na publicação ══════════════════════════════════════
alter table public.marketing_posts
  add column if not exists texto_pt      text,
  add column if not exists texto_en      text,
  add column if not exists hashtags      text[] not null default '{}',
  add column if not exists data_prevista date,
  add column if not exists canais        text[] not null default '{}';
  -- canais: lista livre (gerível na app). Valores canónicos usados na UI:
  -- 'instagram', 'facebook', 'linkedin', 'site'. Sem CHECK para poder crescer.

comment on column public.marketing_posts.canais is
  'Canais-alvo (multi-seleção): instagram|facebook|linkedin|site (+ extensível).';

-- ═══ 2. Publicação por canal (estado real "Publicada" + data) ═══════════════
-- Uma linha por canal já publicado. Ausência = ainda não publicado nesse canal.
-- "Marcar publicada no Instagram" faz upsert; "desmarcar" apaga a linha.
create table if not exists public.marketing_post_publicacoes (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references public.marketing_posts(id) on delete cascade,
  canal              text not null,
  publicado_em       timestamptz not null default now(),
  publicado_por      uuid references public.profiles(id) on delete set null,
  publicado_por_nome text,
  created_at         timestamptz not null default now(),
  unique (post_id, canal)
);

-- ═══ 3. Anexos de media diretamente na publicação ═══════════════════════════
create table if not exists public.marketing_post_anexos (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.marketing_posts(id) on delete cascade,
  caminho         text not null,                       -- bucket privado 'marketing-media'
  tipo            text not null default 'imagem' check (tipo in ('imagem','video')),
  nome_original   text,
  largura         int,
  altura          int,
  tamanho_bytes   bigint,
  ordem           int not null default 0,
  criado_por      uuid references public.profiles(id) on delete set null,
  criado_por_nome text,
  created_at      timestamptz not null default now()
);

-- ═══ ÍNDICES ════════════════════════════════════════════════════════════════
create index if not exists idx_mkt_posts_data_prevista on public.marketing_posts(data_prevista);
create index if not exists idx_mkt_pub_post            on public.marketing_post_publicacoes(post_id);
create index if not exists idx_mkt_anexos_post         on public.marketing_post_anexos(post_id, ordem);

-- ═══ RLS + GRANTS (is_staff, igual ao resto do módulo) ══════════════════════
do $$
declare t text;
begin
  foreach t in array array['marketing_post_publicacoes','marketing_post_anexos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_staff())', t || '_delete', t);
  end loop;
end $$;
