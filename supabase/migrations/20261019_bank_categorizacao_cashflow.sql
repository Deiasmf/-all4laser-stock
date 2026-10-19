-- FINANCEIRO — arranque com dados reais (Partes A/B/D).
-- NOTA: as tabelas bank_* foram criadas por MCP e nunca estiveram em migrations;
-- este ficheiro versiona as alterações desta sessão. O schema-base das bank_* fica
-- documentado aqui por referência mas não é recriado (já existe em produção).

-- ─────────────────────────────────────────────────────────────────────────────
-- A) bank_movements: campos próprios do extrato + categorização + desambiguação
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.bank_movements
  add column if not exists flag_fr          text,           -- coluna "F / R" do BPI
  add column if not exists categoria        text,           -- Parte B (cashflow)
  add column if not exists rubrica          text,           -- Parte B (detalhe/entidade)
  add column if not exists categoria_origem text
     check (categoria_origem in ('analise_inicial','regra','manual')),
  add column if not exists interna          boolean not null default false, -- transf. EUR↔USD próprias
  add column if not exists ocorrencia       int not null default 1;         -- n.º da repetição no mesmo dia (A4)

create index if not exists bank_mov_categoria_idx on public.bank_movements(categoria);
create index if not exists bank_mov_interna_idx   on public.bank_movements(interna);

-- ─────────────────────────────────────────────────────────────────────────────
-- B) Motor de regras de categorização (gerível na UI). Distinto de
--    bank_ignore_rules (que trata da fila de conciliação de recebimentos):
--    estas atribuem CATEGORIA/RUBRICA de cashflow a qualquer movimento.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bank_category_rules (
  id uuid primary key default gen_random_uuid(),
  ordem int not null default 0,                 -- 1.ª regra que bate ganha
  ativo boolean not null default true,
  campo text not null default 'descritivo'
    check (campo in ('descritivo','observacoes','ambos')),
  operador text not null default 'contem'
    check (operador in ('contem','regex','igual','comeca')),
  sentido text check (sentido in ('credito','debito')), -- opcional: só aplica a este sentido
  padrao text not null,
  categoria text not null,
  rubrica text,                                 -- opcional; templates: $1..$9 (captura regex),
                                                -- $0 (campo todo), $OBS / $OBS1, $DESC1
  marcar_interna boolean not null default false,-- marca o movimento como transferência interna
  nota text,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists bank_cat_rules_ordem_idx on public.bank_category_rules(ordem) where ativo;

alter table public.bank_category_rules enable row level security;
drop policy if exists bank_category_rules_acesso on public.bank_category_rules;
create policy bank_category_rules_acesso on public.bank_category_rules
  for all to authenticated
  using (public.has_financeiro_access()) with check (public.has_financeiro_access());
grant select, insert, update, delete on public.bank_category_rules to authenticated;
grant all on public.bank_category_rules to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) Seeds do cashflow entram "por confirmar" (revisão manual na UI)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.cashflow_recurring_expenses
  add column if not exists por_confirmar boolean not null default false;
alter table public.cashflow_payment_plans
  add column if not exists por_confirmar boolean not null default false;
