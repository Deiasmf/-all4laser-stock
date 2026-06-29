-- Visto de validação na lista de alugueres.
-- Coluna booleana para marcar que a informação do aluguer já foi verificada.
alter table public.alugueres
  add column if not exists validado boolean not null default false;
