-- Reutilização de FOs por S/N: RPC de cópia + triggers de histórico, bloqueio
-- e bloqueio automático ao expedir a NE.

create or replace function public.copiar_folha_obra(p_origem uuid, p_nota uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_novo uuid;
begin
  insert into public.folhas_obra (
    data_intervencao, cliente_id, cliente_nome, cliente_pais, tecnico_id, tecnico_nome,
    tipo_servico, equipamento_id, equipamento_modelo, equipamento_sn, equipamento_ano,
    codigos_erro, problema_observado, trabalho_realizado,
    valor_cabeca_alex, valor_transmissao_alex, valor_cabeca_yag, valor_transmissao_yag,
    material_utilizado, observacoes, estado, nota_encomenda_id, fo_origem_id, criado_por)
  select current_date, cliente_id, cliente_nome, cliente_pais, tecnico_id, tecnico_nome,
    tipo_servico, equipamento_id, equipamento_modelo, equipamento_sn, equipamento_ano,
    codigos_erro, problema_observado, trabalho_realizado,
    valor_cabeca_alex, valor_transmissao_alex, valor_cabeca_yag, valor_transmissao_yag,
    material_utilizado, observacoes, 'rascunho', p_nota, p_origem, auth.uid()
  from public.folhas_obra where id = p_origem
  returning id into v_novo;
  insert into public.folha_obra_materiais (folha_id, peca_id, descricao, quantidade)
    select v_novo, peca_id, descricao, quantidade from public.folha_obra_materiais where folha_id = p_origem;
  return v_novo;
end $$;
revoke execute on function public.copiar_folha_obra(uuid,uuid) from public, anon;
grant   execute on function public.copiar_folha_obra(uuid,uuid) to authenticated;

create or replace function public.fo_registar_historico() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v uuid := auth.uid();
begin
  if new.tipo_servico       is distinct from old.tipo_servico       then insert into folha_obra_historico(folha_id,campo,valor_antigo,valor_novo,por_id) values(new.id,'tipo_servico',old.tipo_servico,new.tipo_servico,v); end if;
  if new.problema_observado is distinct from old.problema_observado then insert into folha_obra_historico(folha_id,campo,valor_antigo,valor_novo,por_id) values(new.id,'problema_observado',old.problema_observado,new.problema_observado,v); end if;
  if new.trabalho_realizado is distinct from old.trabalho_realizado then insert into folha_obra_historico(folha_id,campo,valor_antigo,valor_novo,por_id) values(new.id,'trabalho_realizado',old.trabalho_realizado,new.trabalho_realizado,v); end if;
  if new.codigos_erro       is distinct from old.codigos_erro       then insert into folha_obra_historico(folha_id,campo,valor_antigo,valor_novo,por_id) values(new.id,'codigos_erro',old.codigos_erro,new.codigos_erro,v); end if;
  if new.material_utilizado is distinct from old.material_utilizado then insert into folha_obra_historico(folha_id,campo,valor_antigo,valor_novo,por_id) values(new.id,'material_utilizado',old.material_utilizado,new.material_utilizado,v); end if;
  if new.observacoes        is distinct from old.observacoes        then insert into folha_obra_historico(folha_id,campo,valor_antigo,valor_novo,por_id) values(new.id,'observacoes',old.observacoes,new.observacoes,v); end if;
  if new.estado             is distinct from old.estado             then insert into folha_obra_historico(folha_id,campo,valor_antigo,valor_novo,por_id) values(new.id,'estado',old.estado,new.estado,v); end if;
  return new;
end $$;
drop trigger if exists trg_fo_historico on public.folhas_obra;
create trigger trg_fo_historico after update on public.folhas_obra for each row execute function public.fo_registar_historico();

create or replace function public.fo_guarda_bloqueio() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if old.bloqueada then
    if new.bloqueada = false and public.is_admin() then return new; end if;
    raise exception 'Folha de obra bloqueada (encomenda expedida). Só um admin pode desbloquear.';
  end if;
  return new;
end $$;
drop trigger if exists trg_fo_guarda_bloqueio on public.folhas_obra;
create trigger trg_fo_guarda_bloqueio before update on public.folhas_obra for each row execute function public.fo_guarda_bloqueio();

create or replace function public.ne_bloquear_folhas() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.estado = 'expedida' and old.estado is distinct from 'expedida' then
    update public.folhas_obra set bloqueada = true, bloqueada_em = now()
      where nota_encomenda_id = new.id and not bloqueada;
  end if;
  return new;
end $$;
drop trigger if exists trg_ne_bloquear_folhas on public.notas_encomenda;
create trigger trg_ne_bloquear_folhas after update on public.notas_encomenda for each row execute function public.ne_bloquear_folhas();
