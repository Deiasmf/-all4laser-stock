-- ───────────────────────────────────────────────────────────────────────────
-- CONTA CORRENTE — tabela-razão de movimentos (clientes e fornecedores)
-- Convenção uniforme: saldo = Σvalor_debito − Σvalor_credito.
--   fatura                                   -> débito  (aumenta o saldo)
--   recibo / pagamento / nota_credito /
--   adiantamento                             -> crédito (reduz o saldo)
-- Interpretação: cliente saldo>0 = a receber; fornecedor saldo>0 = a pagar.
-- Preparada para o Keyinvoice: origem + keyinvoice_doc_id (índice único parcial).
-- Acesso só a admin+financeiro (RLS has_financeiro_access()).
-- ───────────────────────────────────────────────────────────────────────────

-- Placeholder da fase anterior, vazio e substituído por esta tabela-razão.
drop table if exists public.financeiro_contas_correntes;

create table if not exists public.financeiro_movimentos (
  id               uuid primary key default gen_random_uuid(),

  -- Entidade (cliente OU fornecedor)
  entidade_tipo    text not null check (entidade_tipo in ('cliente','fornecedor')),
  cliente_id       uuid references public.clientes(id) on delete set null,
  fornecedor_id    uuid references public.fornecedores(id) on delete set null,
  entidade_nome    text,   -- snapshot do nome (robustez/histórico)

  -- Documento
  tipo_documento   text not null check (tipo_documento in
                     ('fatura','nota_credito','recibo','pagamento','adiantamento')),
  documento_ref    text,                 -- nº do documento (Keyinvoice quando aplicável)
  data_documento   date not null,
  data_vencimento  date,

  -- Valores
  valor_debito     numeric(12,2) not null default 0 check (valor_debito >= 0),
  valor_credito    numeric(12,2) not null default 0 check (valor_credito >= 0),
  valor_liquidado  numeric(12,2) not null default 0 check (valor_liquidado >= 0),
  estado           text not null default 'pendente'
                     check (estado in ('pendente','parcial','liquidado')),
  notas            text,

  -- Origem / integração Keyinvoice (sync no próximo prompt)
  origem           text not null default 'manual' check (origem in ('manual','keyinvoice')),
  keyinvoice_doc_id text,

  -- Auditoria
  criado_por       uuid,
  criado_por_nome  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Coerência entidade<->id
  constraint financeiro_mov_entidade_ok check (
    (entidade_tipo = 'cliente'    and cliente_id is not null and fornecedor_id is null) or
    (entidade_tipo = 'fornecedor' and fornecedor_id is not null and cliente_id is null)
  )
);

-- Índices
create index if not exists idx_fin_mov_cliente    on public.financeiro_movimentos(cliente_id)    where cliente_id is not null;
create index if not exists idx_fin_mov_fornecedor on public.financeiro_movimentos(fornecedor_id) where fornecedor_id is not null;
create index if not exists idx_fin_mov_tipo        on public.financeiro_movimentos(entidade_tipo);
create index if not exists idx_fin_mov_data        on public.financeiro_movimentos(data_documento);
create index if not exists idx_fin_mov_venc        on public.financeiro_movimentos(data_vencimento);
create index if not exists idx_fin_mov_estado      on public.financeiro_movimentos(estado);
-- Idempotência da futura sync Keyinvoice: 1 movimento por doc externo.
create unique index if not exists uq_fin_mov_keyinvoice
  on public.financeiro_movimentos(keyinvoice_doc_id) where keyinvoice_doc_id is not null;

-- Trigger: normaliza estado/valor_liquidado e updated_at.
--  • fatura: estado deriva de valor_liquidado vs valor_debito (o montante da fatura)
--  • outros documentos (liquidação): ficam 'liquidado' e liquidam o próprio valor
create or replace function public.financeiro_movimentos_normalizar()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.tipo_documento = 'fatura' then
    if new.valor_liquidado <= 0 then
      new.estado := 'pendente';
    elsif new.valor_liquidado >= new.valor_debito then
      new.estado := 'liquidado';
      new.valor_liquidado := new.valor_debito;
    else
      new.estado := 'parcial';
    end if;
  else
    new.valor_liquidado := greatest(new.valor_debito, new.valor_credito);
    new.estado := 'liquidado';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_fin_mov_normalizar on public.financeiro_movimentos;
create trigger trg_fin_mov_normalizar
  before insert or update on public.financeiro_movimentos
  for each row execute function public.financeiro_movimentos_normalizar();

-- RLS: só admin+financeiro (a barreira real; grants não chegam sem a política).
alter table public.financeiro_movimentos enable row level security;
grant select, insert, update, delete on public.financeiro_movimentos to authenticated;
grant all on public.financeiro_movimentos to service_role;
drop policy if exists financeiro_movimentos_acesso on public.financeiro_movimentos;
create policy financeiro_movimentos_acesso on public.financeiro_movimentos
  for all to authenticated
  using (public.has_financeiro_access())
  with check (public.has_financeiro_access());
