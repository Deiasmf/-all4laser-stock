-- S/N do laser em aluguer, resolvido a partir da tabela `alugueres` (cliente +
-- datas) na sincronização. O laser de cada calendário muda ao longo do tempo,
-- por isso o serial não vem do mapeamento fixo do calendário.
alter table public.transport_stops add column if not exists serial_number text;
