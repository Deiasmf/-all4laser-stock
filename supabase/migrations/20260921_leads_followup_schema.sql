-- Leads: follow-up automático nas tarefas + histórico de estados (Fase 1 — schema).
-- Aplicada via Supabase apply_migration (projeto all4laser).

-- LEADS: responsável, motivo, "no estado desde"
alter table public.leads
  add column if not exists responsavel_id uuid references public.profiles(id) on delete set null,
  add column if not exists motivo_perdida text,
  add column if not exists estado_desde  timestamptz not null default now();
update public.leads set estado_desde = coalesce(updated_at, created_at, now());
create index if not exists idx_leads_responsavel on public.leads(responsavel_id);

-- Histórico de estados
create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  estado_anterior text,
  estado_novo text not null,
  ator_id uuid references public.profiles(id) on delete set null,
  ator_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_hist on public.lead_status_history(lead_id, created_at);
alter table public.lead_status_history enable row level security;
drop policy if exists lead_hist_sel on public.lead_status_history;
create policy lead_hist_sel on public.lead_status_history for select using (public.is_staff());

-- Ligação tarefa de follow-up <-> lead (1 follow-up por lead)
alter table public.user_tasks
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists tipo text;
create unique index if not exists uq_user_tasks_lead_followup
  on public.user_tasks(lead_id) where tipo = 'lead_followup';

-- Config de prazos (dias úteis)
create table if not exists public.leads_followup_config (
  id int primary key default 1 check (id = 1),
  dias_uteis_contactada int not null default 3,
  dias_uteis_proposta   int not null default 5
);
insert into public.leads_followup_config(id) values (1) on conflict do nothing;
alter table public.leads_followup_config enable row level security;
drop policy if exists leads_fu_cfg_sel on public.leads_followup_config;
create policy leads_fu_cfg_sel on public.leads_followup_config for select using (public.is_staff());
drop policy if exists leads_fu_cfg_upd on public.leads_followup_config;
create policy leads_fu_cfg_upd on public.leads_followup_config for update using (public.is_admin()) with check (public.is_admin());

-- Etiqueta "Leads/Follow-up"
insert into public.task_etiquetas(nome, cor, notion_tag_name)
select 'Leads/Follow-up', '#0EA5E9', 'Leads/Follow-up'
where not exists (select 1 from public.task_etiquetas where lower(nome)=lower('Leads/Follow-up') and ativo);

-- Helper: somar dias úteis
create or replace function public.mais_dias_uteis(p_base date, p_dias int)
returns date language plpgsql immutable as $$
declare d date := p_base; r int := greatest(coalesce(p_dias,0),0);
begin
  while r > 0 loop d := d + 1; if extract(dow from d) not in (0,6) then r := r-1; end if; end loop;
  return d;
end $$;
