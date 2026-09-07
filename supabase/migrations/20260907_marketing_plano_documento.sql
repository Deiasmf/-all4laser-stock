-- ───────────────────────────────────────────────────────────────────────────
-- MARKETING — PLANO (documento de referência com versões)
--
-- ADITIVO. Guarda o documento do plano de marketing (PDF/docx) com HISTÓRICO:
-- cada upload é uma versão nova (nunca apaga a anterior). Ficheiro no bucket
-- privado 'marketing-media' (prefixo plano/). Acesso: is_staff().
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.marketing_plano_documentos (
  id              uuid primary key default gen_random_uuid(),
  versao          int not null,                    -- automática (trigger): 1, 2, 3…
  nome            text not null,                   -- nome do ficheiro/documento
  caminho         text not null,                   -- bucket 'marketing-media' (plano/…)
  tipo            text,                            -- pdf | docx | outro
  tamanho_bytes   bigint,
  notas           text,
  criado_por      uuid references public.profiles(id) on delete set null,
  criado_por_nome text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_mkt_plano_versao on public.marketing_plano_documentos(versao desc);

-- Numeração automática da versão (1 + máximo atual).
create or replace function public.gerar_versao_plano_marketing()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.versao is null or new.versao = 0 then
    select coalesce(max(versao), 0) + 1 into new.versao from public.marketing_plano_documentos;
  end if;
  return new;
end; $$;

drop trigger if exists trg_marketing_plano_versao on public.marketing_plano_documentos;
create trigger trg_marketing_plano_versao before insert on public.marketing_plano_documentos
  for each row execute function public.gerar_versao_plano_marketing();

-- RLS + GRANTS (is_staff)
alter table public.marketing_plano_documentos enable row level security;
grant select, insert, update, delete on public.marketing_plano_documentos to authenticated;
grant all on public.marketing_plano_documentos to service_role;
drop policy if exists marketing_plano_select on public.marketing_plano_documentos;
drop policy if exists marketing_plano_insert on public.marketing_plano_documentos;
drop policy if exists marketing_plano_update on public.marketing_plano_documentos;
drop policy if exists marketing_plano_delete on public.marketing_plano_documentos;
create policy marketing_plano_select on public.marketing_plano_documentos for select to authenticated using (public.is_staff());
create policy marketing_plano_insert on public.marketing_plano_documentos for insert to authenticated with check (public.is_staff());
create policy marketing_plano_update on public.marketing_plano_documentos for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy marketing_plano_delete on public.marketing_plano_documentos for delete to authenticated using (public.is_staff());
