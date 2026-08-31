-- FICHAS DE PRODUTO v2 — cache de traduções dos campos de texto livre.
-- Chave = hash do texto original + idioma. Só se retraduz se o texto mudar.
create table if not exists public.ficha_traducoes (
  texto_hash text not null,
  idioma     text not null,
  traducao   text not null,
  created_at timestamptz not null default now(),
  primary key (texto_hash, idioma)
);

alter table public.ficha_traducoes enable row level security;
-- A escrita é feita pelo servidor (service key, ignora RLS). Leitura para staff.
drop policy if exists ficha_traducoes_select on public.ficha_traducoes;
create policy ficha_traducoes_select on public.ficha_traducoes
  for select to authenticated using (public.is_staff());
