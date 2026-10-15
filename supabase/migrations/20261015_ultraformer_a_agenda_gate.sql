-- Ultraformer III pay-per-use — PARTE A: calendário na Agenda + gate de registo de pulsos.
-- Aditivo e seguro: o gate só atua em paragens de calendários marcados
-- exige_registo_pulsos = true (hoje nenhum, até se criar o calendário do Ultraformer),
-- por isso NÃO altera o comportamento atual das restantes paragens/equipamentos.
-- O seed da linha do calendário Ultraformer fica para quando tivermos o google_calendar_id;
-- este UPDATE liga o flag automaticamente assim que esse calendário existir com modelo 'Ultraformer%'.

-- 1) Flag no calendário: que equipamentos exigem registo de pulsos na entrega/recolha.
alter table public.transport_calendars
  add column if not exists exige_registo_pulsos boolean not null default false;

update public.transport_calendars
   set exige_registo_pulsos = true
 where modelo ilike 'ultraformer%';

-- 2) Estado do registo ao nível da paragem.
--    pulsos_registado é posto a true pela Parte B ao gravar o registo de entrega/recolha.
--    exige_registo_pulsos na paragem passa a ser copiado do calendário pela sincronização
--    (alteração de código, à parte); o gate em baixo usa o calendário como fonte de reserva.
alter table public.transport_stops
  add column if not exists exige_registo_pulsos  boolean not null default false,
  add column if not exists pulsos_registado      boolean not null default false,
  add column if not exists pulsos_dispensa_motivo text,
  add column if not exists pulsos_dispensa_por    uuid references public.profiles(id) on delete set null,
  add column if not exists pulsos_dispensa_em     timestamptz;

-- 3) Gate na conclusão: não deixa concluir ENTREGA/RECOLHA de equipamento pay-per-use
--    sem o registo de pulsos (ou sem um motivo de dispensa explícito).
--    Mantém a verificação de permissão e todo o comportamento anterior.
create or replace function public.transport_stop_marcar(p_stop uuid, p_feita boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_exige     boolean;
  v_registado boolean;
  v_dispensa  text;
  v_tipo      text;
begin
  if not public.is_staff() then raise exception 'Sem permissao.'; end if;

  select (coalesce(ts.exige_registo_pulsos, false) or coalesce(tc.exige_registo_pulsos, false)),
         coalesce(ts.pulsos_registado, false),
         ts.pulsos_dispensa_motivo,
         ts.tipo
    into v_exige, v_registado, v_dispensa, v_tipo
    from public.transport_stops ts
    left join public.transport_calendars tc on tc.id = ts.calendar_id
   where ts.id = p_stop;

  if p_feita and v_exige and v_tipo in ('entrega','recolha')
     and not v_registado and (v_dispensa is null or btrim(v_dispensa) = '') then
    raise exception 'Registo de pulsos obrigatório: conclui o registo de pulsos desta paragem (ou indica um motivo de dispensa) antes de marcar como concluída.';
  end if;

  update public.transport_stops
     set estado       = case when p_feita then 'concluida' else 'confirmada' end,
         concluida_em = case when p_feita then now() else null end,
         updated_at   = now()
   where id = p_stop;
end $$;

-- 4) Dispensa explícita do registo (override com motivo) — utilizável já na UI da agenda.
create or replace function public.transport_stop_dispensar_pulsos(p_stop uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissao.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica o motivo da dispensa do registo de pulsos.';
  end if;
  update public.transport_stops
     set pulsos_dispensa_motivo = btrim(p_motivo),
         pulsos_dispensa_por     = auth.uid(),
         pulsos_dispensa_em      = now(),
         updated_at              = now()
   where id = p_stop;
end $$;
