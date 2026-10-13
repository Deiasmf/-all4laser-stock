-- Pedidos de Fatura — ciclo Proforma → Fatura final no MESMO pedido (sub-pedidos).
-- Aditivo e idempotente. NÃO altera o fluxo direto de "fatura".
--
-- Um pedido de PROFORMA passa a ter duas etapas no mesmo pedido:
--   nao_realizado → a_realizar → realizado (proforma emitida) → aguarda_pagamento
--   → fatura_pedida → fatura_realizada → fechado   (+ recusado/cancelado)
-- O documento FISCAL (fatura) vive sempre nas colunas canónicas
-- (documento_*/num_fatura/data_fatura/valor_total) para a conta corrente, o email
-- e a reconciliação Keyinvoice continuarem a funcionar sem alterações; a PROFORMA
-- tem colunas próprias (proforma_*), para os dois documentos coexistirem.

-- 1) ESTADOS: + etapa 2 (proforma) e "cancelado"
alter table public.pedidos_fatura drop constraint if exists pedidos_fatura_estado_check;
alter table public.pedidos_fatura add constraint pedidos_fatura_estado_check
  check (estado in (
    'nao_realizado','a_realizar','realizado','enviado_cliente',       -- fluxo direto
    'aguarda_pagamento','fatura_pedida','fatura_realizada','fechado',  -- 2ª etapa (proforma)
    'recusado','cancelado'
  ));

-- 2) DOCUMENTO DA PROFORMA (1ª etapa) — separado do fiscal
alter table public.pedidos_fatura
  add column if not exists proforma_url        text,
  add column if not exists proforma_caminho    text,
  add column if not exists proforma_num        text,
  add column if not exists proforma_data       date,
  add column if not exists proforma_valor      numeric(12,2),
  add column if not exists proforma_enviada_em timestamptz;

-- 3) TIMESTAMPS por etapa + nota de ajuste da fatura final
alter table public.pedidos_fatura
  add column if not exists pagamento_recebido_em timestamptz,
  add column if not exists fatura_pedida_em      timestamptz,
  add column if not exists fechado_em            timestamptz,
  add column if not exists fatura_ajuste_nota    text;

-- 4) CONFIG: lembrete opcional ao criador enquanto aguarda pagamento
alter table public.pedidos_fatura_config
  add column if not exists aguarda_pagamento_lembrete_ativo boolean not null default true,
  add column if not exists aguarda_pagamento_lembrete_dias  int     not null default 15
    check (aguarda_pagamento_lembrete_dias between 1 and 365);

-- 5) ÍNDICE p/ secção "aguarda pagamento" e filtros por etapa
create index if not exists idx_pedidos_fatura_tipo_estado
  on public.pedidos_fatura(tipo, estado);

-- 6) MIGRAÇÃO DO MODELO: pró-formas existentes → colunas proforma_*,
--    libertando as canónicas para a futura fatura final. Idempotente.
update public.pedidos_fatura
set proforma_url        = documento_url,
    proforma_caminho    = documento_caminho,
    proforma_num        = num_fatura,
    proforma_data       = data_fatura,
    proforma_valor      = coalesce(valor_total, valor),
    proforma_enviada_em = enviado_em,
    documento_url = null, documento_caminho = null,
    num_fatura = null, data_fatura = null, valor_total = null
where tipo = 'pro_forma'
  and proforma_url is null and proforma_caminho is null
  and (documento_url is not null or num_fatura is not null);

-- 7) FUSÃO MANUAL de uma pró-forma + fatura criadas em separado.
--    Junta a fatura (final) dentro do pedido da pró-forma e apaga o da fatura.
--    Usar só quando confirmado à mão (ex.: via RPC a partir de um ecrã de admin).
create or replace function public.fundir_pedido_proforma_fatura(
  p_proforma_id uuid, p_fatura_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare f record;
begin
  if not public.has_financeiro_access() then
    raise exception 'Sem permissão (financeiro).';
  end if;
  select * into f from public.pedidos_fatura where id = p_fatura_id and tipo = 'fatura';
  if not found then raise exception 'Fatura não encontrada.'; end if;
  update public.pedidos_fatura p set
    documento_url = f.documento_url, documento_caminho = f.documento_caminho,
    num_fatura = f.num_fatura, data_fatura = f.data_fatura, valor_total = f.valor_total,
    financeiro_movimento_id = coalesce(p.financeiro_movimento_id, f.financeiro_movimento_id),
    enviado_em  = coalesce(f.enviado_em, p.enviado_em),
    fechado_em  = coalesce(f.enviado_em, now()),
    estado = case when f.estado = 'enviado_cliente' then 'fechado' else 'fatura_realizada' end
  where p.id = p_proforma_id and p.tipo = 'pro_forma';
  delete from public.pedidos_fatura where id = p_fatura_id;
end $$;

revoke all on function public.fundir_pedido_proforma_fatura(uuid, uuid) from public;
grant execute on function public.fundir_pedido_proforma_fatura(uuid, uuid) to authenticated;
