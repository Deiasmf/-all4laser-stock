@AGENTS.md

## Utilizadores e permissões
Só DUAS áreas são restritas: o **Financeiro** e a **Gestão de Utilizadores**. Todo o
staff interno pode gerir o resto da app (criar, editar, apagar, Tracking, tarefas…).

3 roles:
- **admin**: só a Andreia (andreia.fernandes@all4laser.com) — acesso total, incluindo Financeiro e Gestão de Utilizadores
- **financeiro**: Vanessa Tavares — Financeiro + resto da app (sem Gestão de Utilizadores)
- **standard**: restantes membros — tudo MENOS o Financeiro e a Gestão de Utilizadores
- (o antigo role "administrativo" foi removido; o antigo "viewer" já era "standard")

Regras técnicas:
- Atribuição de roles: só admin, no ecrã /definicoes/utilizadores (RPC admin_set_role)
- Proteção real na BD por RLS (não apenas esconder menus):
  - Financeiro: `has_financeiro_access()` (= admin ou financeiro)
  - "Pode gerir" o resto: `is_staff()` (qualquer utilizador interno)
  - Gestão de Utilizadores: `is_admin()` (= role 'admin')
- No frontend (src/lib/auth.tsx): `isAdmin` significa "staff (pode gerir)", NÃO o role admin;
  para a Gestão de Utilizadores usar `isGestorUtilizadores` (= role 'admin')

## Módulo Tracking (Área Administrativa)
Separador `/admin-dept/tracking`: todos os envios com tracking / AWB / carta de porte.
Acesso: todo o staff (`is_staff()` via `has_administrativo_access()`). Código em
`src/app/admin-dept/tracking/` + `src/lib/tracking.ts` + `src/types/tracking.ts`.

- **Tabelas:** `shipments_tracking` (a entrada) e `shipments_tracking_sources` (ligações
  ao(s) documento(s) de origem).
- **Sincronização automática:** `sync_shipment_tracking()` (SECURITY DEFINER, chamada por
  triggers) cria/atualiza a entrada a partir dos Envios de Encomendas (`envios_pecas`),
  Equipamentos, Expedições, etc. — upsert idempotente por `(source_type, source_id)`.
  `origem`: manual | upload | ep | expedicao | encomenda | recolha | equipamento.
- **Origem apagada:** apagar o documento de origem marca a entrada como `origem_anulada`
  (fica "origem anulada", não conta para o dashboard).
- **Eliminação = soft delete:** `deleted_at`/`deleted_by`/`deleted_by_nome`. Eliminar (todo
  o staff) pede confirmação; se sincronizado, avisa da EP associada; a origem fica INTACTA;
  a sincronização **respeita** a eliminação (não ressuscita). Filtro "Eliminados" + Restaurar.
  A carta de porte anexada é removida do bucket ao eliminar (sem órfãos).
- **Carta de porte:** bucket privado `tracking-docs` (signed URLs) em `carta_porte_caminho`;
  `carta_porte_url` é a URL herdada do documento de origem.
- **Tabela:** colunas por ordem Entidade · Transportadora · AWB/Tracking · Tipo · Dir. ·
  Conteúdo · Origem · Estado · Expedição · Ações; em mobile vira cartões (entidade = título).
