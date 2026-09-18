-- Fase D: agenda diária pode ficar "confirmada" (revisão de véspera).
alter table public.transport_driver_days drop constraint if exists transport_driver_days_estado_check;
alter table public.transport_driver_days
  add constraint transport_driver_days_estado_check check (estado in ('provisorio','publicado','confirmado'));
