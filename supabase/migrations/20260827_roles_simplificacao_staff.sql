-- ─────────────────────────────────────────────────────────────────────────────
-- SIMPLIFICAÇÃO DE ROLES — só duas áreas restritas
-- ─────────────────────────────────────────────────────────────────────────────
-- Modelo final (3 roles):
--   admin      → acesso total, incluindo Financeiro e Gestão de Utilizadores.
--   financeiro → acesso ao Financeiro + resto da app (sem Gestão de Utilizadores).
--   standard   → acesso a tudo MENOS o Financeiro e a Gestão de Utilizadores.
--
-- Consequência: todo o staff interno passa a poder criar/editar/apagar na maioria
-- da app (equipamentos, peças, preços, processos, tarefas, Tracking, etc.). As
-- ÚNICAS barreiras são o Financeiro (has_financeiro_access) e a Gestão de
-- Utilizadores (is_admin). O role 'administrativo' deixa de existir.
--
-- Estratégia:
--   • is_staff()  — novo helper: qualquer utilizador interno (tem perfil de staff).
--   • has_administrativo_access() e is_administrativo() passam a delegar em is_staff()
--     → abre Tracking/Expedições/Cotações/Fichas a todo o staff sem tocar em cada policy.
--   • ~40 policies que eram is_admin() (apagar/editar operacional) passam a is_staff().
--   • is_admin() mantém-se (= role 'admin') só para: Gestão de Utilizadores
--     (admin_set_role) e o log de acessos do cofre financeiro.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Reatribuir roles (antes de apertar os CHECK) ─────────────────────────────
update public.profiles set role = 'financeiro'
  where lower(email) = 'vanessa.tavares@all4laser.com';

update public.profiles set role = 'standard'
  where lower(email) in (
    'bruno.liborio@all4laser.com',
    'dinis.agueda@all4laser.com',
    'eduardo.esteves@all4laser.com',
    'rafael.santana@all4laser.com',
    'sara.evaristo@all4laser.com',
    'jose.cunha@all4laser.com',
    'nuno.martins@all4laser.com'
  );

-- Rede de segurança: qualquer 'administrativo' remanescente → 'standard'.
update public.profiles set role = 'standard' where role = 'administrativo';
update public.utilizadores_autorizados set role = 'standard' where role = 'administrativo';

-- Espelhar em utilizadores_autorizados a partir de profiles (por email).
update public.utilizadores_autorizados u
   set role = p.role
  from public.profiles p
 where lower(u.email) = lower(p.email);

-- ── 2. Apertar os CHECK de role (remover 'administrativo') ───────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','financeiro','standard'));

alter table public.utilizadores_autorizados drop constraint if exists utilizadores_autorizados_role_check;
alter table public.utilizadores_autorizados
  add constraint utilizadores_autorizados_role_check check (role in ('admin','financeiro','standard'));

-- ── 3. Helper is_staff() — qualquer utilizador interno ──────────────────────────
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','financeiro','standard')
  );
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- ── 4. Área Administrativa / Fichas passam a ser de todo o staff ────────────────
-- Mantemos os nomes das funções (dezenas de policies dependem delas); só muda o
-- corpo, que passa a delegar em is_staff().
create or replace function public.has_administrativo_access()
returns boolean
language sql stable security definer set search_path to 'public'
as $$ select public.is_staff() $$;

create or replace function public.is_administrativo()
returns boolean
language sql stable security definer set search_path to 'public'
as $$ select public.is_staff() $$;

-- ── 5. admin_set_role — só admin; roles válidos sem 'administrativo' ─────────────
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar roles.';
  end if;
  if p_role not in ('admin','financeiro','standard') then
    raise exception 'Role inválido: %', p_role;
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Não podes remover o teu próprio acesso de administrador.';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'Utilizador não encontrado.';
  end if;

  update public.utilizadores_autorizados u
     set role = p_role
    from public.profiles p
   where p.id = p_user_id and lower(u.email) = lower(p.email);
end;
$$;

-- ── 6. Reescrever as policies operacionais: is_admin() → is_staff() ──────────────
-- (apagar/editar registos e ecrãs de gestão passam a estar abertos a todo o staff)

-- profiles: qualquer staff vê o diretório interno (necessário p/ atribuir tarefas).
drop policy if exists perfil_select on public.profiles;
create policy perfil_select on public.profiles
  for select to authenticated using ((id = auth.uid()) or public.is_staff());

-- Núcleo de stock
drop policy if exists eq_insert on public.equipamentos;
create policy eq_insert on public.equipamentos for insert to authenticated with check (public.is_staff());
drop policy if exists eq_update on public.equipamentos;
create policy eq_update on public.equipamentos for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists eq_delete on public.equipamentos;
create policy eq_delete on public.equipamentos for delete to authenticated using (public.is_staff());

drop policy if exists marcas_write on public.marcas;
create policy marcas_write on public.marcas for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists modelos_write on public.modelos;
create policy modelos_write on public.modelos for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists pecas_insert on public.pecas;
create policy pecas_insert on public.pecas for insert to authenticated with check (public.is_staff());
drop policy if exists pecas_update on public.pecas;
create policy pecas_update on public.pecas for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists pecas_delete on public.pecas;
create policy pecas_delete on public.pecas for delete to authenticated using (public.is_staff());

drop policy if exists equipamento_pecas_em_falta_delete on public.equipamento_pecas_em_falta;
create policy equipamento_pecas_em_falta_delete on public.equipamento_pecas_em_falta for delete to authenticated using (public.is_staff());

-- Faturação / rentabilização de equipamento
drop policy if exists fatequip_admin on public.faturacao_equipamento;
create policy fatequip_admin on public.faturacao_equipamento for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Preços
drop policy if exists tabela_precos_insert on public.tabela_precos;
create policy tabela_precos_insert on public.tabela_precos for insert to authenticated with check (public.is_staff());
drop policy if exists tabela_precos_update on public.tabela_precos;
create policy tabela_precos_update on public.tabela_precos for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists tabela_precos_delete on public.tabela_precos;
create policy tabela_precos_delete on public.tabela_precos for delete to authenticated using (public.is_staff());

drop policy if exists precos_admin on public.precos_aluguer;
create policy precos_admin on public.precos_aluguer for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Alugueres / contratos / reservas
drop policy if exists alugueres_delete on public.alugueres;
create policy alugueres_delete on public.alugueres for delete to authenticated using (public.is_staff());
drop policy if exists afm_delete on public.alugueres_faturacao_mensal;
create policy afm_delete on public.alugueres_faturacao_mensal for delete to authenticated using (public.is_staff());
drop policy if exists modelos_aluguer_write on public.modelos_aluguer;
create policy modelos_aluguer_write on public.modelos_aluguer for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists contratos_aluguer_delete on public.contratos_aluguer;
create policy contratos_aluguer_delete on public.contratos_aluguer for delete to authenticated using (public.is_staff());
drop policy if exists contratos_aluguer_ficheiros_delete on public.contratos_aluguer_ficheiros;
create policy contratos_aluguer_ficheiros_delete on public.contratos_aluguer_ficheiros for delete to authenticated using (public.is_staff());
drop policy if exists reservas_delete on public.reservas;
create policy reservas_delete on public.reservas for delete to authenticated using (public.is_staff());
drop policy if exists reservas_portal_delete on public.reservas_portal;
create policy reservas_portal_delete on public.reservas_portal for delete to authenticated using (public.is_staff());

-- Comercial
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated using (public.is_staff());
drop policy if exists registos_cliente_delete on public.registos_cliente;
create policy registos_cliente_delete on public.registos_cliente for delete to authenticated using (public.is_staff());
drop policy if exists notas_encomenda_delete on public.notas_encomenda;
create policy notas_encomenda_delete on public.notas_encomenda for delete to authenticated using (public.is_staff());
drop policy if exists nem_delete on public.notas_encomenda_material;
create policy nem_delete on public.notas_encomenda_material for delete to authenticated using (public.is_staff());

-- Técnico
drop policy if exists folhas_obra_delete on public.folhas_obra;
create policy folhas_obra_delete on public.folhas_obra for delete to authenticated using (public.is_staff());
drop policy if exists folha_obra_config_upd on public.folha_obra_config;
create policy folha_obra_config_upd on public.folha_obra_config for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Logística — reparação / receção / envios
drop policy if exists reparacao_pecas_insert on public.reparacao_pecas;
create policy reparacao_pecas_insert on public.reparacao_pecas for insert to authenticated with check (public.is_staff());
drop policy if exists reparacao_pecas_update on public.reparacao_pecas;
create policy reparacao_pecas_update on public.reparacao_pecas for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists reparacao_pecas_delete on public.reparacao_pecas;
create policy reparacao_pecas_delete on public.reparacao_pecas for delete to authenticated using (public.is_staff());
drop policy if exists rececoes_pecas_delete on public.rececoes_pecas;
create policy rececoes_pecas_delete on public.rececoes_pecas for delete to authenticated using (public.is_staff());
drop policy if exists recepcao_movimentos_delete on public.recepcao_movimentos;
create policy recepcao_movimentos_delete on public.recepcao_movimentos for delete to authenticated using (public.is_staff());
drop policy if exists recepcao_match_delete on public.recepcao_match;
create policy recepcao_match_delete on public.recepcao_match for delete to authenticated using (public.is_staff());
drop policy if exists processos_pecas_delete on public.processos_pecas;
create policy processos_pecas_delete on public.processos_pecas for delete to authenticated using (public.is_staff());
drop policy if exists envios_pecas_delete on public.envios_pecas;
create policy envios_pecas_delete on public.envios_pecas for delete to authenticated using (public.is_staff());

-- Compras
drop policy if exists fornecedores_delete on public.fornecedores;
create policy fornecedores_delete on public.fornecedores for delete to authenticated using (public.is_staff());
drop policy if exists pedidos_compra_delete on public.pedidos_compra;
create policy pedidos_compra_delete on public.pedidos_compra for delete to authenticated using (public.is_staff());
drop policy if exists pedidos_compra_cotacoes_delete on public.pedidos_compra_cotacoes;
create policy pedidos_compra_cotacoes_delete on public.pedidos_compra_cotacoes for delete to authenticated using (public.is_staff());
drop policy if exists pedidos_compra_itens_delete on public.pedidos_compra_itens;
create policy pedidos_compra_itens_delete on public.pedidos_compra_itens for delete to authenticated using (public.is_staff());

-- Processos (mapa de processos)
drop policy if exists processos_write on public.processos;
create policy processos_write on public.processos for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists areas_processos_write on public.areas_processos;
create policy areas_processos_write on public.areas_processos for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists area_gaps_write on public.area_gaps;
create policy area_gaps_write on public.area_gaps for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists processo_steps_write on public.processo_steps;
create policy processo_steps_write on public.processo_steps for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists processo_inputs_write on public.processo_inputs;
create policy processo_inputs_write on public.processo_inputs for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists processo_outputs_write on public.processo_outputs;
create policy processo_outputs_write on public.processo_outputs for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists processo_ferramentas_write on public.processo_ferramentas;
create policy processo_ferramentas_write on public.processo_ferramentas for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists processo_kpis_write on public.processo_kpis;
create policy processo_kpis_write on public.processo_kpis for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Fichas de produto (config e templates eram is_admin)
drop policy if exists fc_adm on public.ficha_config;
create policy fc_adm on public.ficha_config for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists ft_adm on public.ficha_templates;
create policy ft_adm on public.ficha_templates for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists fl_upd on public.ficha_links;
create policy fl_upd on public.ficha_links for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── 7. Tarefas / recados: ferramenta partilhada da equipa ───────────────────────
-- Tarefas passam a ser visíveis/geridas por todo o staff (atribuir, estados).
-- Recados (user_notes) mantêm-se privados entre remetente e destinatário.
drop policy if exists user_tasks_select on public.user_tasks;
create policy user_tasks_select on public.user_tasks
  for select to authenticated using (public.is_staff());
drop policy if exists user_tasks_update on public.user_tasks;
create policy user_tasks_update on public.user_tasks
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists user_tasks_delete on public.user_tasks;
create policy user_tasks_delete on public.user_tasks
  for delete to authenticated using ((created_by = auth.uid()) or public.is_staff());

drop policy if exists uta_select on public.user_task_assignees;
create policy uta_select on public.user_task_assignees
  for select to authenticated using (public.is_staff());
drop policy if exists uta_insert on public.user_task_assignees;
create policy uta_insert on public.user_task_assignees
  for insert to authenticated with check (public.is_staff() and (public.is_task_creator(task_id) or public.is_admin()));
drop policy if exists uta_update on public.user_task_assignees;
create policy uta_update on public.user_task_assignees
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists uta_delete on public.user_task_assignees;
create policy uta_delete on public.user_task_assignees
  for delete to authenticated using (public.is_staff() and (public.is_task_creator(task_id) or public.is_admin()));

drop policy if exists uta_att_select on public.user_task_attachments;
create policy uta_att_select on public.user_task_attachments
  for select to authenticated using (public.is_staff());
drop policy if exists uta_att_insert on public.user_task_attachments;
create policy uta_att_insert on public.user_task_attachments
  for insert to authenticated with check ((created_by = auth.uid()) and public.is_staff());
drop policy if exists uta_att_delete on public.user_task_attachments;
create policy uta_att_delete on public.user_task_attachments
  for delete to authenticated using ((created_by = auth.uid()) or public.is_staff());

drop policy if exists utc_select on public.user_task_comments;
create policy utc_select on public.user_task_comments
  for select to authenticated using (public.is_staff());
drop policy if exists utc_insert on public.user_task_comments;
create policy utc_insert on public.user_task_comments
  for insert to authenticated with check ((autor_id = auth.uid()) and public.is_staff());
drop policy if exists utc_update on public.user_task_comments;
create policy utc_update on public.user_task_comments
  for update to authenticated using ((autor_id = auth.uid()) or public.is_staff()) with check ((autor_id = auth.uid()) or public.is_staff());
drop policy if exists utc_delete on public.user_task_comments;
create policy utc_delete on public.user_task_comments
  for delete to authenticated using ((autor_id = auth.uid()) or public.is_staff());

drop policy if exists uth_select on public.user_task_history;
create policy uth_select on public.user_task_history
  for select to authenticated using (public.is_staff());

drop policy if exists task_estados_admin on public.task_estados;
create policy task_estados_admin on public.task_estados
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists user_notif_prefs_select on public.user_notification_prefs;
create policy user_notif_prefs_select on public.user_notification_prefs
  for select to authenticated using ((user_id = auth.uid()) or public.is_staff());

-- Recados: qualquer staff pode enviar; leitura mantém-se privada (destinatário/remetente).
drop policy if exists user_notes_insert on public.user_notes;
create policy user_notes_insert on public.user_notes
  for insert to authenticated with check (public.is_staff() and from_user = auth.uid());

-- ── 8. Storage (buckets) — apagar/gerir passa a ser de todo o staff ─────────────
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects
  for delete to authenticated using (bucket_id = 'equipamentos-media' and public.is_staff());

drop policy if exists assinaturas_delete on storage.objects;
create policy assinaturas_delete on storage.objects
  for delete to authenticated using (bucket_id = 'assinaturas' and public.is_staff());

drop policy if exists contratos_aluguer_storage_delete on storage.objects;
create policy contratos_aluguer_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'contratos-aluguer' and public.is_staff());

drop policy if exists folhas_obra_docs_delete on storage.objects;
create policy folhas_obra_docs_delete on storage.objects
  for delete to authenticated using (bucket_id = 'folhas-obra-docs' and public.is_staff());

-- Faturas de equipamento (compra/saída): decisão de abrir a todo o staff.
drop policy if exists faturas_select on storage.objects;
create policy faturas_select on storage.objects
  for select to authenticated using (bucket_id = 'faturas' and public.is_staff());
drop policy if exists faturas_insert on storage.objects;
create policy faturas_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'faturas' and public.is_staff());
drop policy if exists faturas_delete on storage.objects;
create policy faturas_delete on storage.objects
  for delete to authenticated using (bucket_id = 'faturas' and public.is_staff());

-- Anexos de tarefas
drop policy if exists tarefas_anexos_select on storage.objects;
create policy tarefas_anexos_select on storage.objects
  for select to authenticated using (bucket_id = 'tarefas-anexos' and public.is_staff());
drop policy if exists tarefas_anexos_insert on storage.objects;
create policy tarefas_anexos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'tarefas-anexos' and public.is_staff());
drop policy if exists tarefas_anexos_delete on storage.objects;
create policy tarefas_anexos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'tarefas-anexos' and public.is_staff());

-- NOTA: mantêm-se restritas a is_admin() (= role 'admin'):
--   • financial_document_access_log (log de acessos do cofre financeiro)
--   • admin_set_role (Gestão de Utilizadores)
