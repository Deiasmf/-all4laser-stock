-- Liga uma folha de obra à nota de encomenda que a originou (fase técnica do
-- fluxo de preparação). Coluna opcional: folhas de obra avulsas continuam sem
-- nota associada.

alter table public.folhas_obra
  add column if not exists nota_encomenda_id uuid references public.notas_encomenda(id) on delete set null;

create index if not exists idx_folhas_obra_nota on public.folhas_obra(nota_encomenda_id);
