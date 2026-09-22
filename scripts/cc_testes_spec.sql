-- ═══════════════════════════════════════════════════════════════════════════
-- Testes formais das funções SQL do módulo Contas Correntes (cc_*).
-- Reproduz os exemplos da spec e as regras de família. Corre tudo numa
-- transação com ROLLBACK — não deixa dados nenhuns.
--
-- Como correr (psql ou MCP Supabase execute_sql): colar este ficheiro inteiro.
-- Se algum ASSERT falhar, a transação aborta com a mensagem do erro; se tudo
-- passar, devolve a linha 'TODOS OS TESTES PASSARAM'.
--
-- Substituir <ADMIN_UUID> pelo id de um perfil admin/staff (a função de custo
-- sugerido tem guarda is_staff()). Em produção corre com a sessão do próprio.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Simula a sessão de um utilizador staff (para a guarda is_staff()).
select set_config('request.jwt.claims', '{"sub":"0fb4c6d4-61a7-4d27-8a68-8fb5d51588dd"}', true);

do $$
declare
  v_eq_gm   uuid;
  v_eq_el   uuid;
  v_conta   uuid;
  v_cons    uuid;
  v_venda   uuid;
  r         record;
  m         record;
begin
  -- ── Regra de família: Candela GentleMax Pro → valor_compra + 4 000 € ───────
  insert into public.equipamentos(id, modelo, valor_compra)
    values (gen_random_uuid(), 'GentleMax Pro (teste)', 30000) returning id into v_eq_gm;
  assert public.cc_custo_declarado_sugerido(v_eq_gm, 1) = 34000,
    'Regra GentleMax falhou (esperado 34000)';

  -- ── Regra: Cynosure Elite+ com Zimmer → custo + 2 500 € + 1 500 €/conjunto ─
  insert into public.equipamentos(id, modelo, valor_compra)
    values (gen_random_uuid(), 'Cynosure Elite (teste)', 10000) returning id into v_eq_el;
  assert public.cc_custo_declarado_sugerido(v_eq_el, 1) = 14000,
    'Regra Elite (1 conjunto) falhou (esperado 14000)';
  assert public.cc_custo_declarado_sugerido(v_eq_el, 2) = 15500,
    'Regra Elite (2 conjuntos) falhou (esperado 15500)';

  -- ── Conta de consignação (Laserix): AED, partilha 50%, taxa contratual 4.40 ─
  insert into public.cc_contas(nome, tipo, moeda, partilha_margem_pct, taxa_contratual)
    values ('__teste_spec__', 'consignacao', 'AED', 50, 4.40) returning id into v_conta;

  -- ── EXEMPLO 1 — Candela 2018 vendida a 235 000 AED (custo declarado 20 000 €) ─
  insert into public.cc_consignacoes(conta_id, custo_declarado, moeda_custo, estado)
    values (v_conta, 20000, 'EUR', 'em_stock') returning id into v_cons;
  insert into public.cc_vendas(consignacao_id, data_venda, preco_venda, moeda_venda, estado)
    values (v_cons, '2026-09-22', 235000, 'AED', 'registada') returning id into v_venda;

  select custo_convertido, margem, valor_devido, margem_negativa
    into r from public.cc_vendas where id = v_venda;
  assert r.custo_convertido = 88000,  format('Candela custo_convertido=%s (esperado 88000)', r.custo_convertido);
  assert r.margem           = 147000, format('Candela margem=%s (esperado 147000)', r.margem);
  assert r.valor_devido     = 161500, format('Candela valor_devido=%s (esperado 161500)', r.valor_devido);
  assert r.margem_negativa  = false,  'Candela margem_negativa deveria ser false';

  -- confirmar → cria movimento esperado e marca a consignação vendida
  update public.cc_vendas set estado = 'confirmada' where id = v_venda;
  select tipo, valor, moeda, valor_eur into m
    from public.cc_movimentos where origem_tipo = 'venda' and origem_id = v_venda;
  assert m.tipo = 'esperado' and m.valor = 161500 and m.moeda = 'AED',
    format('Candela movimento errado: %s %s %s', m.tipo, m.valor, m.moeda);
  assert m.valor_eur = 36704.55, format('Candela valor_eur=%s (esperado 36704.55)', m.valor_eur);
  assert (select estado from public.cc_consignacoes where id = v_cons) = 'vendido',
    'Candela: consignação deveria ficar vendida';

  -- ── EXEMPLO 2 — Cynosure Elite+ com Zimmer a 145 000 AED (custo 14 000 €) ───
  insert into public.cc_consignacoes(conta_id, custo_declarado, moeda_custo, estado)
    values (v_conta, 14000, 'EUR', 'em_stock') returning id into v_cons;
  insert into public.cc_vendas(consignacao_id, data_venda, preco_venda, moeda_venda, estado)
    values (v_cons, '2026-09-22', 145000, 'AED', 'registada') returning id into v_venda;

  select custo_convertido, margem, valor_devido into r
    from public.cc_vendas where id = v_venda;
  assert r.custo_convertido = 61600,  format('Cynosure custo_convertido=%s (esperado 61600)', r.custo_convertido);
  assert r.margem           = 83400,  format('Cynosure margem=%s (esperado 83400)', r.margem);
  assert r.valor_devido     = 103300, format('Cynosure valor_devido=%s (esperado 103300)', r.valor_devido);

  update public.cc_vendas set estado = 'confirmada' where id = v_venda;
  select valor, valor_eur into m
    from public.cc_movimentos where origem_tipo = 'venda' and origem_id = v_venda;
  assert m.valor = 103300 and m.valor_eur = 23477.27,
    format('Cynosure movimento: valor=%s valor_eur=%s (esperado 103300 / 23477.27)', m.valor, m.valor_eur);

  -- ── Saldo da conta = soma dos dois valores devidos (161500 + 103300) ───────
  assert (select saldo_moeda from public.v_cc_saldo_conta where conta_id = v_conta) = 264800,
    'Saldo da conta deveria ser 264800 AED';
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;

rollback;
