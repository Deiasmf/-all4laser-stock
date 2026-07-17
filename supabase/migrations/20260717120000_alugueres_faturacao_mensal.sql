-- Faturação mensal dos alugueres: uma linha por aluguer por mês (YYYY-MM).
-- Permite faturar um aluguer de vários meses todos os meses, mantendo
-- uma só entrega e uma só recolha no registo do aluguer.
create table if not exists public.alugueres_faturacao_mensal (
  id uuid not null default gen_random_uuid() primary key,
  aluguer_id uuid not null references public.alugueres(id) on delete cascade,
  mes text not null,                       -- mês de faturação no formato 'YYYY-MM'
  valor_a_faturar numeric,                 -- null = por definir
  nao_faturar boolean not null default false,
  validado boolean not null default false,
  fatura_url text,
  fatura_caminho text,
  fatura_nome text,
  fatura_enviada_em timestamp with time zone,
  fatura_enviada_para text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint alugueres_faturacao_mensal_uniq unique (aluguer_id, mes)
);

create index if not exists alugueres_faturacao_mensal_mes_idx
  on public.alugueres_faturacao_mensal (mes);
create index if not exists alugueres_faturacao_mensal_aluguer_idx
  on public.alugueres_faturacao_mensal (aluguer_id);

alter table public.alugueres_faturacao_mensal enable row level security;

-- Políticas a espelhar a tabela alugueres (ler todos; escrever autenticado; apagar admin)
create policy afm_select on public.alugueres_faturacao_mensal
  for select to authenticated using (true);
create policy afm_insert on public.alugueres_faturacao_mensal
  for insert to authenticated with check (true);
create policy afm_update on public.alugueres_faturacao_mensal
  for update to authenticated using (true) with check (true);
create policy afm_delete on public.alugueres_faturacao_mensal
  for delete to authenticated using (is_admin());

-- Migração dos dados existentes: copia a faturação que já está em cada aluguer
-- para a linha do mês da entrega (não altera nem apaga colunas do aluguer).
insert into public.alugueres_faturacao_mensal
  (aluguer_id, mes, valor_a_faturar, nao_faturar, validado,
   fatura_url, fatura_caminho, fatura_nome, fatura_enviada_em, fatura_enviada_para)
select
  id, to_char(data_entrega, 'YYYY-MM'),
  valor_a_faturar, coalesce(nao_faturar, false), coalesce(validado, false),
  fatura_url, fatura_caminho, fatura_nome, fatura_enviada_em, fatura_enviada_para
from public.alugueres
where data_entrega is not null
  and (valor_a_faturar is not null or nao_faturar is true or validado is true
       or fatura_url is not null or fatura_enviada_em is not null)
on conflict (aluguer_id, mes) do nothing;
