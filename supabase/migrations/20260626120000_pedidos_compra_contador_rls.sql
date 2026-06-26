-- Ativar RLS na tabela pedidos_compra_contador (estava exposta à anon key).
-- Segue o mesmo padrão do envios_pecas_contador: RLS ativo SEM políticas.
-- A tabela só é manipulada pela função gerar_numero_pedido_compra() (security definer),
-- por isso a ausência de políticas não bloqueia a numeração PC-YYYY-NNNN.
alter table public.pedidos_compra_contador enable row level security;
