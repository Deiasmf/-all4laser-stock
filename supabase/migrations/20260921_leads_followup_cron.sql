-- Leads follow-up (Fase 3): modo "não rebentar" na sync + função do cron diário.
-- Aplicada via apply_migration.

-- lead_sync_followup: acrescenta p_raise (default true). O cron chama com false
-- para SALTAR leads ativas sem responsável em vez de rebentar.
-- Remove a versão de 2 argumentos (Fase 1): a de 3 com default trata essas chamadas
-- e evita ambiguidade "function is not unique".
drop function if exists public.lead_sync_followup(uuid, uuid);
create or replace function public.lead_sync_followup(p_lead_id uuid, p_ator uuid, p_raise boolean default true)
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
      if p_raise then
        raise exception 'A lead "%" nao tem responsavel — atribui antes de mudar de estado.', v.nome;
      else
        return;
      end if;
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

-- Cron diário: só toca em leads que JÁ têm follow-up.
create or replace function public.leads_followup_cron()
returns table(processadas int, reabertas int)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_proc int := 0; v_reab int := 0;
begin
  for v_id in (select distinct lead_id from public.user_tasks where tipo='lead_followup' and lead_id is not null) loop
    v_proc := v_proc + 1;
    if exists (
      select 1 from public.leads l
      join public.user_tasks ut on ut.lead_id=l.id and ut.tipo='lead_followup'
      join public.user_task_assignees a on a.task_id=ut.id
      where l.id=v_id and l.estado in ('contactada','proposta_enviada')
        and (a.estado in (select slug from public.task_estados where is_concluido) or a.arquivada_em is not null)
    ) then v_reab := v_reab + 1; end if;
    perform public.lead_sync_followup(v_id, null, false);
  end loop;
  return query select v_proc, v_reab;
end $$;
