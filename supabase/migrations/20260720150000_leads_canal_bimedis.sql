-- O tipo CanalLead e os endpoints já preveem o canal 'bimedis', mas o CHECK
-- da coluna criado na migração 002 só aceitava website/email/facebook/instagram,
-- rejeitando qualquer lead do Bimedis. Atualiza o CHECK para o incluir.
alter table public.leads drop constraint if exists leads_canal_check;
alter table public.leads add constraint leads_canal_check
  check (canal in ('website','email','facebook','instagram','bimedis'));
