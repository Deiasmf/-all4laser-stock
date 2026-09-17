-- ───────────────────────────────────────────────────────────────────────────
-- Seguimento automático (⚡) LIGADO POR OMISSÃO nos envios expresso de
-- transportadoras com cobertura Ship24 (suporta_ship24). Só no INSERT — se
-- alguém desligar o ⚡ depois, fica desligado (o gatilho não o volta a ligar).
-- Inclui backfill dos envios existentes ativos.
-- Carga aérea (AWB) fica de fora (o Ship24 não a cobre).
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.trg_tracking_auto_default()
returns trigger
language plpgsql
as $$
declare v_suporta boolean := false;
begin
  if new.auto_tracking_enabled then return new; end if;
  if new.tipo_transporte <> 'expresso' then return new; end if;
  if coalesce(nullif(trim(new.tracking_number),''), '') = '' then return new; end if;
  if new.estado in ('entregue','devolvido') then return new; end if;
  if new.carrier_id is not null then
    select suporta_ship24 into v_suporta from public.carriers where id = new.carrier_id;
  end if;
  if coalesce(v_suporta, false) then
    new.auto_tracking_enabled := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shipments_auto_default on public.shipments_tracking;
create trigger trg_shipments_auto_default
  before insert on public.shipments_tracking
  for each row execute function public.trg_tracking_auto_default();

-- Backfill: existentes ativos (expresso + cobertura + número + não terminais).
update public.shipments_tracking s
set auto_tracking_enabled = true
from public.carriers c
where s.carrier_id = c.id
  and c.suporta_ship24
  and s.tipo_transporte = 'expresso'
  and coalesce(nullif(trim(s.tracking_number),''),'') <> ''
  and s.estado not in ('entregue','devolvido')
  and s.deleted_at is null
  and s.origem_anulada = false
  and s.auto_tracking_enabled = false;
