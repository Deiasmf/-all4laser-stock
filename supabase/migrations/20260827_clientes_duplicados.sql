-- ─────────────────────────────────────────────────────────────────────────────
-- CLIENTES — remover unicidade frágil do nome + deteção de duplicados na app
-- ─────────────────────────────────────────────────────────────────────────────
-- Problema: UNIQUE(nome) (case-sensitive) rebentava ao criar um cliente com nome
-- já existente, com erro cru do Postgres, sem tratar o caso.
-- Decisão: a proteção contra duplicados passa a ser feita na APLICAÇÃO (deteção
-- em tempo real por nome/NIF/email). Não se adiciona unicidade dura ao NIF porque
-- os dados têm placeholders repetidos para clientes estrangeiros (ex.: 'IRQ01').

-- 1) Remover a constraint única do nome (mantém-se o índice não-único lower(nome)).
alter table public.clientes drop constraint if exists clientes_nome_key;

-- 2) Helpers de normalização (imutáveis → podem indexar-se no futuro).
--    norm_txt: minúsculas, sem acentos comuns (PT/ES/FR), espaços/pontuação colapsados.
create or replace function public.norm_txt(t text)
returns text language sql immutable
as $$
  select nullif(trim(regexp_replace(
    translate(lower(coalesce(t,'')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g')), '')
$$;

--    norm_nif: só alfanuméricos, maiúsculas (compara '123 456 789' = '123456789').
create or replace function public.norm_nif(t text)
returns text language sql immutable
as $$
  select nullif(upper(regexp_replace(coalesce(t,''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

-- 3) Deteção de clientes semelhantes (usada em tempo real nos formulários).
--    Devolve candidatos por NIF, nome (normalizado) e email, com o motivo de cada.
create or replace function public.clientes_semelhantes(
  p_nome text default null,
  p_nif  text default null,
  p_email text default null
)
returns table (
  id uuid, nome text, nif text, email text, cidade text, pais text,
  por_nif boolean, por_nome boolean, por_email boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select c.id, c.nome, c.nif, c.email, c.cidade, c.pais,
    (public.norm_nif(p_nif)  is not null and public.norm_nif(c.nif)  = public.norm_nif(p_nif))  as por_nif,
    (public.norm_txt(p_nome) is not null and public.norm_txt(c.nome) = public.norm_txt(p_nome)) as por_nome,
    (nullif(lower(trim(p_email)),'') is not null and lower(trim(c.email)) = lower(trim(p_email))) as por_email
  from public.clientes c
  where public.is_staff()
    and (
         (public.norm_nif(p_nif)  is not null and public.norm_nif(c.nif)  = public.norm_nif(p_nif))
      or (public.norm_txt(p_nome) is not null and public.norm_txt(c.nome) = public.norm_txt(p_nome))
      or (nullif(lower(trim(p_email)),'') is not null and lower(trim(c.email)) = lower(trim(p_email)))
    )
  order by por_nif desc, por_email desc, c.nome
  limit 20;
$$;
revoke all on function public.clientes_semelhantes(text,text,text) from public, anon;
grant execute on function public.clientes_semelhantes(text,text,text) to authenticated;

-- 4) FUSÃO de clientes (PREPARADA — NÃO corre automaticamente; só chamada à mão,
--    caso a caso). Re-associa as 17 tabelas com FK cliente_id do cliente removido
--    para o cliente que fica, atualiza equipamentos.destino (texto = nome) e apaga
--    o removido. Devolve um resumo. Só admin (Andreia) pode executar.
create or replace function public.fundir_clientes(p_manter uuid, p_remover uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_nome_remover text;
  v_nome_manter  text;
  v_res jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem fundir clientes.';
  end if;
  if p_manter = p_remover then raise exception 'Cliente a manter e a remover são o mesmo.'; end if;

  select nome into v_nome_manter  from public.clientes where id = p_manter;
  select nome into v_nome_remover from public.clientes where id = p_remover;
  if v_nome_manter is null or v_nome_remover is null then
    raise exception 'Cliente(s) não encontrado(s).';
  end if;

  update public.alugueres                        set cliente_id = p_manter where cliente_id = p_remover;
  update public.notas_encomenda                  set cliente_id = p_manter where cliente_id = p_remover;
  update public.folhas_obra                      set cliente_id = p_manter where cliente_id = p_remover;
  update public.reservas                         set cliente_id = p_manter where cliente_id = p_remover;
  update public.envios_pecas                     set cliente_id = p_manter where cliente_id = p_remover;
  update public.expeditions                      set cliente_id = p_manter where cliente_id = p_remover;
  update public.shipments_tracking               set cliente_id = p_manter where cliente_id = p_remover;
  update public.reparacao_pecas                  set cliente_id = p_manter where cliente_id = p_remover;
  update public.rececoes_pecas                   set cliente_id = p_manter where cliente_id = p_remover;
  update public.processos_pecas                  set cliente_id = p_manter where cliente_id = p_remover;
  update public.registos_cliente                 set cliente_id = p_manter where cliente_id = p_remover;
  update public.financeiro_cobrancas             set cliente_id = p_manter where cliente_id = p_remover;
  update public.financeiro_movimentos            set cliente_id = p_manter where cliente_id = p_remover;
  update public.financeiro_recolhas_equipamento  set cliente_id = p_manter where cliente_id = p_remover;
  update public.client_inactivity_followup       set cliente_id = p_manter where cliente_id = p_remover;
  update public.cliente_moradas_entrega          set cliente_id = p_manter where cliente_id = p_remover;
  update public.clientes_portal                  set cliente_id = p_manter where cliente_id = p_remover;

  -- equipamentos.destino guarda o NOME do cliente (texto), não uma FK.
  update public.equipamentos set destino = v_nome_manter where destino = v_nome_remover;

  delete from public.clientes where id = p_remover;

  v_res := jsonb_build_object('manter', p_manter, 'removido', p_remover,
                              'nome_manter', v_nome_manter, 'nome_removido', v_nome_remover);
  return v_res;
end;
$$;
revoke all on function public.fundir_clientes(uuid, uuid) from public, anon;
grant execute on function public.fundir_clientes(uuid, uuid) to authenticated;
