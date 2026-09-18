-- Agenda de Transportes (Fase A): mapa gerível calendário Google → zona →
-- equipamento da frota. Calendários novos = nova linha na UI, sem código.
-- Seed dos 18 calendários validados (acesso confirmado via Service Account).
-- equipamento_id fica por preencher até o matching ser confirmado.
create table if not exists public.transport_calendars (
  id                 uuid primary key default gen_random_uuid(),
  google_calendar_id text not null unique,
  nome               text not null,
  zona               text not null check (zona in ('lisboa','norte','algarve')),
  equipamento_id     uuid references public.equipamentos(id) on delete set null,
  ativo              boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.transport_calendars enable row level security;
grant select, insert, update, delete on public.transport_calendars to authenticated;
grant all on public.transport_calendars to service_role;

drop policy if exists transport_calendars_acesso on public.transport_calendars;
create policy transport_calendars_acesso on public.transport_calendars
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop trigger if exists trg_transport_calendars_updated_at on public.transport_calendars;
create trigger trg_transport_calendars_updated_at before update on public.transport_calendars
  for each row execute function public.set_updated_at();

insert into public.transport_calendars (google_calendar_id, nome, zona) values
  ('all4laser.com_t5fharmhm7rqfllte42te6v9is@group.calendar.google.com','Alex A','lisboa'),
  ('all4laser.com_k7cjifhrancibi3mek6ddm3v30@group.calendar.google.com','Alex B - Gpro','lisboa'),
  ('all4laser.com_3e0gpevq04r6vnna9fv17khd84@group.calendar.google.com','Alex C - Gpro','lisboa'),
  ('all4laser.com_oebsgn2hsv6quh2jgpj7u10kfc@group.calendar.google.com','Alex D - Gpro','lisboa'),
  ('all4laser.com_9659pn6sskpar7f3msk1apn89s@group.calendar.google.com','Alex E Gpro','lisboa'),
  ('5bqn23kv4obkpr2gb13lnrkoqo@group.calendar.google.com','Alex F Gpro','lisboa'),
  ('c_q40ekodqd846j67favbdrqpi4g@group.calendar.google.com','Alex G Gpro','lisboa'),
  ('c_jhhuc32tdgafltdcgq232qrc5c@group.calendar.google.com','Alex H Gpro','lisboa'),
  ('all4laser.com_798vj166ci136vlad0510i12o8@group.calendar.google.com','Alex I GentleMax Pro','lisboa'),
  ('c_q0rfjojfvot5rd0ucf8q3s3s10@group.calendar.google.com','Soprano ICE','lisboa'),
  ('c_fbefdaac7e695feec5d4a4c3f49d7c6de31af4b04588a65a1ed558fd9db263d3@group.calendar.google.com','Soprano Platinum','lisboa'),
  ('4lkg67nkaelf90sljtpdu4941g@group.calendar.google.com','Laser Diodo ALMA','lisboa'),
  ('c_604fac79664df0563c312a18b25e83c0c050f858b3e21da94a1788b57aa62ff5@group.calendar.google.com','Alex J Gmax Pro Algarve','algarve'),
  ('c_d6bua321f1qn1hk6kdj5dgb6cc@group.calendar.google.com','Alex K - Gpro Norte 1','norte'),
  ('c_vri26c3skollem09mses2fani8@group.calendar.google.com','Alex L - Gpro Norte 2','norte'),
  ('smvj02908gh5ria1qkau3dnkjo@group.calendar.google.com','Alex M - Gmax Pro Norte','norte'),
  ('c_8e6c8dcba39f74d5b2b5b6410ac621d4c52a5f55d4a17eddad618d3ff79f1bd0@group.calendar.google.com','Alex N - Gmax Pro Norte 2','norte'),
  ('c_a7b9f1180a2f0720ef29d542d56320fe125caab90b05e3a92cea831eddb095c6@group.calendar.google.com','Alex O - Gpro Norte 3','norte')
on conflict (google_calendar_id) do nothing;
