-- Assinatura pública do cliente sem service role: funções SECURITY DEFINER
-- com acesso mínimo, validadas pelo token. O anon só pode executar estas duas.

-- Devolve um subset seguro da folha a partir do token
create or replace function public.folha_por_token(p_token uuid)
returns json
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select json_build_object(
    'numero', numero,
    'data_intervencao', data_intervencao,
    'tipo_servico', tipo_servico,
    'tecnico_nome', tecnico_nome,
    'cliente_nome', cliente_nome,
    'equipamento_modelo', equipamento_modelo,
    'equipamento_sn', equipamento_sn,
    'trabalho_realizado', trabalho_realizado,
    'estado', estado,
    'assinatura_cliente_at', assinatura_cliente_at
  )
  from public.folhas_obra
  where token_assinatura_cliente = p_token;
$$;

-- Grava a assinatura do cliente (data URL PNG) na folha do token
create or replace function public.assinar_folha_cliente(p_token uuid, p_assinatura text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if p_assinatura is null
     or length(p_assinatura) > 3000000
     or p_assinatura not like 'data:image/png;base64,%' then
    return false;
  end if;
  update public.folhas_obra
     set assinatura_cliente_url = p_assinatura,
         assinatura_cliente_at  = now()
   where token_assinatura_cliente = p_token
   returning id into v_id;
  return v_id is not null;
end;
$$;

-- Permissões: só estas duas funções ficam acessíveis ao anon
revoke all on function public.folha_por_token(uuid) from public;
revoke all on function public.assinar_folha_cliente(uuid, text) from public;
grant execute on function public.folha_por_token(uuid) to anon, authenticated;
grant execute on function public.assinar_folha_cliente(uuid, text) to anon, authenticated;
