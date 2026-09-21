-- Leads: motor do follow-up automático (Fase 1 — RPCs). Aplicada via apply_migration.
-- lead_sync_followup: cria/atualiza/reatribui/conclui/reabre a tarefa de follow-up de uma lead.
-- lead_mudar_estado: muda estado (individual ou massa), regista histórico e chama o sync.
-- lead_set_responsavel: (re)atribui o responsável, mantendo a tarefa colada ao dono.

create or replace function public.lead_sync_followup(p_lead_id uuid, p_ator uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.leads%rowtype; v_task uuid; v_resp uuid; v_et uuid;
        v_dias int; v_prazo date; v_titulo text; v_concl text;
begin
  select * into v from public.leads where id = p_lead_id;
  if not found then return; end if;
  select id into v_task from public.user_tasks where lead_id = p_lead_id and tipo='lead_followup';

  if v.estado in ('contactada','proposta_enviada') then
    v_resp := v.responsavel_id;
    if v_resp is null then
      raise exception 'A lead "%" nao tem responsavel — atribui antes de mudar de estado.', v.nome;
    end if;
    v_dias := case v.estado when 'contactada'
                then (select dias_uteis_contactada from public.leads_followup_config where id=1)
                else (select dias_uteis_proposta   from public.leads_followup_config where id=1) end;
    v_prazo := public.mais_dias_uteis(current_date, v_dias);
    v_titulo := 'Follow-up — ' || coalesce(nullif(trim(v.nome),''),'lead');

    if v_task is null then
      insert into public.user_tasks(titulo, descricao, prioridade, data_limite, lead_id, tipo, created_by)
      values (v_titulo, 'Follow-up automatico da lead (estado: '||v.estado||').', 'normal', v_prazo,
              p_lead_id, 'lead_followup', p_ator)
      returning id into v_task;
      insert into public.user_task_assignees(task_id, user_id) values (v_task, v_resp);
      select id into v_et from public.task_etiquetas where lower(nome)=lower('Leads/Follow-up') and ativo limit 1;
      if v_et is not null then
        insert into public.user_task_etiquetas(task_id, etiqueta_id) values (v_task, v_et) on conflict do nothing;
      end if;
      insert into public.user_task_history(task_id, ator_id, tipo, descricao)
      values (v_task, p_ator, 'criacao', 'Follow-up criado (lead '||v.estado||').');
    else
      update public.user_tasks set titulo=v_titulo, data_limite=v_prazo, updated_at=now() where id=v_task;
      update public.user_task_assignees set user_id=v_resp
        where task_id=v_task and user_id is distinct from v_resp;
      update public.user_task_assignees
        set estado='pendente', concluida_em=null, arquivada_em=null
        where task_id=v_task
          and (estado in (select slug from public.task_estados where is_concluido) or arquivada_em is not null);
    end if;

  elsif v.estado in ('convertida','perdida') and v_task is not null then
    select slug into v_concl from public.task_estados where is_concluido order by ordem limit 1;
    update public.user_task_assignees set estado=coalesce(v_concl,'concluida'), concluida_em=now() where task_id=v_task;
    update public.user_tasks set updated_at=now() where id=v_task;
    insert into public.user_task_history(task_id, ator_id, tipo, descricao)
    values (v_task, p_ator, 'estado', 'Concluida automaticamente: lead '||
            (case v.estado when 'convertida' then 'ganha' else 'perdida' end)||' em '||to_char(now(),'YYYY-MM-DD')||'.');
  end if;
end $$;

create or replace function public.lead_mudar_estado(p_lead_ids uuid[], p_estado text, p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_ator uuid := auth.uid(); v_nome text; v_id uuid; v_old text; v_n int := 0;
begin
  if not public.is_staff() then raise exception 'Sem permissao.'; end if;
  if p_estado not in ('nova','contactada','proposta_enviada','convertida','perdida')
    then raise exception 'Estado invalido: %', p_estado; end if;
  if p_estado='perdida' and coalesce(trim(p_motivo),'')='' then raise exception 'Marcar como Perdida exige um motivo.'; end if;
  select nome into v_nome from public.profiles where id=v_ator;
  foreach v_id in array p_lead_ids loop
    select estado into v_old from public.leads where id=v_id;
    if v_old is null then continue; end if;
    if v_old is distinct from p_estado then
      update public.leads set estado=p_estado,
             motivo_perdida = case when p_estado='perdida' then p_motivo else motivo_perdida end,
             estado_desde=now(), updated_at=now() where id=v_id;
      insert into public.lead_status_history(lead_id, estado_anterior, estado_novo, ator_id, ator_nome)
      values (v_id, v_old, p_estado, v_ator, v_nome);
      v_n := v_n + 1;
    end if;
    perform public.lead_sync_followup(v_id, v_ator);
  end loop;
  return v_n;
end $$;

create or replace function public.lead_set_responsavel(p_lead_id uuid, p_resp uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissao.'; end if;
  update public.leads set responsavel_id=p_resp, updated_at=now() where id=p_lead_id;
  perform public.lead_sync_followup(p_lead_id, auth.uid());
end $$;
