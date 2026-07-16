-- Corrige o "duplicate key ... processos_pecas_numero_key" ao criar processos.
-- Causa: a tabela processos_pecas_contador estava vazia/atrasada face aos números
-- já existentes (ex.: PP-2026-0003), pelo que a geração produzia um número duplicado.
-- A função passa a derivar o próximo número do MÁXIMO já existente no ano, ficando
-- imune a um contador dessincronizado.
create or replace function public.gerar_numero_processo_peca()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  ano_atual integer := extract(year from now());
  proximo integer;
  max_existente integer;
begin
  select coalesce(max((substring(numero from 9))::int), 0)
    into max_existente
    from public.processos_pecas
   where numero like 'PP-' || ano_atual || '-%';

  insert into public.processos_pecas_contador (ano, ultimo)
  values (ano_atual, max_existente + 1)
  on conflict (ano) do update
    set ultimo = greatest(public.processos_pecas_contador.ultimo, max_existente) + 1
  returning ultimo into proximo;

  new.numero := 'PP-' || ano_atual || '-' || lpad(proximo::text, 4, '0');
  return new;
end;
$function$;

-- Acerta já o contador para o máximo existente (evita a colisão imediata).
insert into public.processos_pecas_contador (ano, ultimo)
select extract(year from now())::int,
       coalesce(max((substring(numero from 9))::int), 0)
  from public.processos_pecas
 where numero like 'PP-' || extract(year from now())::int || '-%'
on conflict (ano) do update
  set ultimo = greatest(public.processos_pecas_contador.ultimo, excluded.ultimo);
