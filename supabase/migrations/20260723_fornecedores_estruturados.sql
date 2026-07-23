-- ============================================================
-- Fornecedores estruturados (fichas para cartas de porte e, no futuro,
-- contas correntes). Completa a tabela fornecedores existente (usada pela
-- Compra e pelos Envios) com morada, contactos, NIF/VAT e IBAN.
-- ============================================================

alter table public.fornecedores
  add column if not exists nif text,
  add column if not exists morada text,
  add column if not exists codigo_postal text,
  add column if not exists localidade text,
  add column if not exists pais text,
  add column if not exists telefone text,
  add column if not exists telemovel text,
  add column if not exists email_reparacoes text,
  add column if not exists pessoa_contacto text,
  add column if not exists iban text,
  add column if not exists updated_at timestamptz not null default now();

-- O antigo "contacto" guardava o telefone -> copia-o para "telefone".
-- (A coluna "contacto" fica como legado por agora, para não partir a Compra.)
update public.fornecedores set telefone = contacto where telefone is null and contacto is not null;

-- updated_at automático (função set_updated_at já existe na app).
drop trigger if exists trg_fornecedores_updated_at on public.fornecedores;
create trigger trg_fornecedores_updated_at
  before update on public.fornecedores
  for each row execute function public.set_updated_at();

-- Seed: garante que o fornecedor referido em texto livre (envios/reparações)
-- existe como ficha. Os restantes já existiam na tabela.
insert into public.fornecedores (nome)
select 'Physio Equip'
where not exists (select 1 from public.fornecedores where lower(nome) = lower('Physio Equip'));

-- RLS mantém-se: SELECT/INSERT/UPDATE = autenticado, DELETE = admin (is_admin()).
