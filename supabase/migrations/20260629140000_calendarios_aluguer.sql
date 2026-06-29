-- Mapeamento de calendários Google → modelo de equipamento (para valorizar marcações).
-- O staff associa, no ecrã Alugueres → Agenda, cada calendário a um modelo (ou ignora).
create table if not exists public.calendarios_aluguer (
  id            text primary key,         -- id do calendário Google
  nome          text,                     -- nome do calendário (cópia, para referência)
  modelo_grupo  text not null,            -- gentlepro | gentlemaxpro | gentlemaxproplus | sopranoice | sopranoplatinum
  modelo_label  text,                     -- rótulo legível
  regiao        text,                     -- opcional (Lisboa/Norte/Algarve)
  ativo         boolean not null default true,
  updated_at    timestamptz not null default now()
);

alter table public.calendarios_aluguer enable row level security;

drop policy if exists cal_aluguer_select on public.calendarios_aluguer;
drop policy if exists cal_aluguer_write  on public.calendarios_aluguer;
create policy cal_aluguer_select on public.calendarios_aluguer for select to authenticated using (true);
create policy cal_aluguer_write  on public.calendarios_aluguer for all    to authenticated using (true) with check (true);

grant select, insert, update, delete on public.calendarios_aluguer to authenticated;
