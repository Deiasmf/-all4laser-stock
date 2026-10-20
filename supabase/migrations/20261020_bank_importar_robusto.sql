-- FIX: importação de extrato abortava com "duplicate key uq_bank_mov_hash".
-- Causa: (1) insert simples abortava na 1.ª colisão; (2) o pré-check de duplicados
-- usava .in('hash', …) que se parte quando o hash tem vírgulas (descritivos como
-- "MARIANA & CINTRA, LDA") ou §, devolvendo tudo como "novo" → colisão no insert.
-- NOTA: o hash já inclui a ocorrência (§#N, feito antes) e todos os registos em BD
-- já estão nesse formato — por isso NÃO é preciso migrar hashes antigos.

-- 1) Importação ATÓMICA e TOLERANTE (ON CONFLICT (hash) DO NOTHING). Uma transação.
create or replace function public.bank_importar(
  p_ficheiro text, p_autor uuid, p_autor_nome text, p_movimentos jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_conta uuid; v_lote uuid; v_nome text;
  v_total int; v_ini date; v_fim date; v_novos int; v_ign int; v_pc int;
  v_rep jsonb := '[]'::jsonb;
begin
  if not public.has_financeiro_access() then raise exception 'Sem acesso ao financeiro'; end if;
  if p_movimentos is null or jsonb_typeof(p_movimentos) <> 'array' then
    raise exception 'Sem movimentos para importar';
  end if;

  for v_conta in
    select distinct (m->>'conta_id')::uuid from jsonb_array_elements(p_movimentos) m where m->>'conta_id' is not null
  loop
    select count(*), min((m->>'data')::date), max((m->>'data')::date)
      into v_total, v_ini, v_fim
      from jsonb_array_elements(p_movimentos) m where (m->>'conta_id')::uuid = v_conta;
    select nome into v_nome from bank_accounts where id = v_conta;

    insert into bank_import_lotes(conta_id, ficheiro_nome, periodo_inicio, periodo_fim,
        total_linhas, novos, repetidos, criado_por, criado_por_nome)
      values (v_conta, p_ficheiro, v_ini, v_fim, v_total, 0, 0, p_autor, p_autor_nome)
      returning id into v_lote;

    with ins as (
      insert into bank_movements(conta_id, import_lote_id, data, data_valor, descritivo, valor,
        sentido, saldo, referencia, observacoes, flag_fr, ocorrencia, interna, categoria, rubrica,
        categoria_origem, estado, ignorar_categoria, hash, criado_por, criado_por_nome)
      select v_conta, v_lote, (m->>'data')::date, nullif(m->>'data_valor','')::date, m->>'descritivo',
        (m->>'valor')::numeric, m->>'sentido', nullif(m->>'saldo','')::numeric, nullif(m->>'referencia',''),
        nullif(m->>'observacoes',''), nullif(m->>'flag_fr',''), coalesce((m->>'ocorrencia')::int,1),
        coalesce((m->>'interna')::boolean,false), nullif(m->>'categoria',''), nullif(m->>'rubrica',''),
        nullif(m->>'categoria_origem',''), coalesce(nullif(m->>'estado',''),'por_conciliar'),
        nullif(m->>'ignorar_categoria',''), m->>'hash', p_autor, p_autor_nome
      from jsonb_array_elements(p_movimentos) m
      where (m->>'conta_id')::uuid = v_conta and m->>'hash' is not null
      on conflict (hash) do nothing
      returning estado
    )
    select count(*), count(*) filter (where estado='ignorado'), count(*) filter (where estado='por_conciliar')
      into v_novos, v_ign, v_pc from ins;

    update bank_import_lotes set novos=v_novos, repetidos=v_total-v_novos where id=v_lote;
    if v_novos = 0 then delete from bank_import_lotes where id=v_lote; end if;

    v_rep := v_rep || jsonb_build_object('conta_id', v_conta, 'conta_nome', coalesce(v_nome,''),
      'novos', v_novos, 'repetidos', v_total - v_novos, 'ignorados', v_ign, 'porConciliar', v_pc);
  end loop;
  return v_rep;
end $$;
grant execute on function public.bank_importar(text, uuid, text, jsonb) to authenticated;

-- 2) Pré-check de duplicados robusto (text[] em vez de filtro .in).
create or replace function public.bank_hashes_existentes(p_hashes text[])
returns table(hash text)
language sql security definer set search_path to 'public'
as $$ select b.hash from bank_movements b where b.hash = any(p_hashes); $$;
grant execute on function public.bank_hashes_existentes(text[]) to authenticated;
