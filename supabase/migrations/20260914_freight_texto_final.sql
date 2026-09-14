-- Cotações: guardar o texto EXATO enviado a cada destinatário (pré-visualização
-- editável). assunto_final/corpo_final ficam com o que realmente saiu (já com a
-- saudação do transitário substituída).
alter table public.freight_quote_recipients
  add column if not exists assunto_final text,
  add column if not exists corpo_final   text;
