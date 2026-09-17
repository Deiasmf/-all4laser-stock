-- calendarios_aluguer: leitura e escrita só para staff interno.
--
-- As políticas originais (20260629140000_calendarios_aluguer.sql) eram
-- `to authenticated using (true)` para SELECT e para ALL. Os clientes do portal
-- de reservas autenticam-se no mesmo projeto Supabase (public.clientes_portal,
-- criados com auth.signUp em /reservas/registo), por isso qualquer cliente podia
-- ler — e alterar — o mapeamento calendário → modelo/zona.
--
-- is_staff() = tem registo em public.profiles com role admin|financeiro|standard.
-- Idempotente: só troca as políticas, não mexe nos dados.

drop policy if exists cal_aluguer_select on public.calendarios_aluguer;
drop policy if exists cal_aluguer_write  on public.calendarios_aluguer;

create policy cal_aluguer_select on public.calendarios_aluguer
  for select to authenticated using (public.is_staff());
create policy cal_aluguer_write on public.calendarios_aluguer
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
