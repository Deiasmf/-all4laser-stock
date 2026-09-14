-- Folhas de Obra: novas opções de "Tipo de serviço".
-- Acrescenta Reparação em garantia / fora de garantia, Retira reparação e
-- Instalação e formação, mantendo todas as opções já existentes (os valores
-- gravados nas FO antigas continuam válidos).

-- Remove a(s) check constraint(s) antiga(s) do tipo_servico, seja qual for o
-- nome que o Postgres lhe deu (a original era inline no create table).
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'folhas_obra'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%tipo_servico%'
  loop
    execute format('alter table public.folhas_obra drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.folhas_obra
  add constraint folhas_obra_tipo_servico_check
  check (tipo_servico in (
    'Reparação',
    'Reparação em garantia',
    'Reparação fora de garantia',
    'Retira reparação',
    'Manutenção preventiva',
    'Preparação para saída',
    'Instalação',
    'Formação técnica',
    'Instalação e formação',
    'Outro'
  ));
