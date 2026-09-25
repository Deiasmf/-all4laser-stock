-- ───────────────────────────────────────────────────────────────────────────
-- ALUGUERES — registo de entrega passa a incluir o Zimmer (par laser+Zimmer)
--
-- No "Registar entrega" o SN do laser é obrigatório e o SN do Zimmer é opcional.
-- Se o Zimmer NÃO for preenchido, é obrigatória uma justificação (ex.: cliente
-- não solicitou, usa garrafas de criogénio, Zimmer indisponível). Essa
-- justificação fica na linha do laser, nesta coluna.
--
-- Quando há Zimmer, é criada uma linha de aluguer própria para o Zimmer
-- (mesmos meses/cliente) marcada `nao_faturar = true` e sem valor — para
-- registar a entrega/recolha do Zimmer sem duplicar a faturação do conjunto.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.alugueres add column if not exists zimmer_justificacao text;
comment on column public.alugueres.zimmer_justificacao is
  'Motivo de a entrega não incluir Zimmer (quando o SN do Zimmer fica por preencher).';
