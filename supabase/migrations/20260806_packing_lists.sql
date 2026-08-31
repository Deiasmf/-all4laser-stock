-- Packing Lists: documento próprio (com ou sem pedido de cotação), numeração
-- PL-AAAA-NNNN, linhas de volume com descrição editável e pesos líq/bruto,
-- e versões de PDF (regenerar não substitui). RLS: admin + administrativo.

create table if not exists public.packing_list_numero_seq (ano int primary key, seq int not null default 0);
create or replace function public.packing_list_next_numero()
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_ano int := extract(year from now())::int; v_seq int;
begin
  insert into public.packing_list_numero_seq(ano, seq) values (v_ano, 1)
    on conflict (ano) do update set seq = public.packing_list_numero_seq.seq + 1
    returning seq into v_seq;
  return 'PL-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
end $$;
revoke execute on function public.packing_list_next_numero() from public, anon;
grant   execute on function public.packing_list_next_numero() to authenticated;

create table if not exists public.packing_lists (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  request_id uuid references public.freight_quote_requests(id) on delete set null,
  idioma text not null default 'en' check (idioma in ('pt','en')),
  destinatario_nome text,
  destinatario_morada text,
  referencia text,
  tracking_awb text,
  observacoes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packing_list_linhas (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references public.packing_lists(id) on delete cascade,
  ordem int not null default 0,
  descricao text,
  ext_c numeric, ext_l numeric, ext_a numeric,
  peso_liquido numeric,
  peso_bruto numeric,
  quantidade int not null default 1 check (quantidade > 0)
);
create index if not exists idx_pl_linhas on public.packing_list_linhas(packing_list_id);

create table if not exists public.packing_list_pdfs (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references public.packing_lists(id) on delete cascade,
  versao int not null,
  pdf_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pl_pdfs on public.packing_list_pdfs(packing_list_id);

do $$ declare t text; begin
  foreach t in array array['packing_lists','packing_list_linhas','packing_list_pdfs','packing_list_numero_seq'] loop
    execute format('alter table public.%s enable row level security;', t);
    execute format('create policy %1$s_rw on public.%1$s for all to authenticated using (public.has_administrativo_access()) with check (public.has_administrativo_access());', t);
    execute format('grant select, insert, update, delete on public.%s to authenticated;', t);
  end loop;
end $$;
