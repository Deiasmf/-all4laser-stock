-- Módulo Stock de Peças (Área Técnica)
-- Inventário de peças por quantidade + ligação ao material usado nas folhas de
-- obra. Quando uma peça é adicionada como material de uma folha, o stock é
-- descontado automaticamente; se a linha for removida (ou a folha apagada), o
-- stock é reposto. O movimento usa uma função SECURITY DEFINER para poder
-- ajustar o stock mesmo quando quem edita a folha não é admin.

-- ── Tabela de peças (stock por quantidade) ──
create table if not exists public.pecas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  marca       text,                       -- Candela, AlmaLaser, ...
  grupo       text,                       -- categoria (ex.: Peças GMAX, HP ICE)
  referencia  text,                       -- código/SKU (opcional)
  quantidade  integer not null default 0,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Material (peças) usado em cada folha de obra ──
create table if not exists public.folha_obra_materiais (
  id          uuid primary key default gen_random_uuid(),
  folha_id    uuid not null references public.folhas_obra(id) on delete cascade,
  peca_id     uuid references public.pecas(id) on delete set null,
  descricao   text,                       -- cópia do nome da peça (histórico)
  quantidade  integer not null default 1 check (quantidade > 0),
  created_at  timestamptz not null default now()
);

-- ── Movimento de stock: desconta/repõe conforme as linhas de material ──
create or replace function public.mov_stock_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.peca_id is not null then
      update public.pecas
         set quantidade = quantidade - new.quantidade, updated_at = now()
       where id = new.peca_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.peca_id is not null then
      update public.pecas
         set quantidade = quantidade + old.quantidade, updated_at = now()
       where id = old.peca_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    -- repõe o valor antigo e aplica o novo (trata mudança de peça e/ou quantidade)
    if old.peca_id is not null then
      update public.pecas
         set quantidade = quantidade + old.quantidade, updated_at = now()
       where id = old.peca_id;
    end if;
    if new.peca_id is not null then
      update public.pecas
         set quantidade = quantidade - new.quantidade, updated_at = now()
       where id = new.peca_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_mov_stock_material on public.folha_obra_materiais;
create trigger trg_mov_stock_material
  after insert or update or delete on public.folha_obra_materiais
  for each row execute function public.mov_stock_material();

-- updated_at automático nas peças (reutiliza a função existente)
drop trigger if exists trg_pecas_updated_at on public.pecas;
create trigger trg_pecas_updated_at
  before update on public.pecas
  for each row execute function public.set_updated_at();

-- ── Índices ──
create index if not exists idx_pecas_nome  on public.pecas(nome);
create index if not exists idx_pecas_marca on public.pecas(marca);
create index if not exists idx_pecas_grupo on public.pecas(grupo);
create index if not exists idx_fom_folha   on public.folha_obra_materiais(folha_id);
create index if not exists idx_fom_peca    on public.folha_obra_materiais(peca_id);

-- ── RLS ──
alter table public.pecas                 enable row level security;
alter table public.folha_obra_materiais  enable row level security;

-- pecas: leitura para autenticados; escrita só admin (o desconto faz-se via
-- trigger SECURITY DEFINER, por isso os técnicos não precisam de escrita direta)
drop policy if exists pecas_select on public.pecas;
drop policy if exists pecas_insert on public.pecas;
drop policy if exists pecas_update on public.pecas;
drop policy if exists pecas_delete on public.pecas;
create policy pecas_select on public.pecas for select to authenticated using (true);
create policy pecas_insert on public.pecas for insert to authenticated with check (is_admin());
create policy pecas_update on public.pecas for update to authenticated using (is_admin()) with check (is_admin());
create policy pecas_delete on public.pecas for delete to authenticated using (is_admin());

-- folha_obra_materiais: leitura/escrita para autenticados (a folha é a barreira)
drop policy if exists fom_select on public.folha_obra_materiais;
drop policy if exists fom_insert on public.folha_obra_materiais;
drop policy if exists fom_update on public.folha_obra_materiais;
drop policy if exists fom_delete on public.folha_obra_materiais;
create policy fom_select on public.folha_obra_materiais for select to authenticated using (true);
create policy fom_insert on public.folha_obra_materiais for insert to authenticated with check (true);
create policy fom_update on public.folha_obra_materiais for update to authenticated using (true) with check (true);
create policy fom_delete on public.folha_obra_materiais for delete to authenticated using (true);

-- ── GRANTs ──
grant select, insert, update, delete on public.pecas                to authenticated;
grant select, insert, update, delete on public.folha_obra_materiais to authenticated;
