-- Nome de faturação do cliente: a designação legal que sai na fatura, que às
-- vezes difere do nome comercial/clínica guardado em `nome`. Opcional.
-- (Os GRANTs ao nível da tabela `clientes` já cobrem esta coluna nova.)

alter table public.clientes
  add column if not exists nome_faturacao text;
