-- Sinalizar um contrato como "a avançar para venda" (só marca + notifica; não
-- mexe no inventário). Marcado em todas as linhas do contrato.
alter table public.alugueres
  add column if not exists marcado_venda_em timestamptz;
