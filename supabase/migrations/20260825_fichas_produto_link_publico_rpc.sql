-- RPC público da ficha de produto: a página /p/[token] chama isto (anon).
-- SECURITY DEFINER: devolve só os campos escolhidos e conta a visualização,
-- sem abrir a RLS das tabelas ao público. Respeita revogado / validade.
create or replace function public.ficha_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link  public.ficha_links;
  v_eq    public.equipamentos;
  v_prod  public.equipamento_produto;
  v_disp  text;
  v_serial text;
begin
  select * into v_link from public.ficha_links
    where token = p_token and revogado = false and expira_em > now();
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  update public.ficha_links set views = views + 1, ultima_view = now() where id = v_link.id;

  select * into v_eq from public.equipamentos where id = v_link.equipamento_id;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_prod from public.equipamento_produto where equipamento_id = v_eq.id;

  v_disp := coalesce(v_prod.disponibilidade, 'disponivel');
  v_serial := case when v_link.incluir_sn_completo then v_eq.serial_number
                   else '••••' || right(coalesce(v_eq.serial_number, ''), 4) end;

  return jsonb_build_object(
    'ok', true,
    'idioma', v_link.idioma,
    'disponivel', (v_disp = 'disponivel'),
    'marca', v_eq.marca,
    'modelo', v_eq.modelo,
    'ano', v_eq.ano,
    'serial', v_serial,
    'condicao', v_prod.condicao,
    'condicao_descricao', v_prod.condicao_descricao,
    'voltagem', v_prod.voltagem,
    'frequencia', v_prod.frequencia,
    'dimensoes', v_prod.dimensoes,
    'peso_kg', v_prod.peso_kg,
    'software_versao', v_prod.software_versao,
    'preco', case when v_link.incluir_preco then v_eq.preco_venda else null end,
    'handpieces', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'contador_pulsos', contador_pulsos, 'data_leitura', data_leitura) order by ordem, created_at)
      from public.equipamento_handpieces where equipamento_id = v_eq.id), '[]'::jsonb),
    'acessorios', coalesce((
      select jsonb_agg(descricao order by ordem, created_at)
      from public.equipamento_acessorios where equipamento_id = v_eq.id), '[]'::jsonb),
    'fotos', coalesce((
      select jsonb_agg(url order by capa desc, ordem, created_at)
      from public.media where equipamento_id = v_eq.id and (tipo is null or tipo = 'foto')), '[]'::jsonb)
  );
end $$;

revoke all on function public.ficha_publica(text) from public;
grant execute on function public.ficha_publica(text) to anon, authenticated;
