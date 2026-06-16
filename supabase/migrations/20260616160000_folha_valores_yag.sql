-- Folhas de Obra: separar valores Alexandrite de Nd:Yag
-- Já existiam valor_cabeca_alex e valor_transmissao_alex (Alexandrite).
-- Acrescentam-se as colunas equivalentes para o Nd:Yag, formando um quadro 2x2
-- (cabeça/transmissão × Alexandrite/Nd:Yag) na folha de obra.

alter table public.folhas_obra
  add column if not exists valor_cabeca_yag       numeric,
  add column if not exists valor_transmissao_yag  numeric;
