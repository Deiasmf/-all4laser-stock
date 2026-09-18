-- Modelo do equipamento por calendário (confirmado com o Dinis/Andreia).
-- Serve para filtrar o dropdown de serial no ecrã de mapeamento (matching
-- calendário → unidade específica da frota).
alter table public.transport_calendars add column if not exists modelo text;

update public.transport_calendars set modelo = 'Gentle Pro'
  where nome in ('Alex A','Alex B - Gpro','Alex C - Gpro','Alex D - Gpro','Alex E Gpro','Alex F Gpro','Alex G Gpro','Alex H Gpro','Alex K - Gpro Norte 1','Alex L - Gpro Norte 2','Alex O - Gpro Norte 3');

update public.transport_calendars set modelo = 'Gmax Pro'
  where nome in ('Alex I GentleMax Pro','Alex J Gmax Pro Algarve','Alex M - Gmax Pro Norte','Alex N - Gmax Pro Norte 2');

update public.transport_calendars set modelo = 'Soprano ICE'      where nome = 'Soprano ICE';
update public.transport_calendars set modelo = 'Soprano Platinum' where nome = 'Soprano Platinum';
update public.transport_calendars set modelo = 'Soprano Accord'   where nome = 'Laser Diodo ALMA';
