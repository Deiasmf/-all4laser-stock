-- CRM de Clientes (Comercial): estende a ficha de cada cliente.
-- A tabela `clientes` já tinha: id, nome, pais, nacional, created_at, email.
-- Acrescenta dados de contacto, faturação, tipo e notas internas.

alter table public.clientes add column if not exists telefone       text;
alter table public.clientes add column if not exists contacto_nome  text;  -- pessoa de contacto
alter table public.clientes add column if not exists nif            text;
alter table public.clientes add column if not exists morada         text;
alter table public.clientes add column if not exists cidade         text;
alter table public.clientes add column if not exists codigo_postal  text;
alter table public.clientes add column if not exists tipo           text;  -- Clínica | Médico | Distribuidor | Outro
alter table public.clientes add column if not exists observacoes    text;
alter table public.clientes add column if not exists atualizado_em  timestamptz;

-- Pesquisa por nome/cidade/email mais rápida na lista do CRM.
create index if not exists clientes_nome_idx   on public.clientes (lower(nome));
create index if not exists clientes_cidade_idx on public.clientes (lower(cidade));
