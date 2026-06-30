-- Módulo Logística — Stock Reparação de Peças (All4laser)
-- Histórico de reparações de peças importado do monday.com.
-- Cada linha é um evento de reparação (peça enviada para reparar / recebida).
-- Não é stock por quantidade; é um registo histórico, por isso tem tabela própria.

create table if not exists public.reparacao_pecas (
  id              uuid primary key default gen_random_uuid(),
  fornecedor      text,            -- "Name": fornecedor de serviço (quem repara)
  peca            text,            -- "Descrição": a peça
  serial_number   text,            -- série da peça
  avaria          text,            -- "Descrição de Avaria"
  garantia        text,            -- S/ Garantia, Garantia, ...
  data_saida      date,            -- "Data da Saída"
  data_entrada    date,            -- "Data da Entrada"
  status          text,            -- Fechado, Em Reparação, Não reparado, ...
  pago            text,            -- Pago, Garantia, ou vazio
  observacoes     text,
  monday_item_id  text unique,     -- "Item ID" do monday — chave de deduplicação na importação
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- updated_at automático (reutiliza a função existente)
drop trigger if exists trg_reparacao_pecas_updated_at on public.reparacao_pecas;
create trigger trg_reparacao_pecas_updated_at
  before update on public.reparacao_pecas
  for each row execute function public.set_updated_at();

-- ── Índices ──
create index if not exists idx_reparacao_pecas_fornecedor on public.reparacao_pecas(fornecedor);
create index if not exists idx_reparacao_pecas_peca       on public.reparacao_pecas(peca);
create index if not exists idx_reparacao_pecas_serial     on public.reparacao_pecas(serial_number);
create index if not exists idx_reparacao_pecas_status     on public.reparacao_pecas(status);

-- ── RLS: leitura para autenticados; escrita só admin (mesmo padrão da tabela pecas) ──
alter table public.reparacao_pecas enable row level security;

drop policy if exists reparacao_pecas_select on public.reparacao_pecas;
drop policy if exists reparacao_pecas_insert on public.reparacao_pecas;
drop policy if exists reparacao_pecas_update on public.reparacao_pecas;
drop policy if exists reparacao_pecas_delete on public.reparacao_pecas;
create policy reparacao_pecas_select on public.reparacao_pecas for select to authenticated using (true);
create policy reparacao_pecas_insert on public.reparacao_pecas for insert to authenticated with check (is_admin());
create policy reparacao_pecas_update on public.reparacao_pecas for update to authenticated using (is_admin()) with check (is_admin());
create policy reparacao_pecas_delete on public.reparacao_pecas for delete to authenticated using (is_admin());

-- ── GRANTs ──
grant select, insert, update, delete on public.reparacao_pecas to authenticated;
