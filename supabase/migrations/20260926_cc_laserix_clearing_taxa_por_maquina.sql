-- ───────────────────────────────────────────────────────────────────────────
-- CONTAS CORRENTES — taxa por máquina + clearing (consignação Laserix)
-- A taxa de câmbio do custo é acordada POR MÁQUINA (batch/unidade), não à conta:
-- guarda-se na consignação (p/ mostrar o custo em AED e servir de default na
-- venda) e na venda. O clearing (desalfandegamento) por venda reduz a margem.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.cc_consignacoes add column if not exists taxa_cambio_custo numeric(12,6);
comment on column public.cc_consignacoes.taxa_cambio_custo is
  'Taxa acordada (unidades da moeda por 1 EUR) desta máquina; custo AED = custo_declarado(EUR) x taxa. Default da venda.';

alter table public.cc_vendas add column if not exists clearing numeric(14,2) not null default 0;
comment on column public.cc_vendas.clearing is
  'Custo de desalfandegamento (na moeda_venda); a margem é preco - custo_convertido - clearing.';

-- Trigger de cálculo: margem desconta o clearing; a taxa cai para a manual,
-- senão a da consignação, senão a contratual da conta (na data).
create or replace function public.cc_vendas_calcular()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_custo numeric;
  v_pct   numeric;
  v_taxa  numeric;
  v_taxa_cons numeric;
  v_conta public.cc_contas%rowtype;
  v_conta_id uuid;
begin
  select custo_declarado, conta_id, taxa_cambio_custo
    into v_custo, v_conta_id, v_taxa_cons
    from public.cc_consignacoes where id = new.consignacao_id;
  if v_custo is null then
    raise exception 'Consignação % não encontrada ou sem custo declarado', new.consignacao_id;
  end if;
  select * into v_conta from public.cc_contas where id = v_conta_id;
  v_pct := coalesce(v_conta.partilha_margem_pct, 50);

  v_taxa := coalesce(new.taxa_cambio_custo, v_taxa_cons);
  if v_taxa is null and v_conta.taxa_contratual is not null
     and new.data_venda >= coalesce(v_conta.taxa_contratual_inicio, new.data_venda)
     and new.data_venda <= coalesce(v_conta.taxa_contratual_fim, new.data_venda) then
    v_taxa := v_conta.taxa_contratual;
  end if;
  if v_taxa is null then
    raise exception 'Taxa de câmbio do custo obrigatória: a máquina/conta não tem taxa aplicável em %', new.data_venda;
  end if;

  new.taxa_cambio_custo := v_taxa;
  new.custo_convertido  := round(v_custo * v_taxa, 2);
  new.margem            := round(new.preco_venda - new.custo_convertido - coalesce(new.clearing, 0), 2);
  new.valor_devido      := round(new.custo_convertido + new.margem * v_pct / 100, 2);
  new.margem_negativa   := (new.margem < 0);
  return new;
end;
$$;

-- Laserix: a taxa é por máquina, não à conta → limpar a taxa contratual da conta.
-- (No-op numa BD sem esta conta.)
update public.cc_contas set taxa_contratual = null where nome = 'Laserix (Dubai)';
