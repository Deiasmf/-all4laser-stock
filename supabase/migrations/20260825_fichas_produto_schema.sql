-- FICHAS DE PRODUTO — Fase 0: fundação de dados
-- Dados de produto numa tabela à parte (staff edita; o núcleo/financeiro do
-- inventário continua só-admin), galeria com capa/ordem, handpieces, acessórios
-- estruturados, config, templates PT/EN/ES/FR, links partilháveis e envios.

-- Permissão: admin OU administrativo (espelha o temAcessoAdministrativo do frontend)
create or replace function public.is_administrativo()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','administrativo'));
$$;
revoke all on function public.is_administrativo() from public, anon;
grant execute on function public.is_administrativo() to authenticated;

-- 1) Dados de produto (staff edita; inventário continua só-admin)
create table if not exists public.equipamento_produto (
  equipamento_id uuid primary key references public.equipamentos(id) on delete cascade,
  condicao text, condicao_descricao text,
  disponibilidade text not null default 'disponivel',
  voltagem text, frequencia text, dimensoes text, peso_kg numeric, software_versao text,
  updated_at timestamptz not null default now(),
  constraint ep_condicao_check check (condicao is null or condicao in
    ('Recondicionado','As it is','Usado','Usado em bom estado','Para Peças','Novo')),
  constraint ep_disp_check check (disponibilidade in ('disponivel','reservado','vendido'))
);
grant select, insert, update on public.equipamento_produto to authenticated;
grant all on public.equipamento_produto to service_role;
alter table public.equipamento_produto enable row level security;
drop policy if exists ep_select on public.equipamento_produto;
create policy ep_select on public.equipamento_produto for select to authenticated using (true);
drop policy if exists ep_ins on public.equipamento_produto;
create policy ep_ins on public.equipamento_produto for insert to authenticated with check (public.is_staff());
drop policy if exists ep_upd on public.equipamento_produto;
create policy ep_upd on public.equipamento_produto for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- 2) Galeria: ordem + foto de capa; policy de UPDATE (não existia) e DELETE p/ staff
alter table public.media
  add column if not exists ordem int not null default 0,
  add column if not exists capa boolean not null default false;
create unique index if not exists idx_media_capa_unica on public.media(equipamento_id) where capa;
drop policy if exists media_update on public.media;
create policy media_update on public.media for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists media_delete on public.media;
create policy media_delete on public.media for delete to authenticated using (public.is_staff());

-- 3) Handpieces (contador por peça de mão + data de leitura)
create table if not exists public.equipamento_handpieces (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  nome text not null, contador_pulsos bigint, data_leitura date,
  ordem int not null default 0, created_at timestamptz not null default now()
);
create index if not exists idx_hp_equip on public.equipamento_handpieces(equipamento_id);

-- 4) Acessórios estruturados
create table if not exists public.equipamento_acessorios (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  descricao text not null, ordem int not null default 0, created_at timestamptz not null default now()
);
create index if not exists idx_acess_equip on public.equipamento_acessorios(equipamento_id);

grant select, insert, update, delete on public.equipamento_handpieces to authenticated;
grant select, insert, update, delete on public.equipamento_acessorios to authenticated;
grant all on public.equipamento_handpieces to service_role;
grant all on public.equipamento_acessorios to service_role;
alter table public.equipamento_handpieces enable row level security;
alter table public.equipamento_acessorios enable row level security;
drop policy if exists hp_sel on public.equipamento_handpieces;
create policy hp_sel on public.equipamento_handpieces for select to authenticated using (true);
drop policy if exists hp_wr on public.equipamento_handpieces;
create policy hp_wr on public.equipamento_handpieces for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists ac_sel on public.equipamento_acessorios;
create policy ac_sel on public.equipamento_acessorios for select to authenticated using (true);
drop policy if exists ac_wr on public.equipamento_acessorios;
create policy ac_wr on public.equipamento_acessorios for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 5) Configuração das fichas (1 linha; admin edita)
create table if not exists public.ficha_config (
  id boolean primary key default true,
  min_fotos int not null default 5,
  meses_leitura_valida int not null default 6,
  constraint ficha_config_singleton check (id)
);
insert into public.ficha_config (id) values (true) on conflict (id) do nothing;
grant select on public.ficha_config to authenticated;
grant all on public.ficha_config to service_role;
alter table public.ficha_config enable row level security;
drop policy if exists fc_sel on public.ficha_config;
create policy fc_sel on public.ficha_config for select to authenticated using (true);
drop policy if exists fc_adm on public.ficha_config;
create policy fc_adm on public.ficha_config for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 6) Templates PT/EN/ES/FR (email/pdf; admin edita)
create table if not exists public.ficha_templates (
  id uuid primary key default gen_random_uuid(),
  idioma text not null check (idioma in ('pt','en','es','fr')),
  tipo text not null check (tipo in ('email','pdf')),
  assunto text, corpo text, nota_legal text, contactos text,
  unique (idioma, tipo)
);
grant select on public.ficha_templates to authenticated;
grant all on public.ficha_templates to service_role;
alter table public.ficha_templates enable row level security;
drop policy if exists ft_sel on public.ficha_templates;
create policy ft_sel on public.ficha_templates for select to authenticated using (true);
drop policy if exists ft_adm on public.ficha_templates;
create policy ft_adm on public.ficha_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 7) Links partilháveis (criar: admin+administrativo; revogar: admin)
create table if not exists public.ficha_links (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  token text unique not null default replace(gen_random_uuid()::text,'-',''),
  idioma text not null default 'pt',
  incluir_preco boolean not null default false,
  incluir_sn_completo boolean not null default false,
  expira_em timestamptz not null default (now() + interval '90 days'),
  revogado boolean not null default false,
  views int not null default 0, ultima_view timestamptz,
  criado_por uuid, criado_em timestamptz not null default now()
);
create index if not exists idx_flinks_equip on public.ficha_links(equipamento_id);
grant select, insert on public.ficha_links to authenticated;
grant all on public.ficha_links to service_role;
alter table public.ficha_links enable row level security;
drop policy if exists fl_sel on public.ficha_links;
create policy fl_sel on public.ficha_links for select to authenticated using (public.is_staff());
drop policy if exists fl_ins on public.ficha_links;
create policy fl_ins on public.ficha_links for insert to authenticated with check (public.is_administrativo());
drop policy if exists fl_upd on public.ficha_links;
create policy fl_upd on public.ficha_links for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 8) Registo de envios + itens (admin+administrativo)
create table if not exists public.ficha_envios (
  id uuid primary key default gen_random_uuid(),
  enviado_por uuid, enviado_por_nome text,
  para_email text not null, para_nome text,
  lead_id uuid, cliente_id uuid,
  assunto text, idioma text, criado_em timestamptz not null default now()
);
create table if not exists public.ficha_envio_itens (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.ficha_envios(id) on delete cascade,
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  link_id uuid references public.ficha_links(id) on delete set null,
  incluiu_preco boolean not null default false, incluiu_sn_completo boolean not null default false
);
create index if not exists idx_fenvio_itens on public.ficha_envio_itens(envio_id);
create index if not exists idx_fenvio_equip on public.ficha_envio_itens(equipamento_id);
grant select, insert on public.ficha_envios to authenticated;
grant select, insert on public.ficha_envio_itens to authenticated;
grant all on public.ficha_envios to service_role;
grant all on public.ficha_envio_itens to service_role;
alter table public.ficha_envios enable row level security;
alter table public.ficha_envio_itens enable row level security;
drop policy if exists fe_sel on public.ficha_envios;
create policy fe_sel on public.ficha_envios for select to authenticated using (public.is_staff());
drop policy if exists fe_ins on public.ficha_envios;
create policy fe_ins on public.ficha_envios for insert to authenticated with check (public.is_administrativo());
drop policy if exists fei_sel on public.ficha_envio_itens;
create policy fei_sel on public.ficha_envio_itens for select to authenticated using (public.is_staff());
drop policy if exists fei_ins on public.ficha_envio_itens;
create policy fei_ins on public.ficha_envio_itens for insert to authenticated with check (public.is_administrativo());
