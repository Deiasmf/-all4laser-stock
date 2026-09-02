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

## Faturação (Keyinvoice → Contas Correntes → Comissões)
Fluxo completo do documento, desde a importação até à comissão do técnico.

- **Importar** (`/financeiro/keyinvoice`): aceita o export nativo do Keyinvoice e o
  modelo próprio (`tipo;numero;entidade_tipo;nome;nif;data;vencimento;valor;categoria;descricao`
  — as duas últimas colunas são opcionais). Faturas **e pró-formas**; associa ao
  cliente por NIF (ou nome); idempotente por `keyinvoice_doc_id`.
- **Categoria** (`servico_tecnico | aluguer | venda | outro`): proposta a partir da
  descrição/referência (`src/lib/categorizacaoFinanceira.ts`); corrigível na página
  Documentos. Uma categoria definida à mão (`categoria_manual`) nunca é sobreposta
  por reimportação. Sem correspondência fica "por classificar" (null).
- **Pró-forma**: entra no extrato mas **não conta para o saldo** (`afeta_saldo=false`)
  — não é documento fiscal.
- **Pagamento**: `valor_liquidado` + `data_pagamento` no próprio documento
  ("Marcar pago"). A alocação FIFO dos créditos (recibos/NC) soma-se a essa
  liquidação manual sem dupla contagem — ver `alocarFaturas`.
- **Pedidos de Pagamento** (`/financeiro/pedidos-pagamento`): tudo o que está por
  receber, com envio do pedido ao cliente — manual (1 clique) ou automático por
  documento (`lembretes_auto`) com cadência em `financeiro_config`. Cron nos dias
  úteis `/api/financeiro/pedidos-pagamento` (CRON_SECRET; `?dryrun=1` para testar).
  Histórico em `financeiro_pedidos_pagamento` — **não** confundir com
  `financeiro_cobrancas`, que é do módulo Recolhas (acompanhamento manual por estado).
- **Comissões** (`/tecnico/comissoes`): as faturas de cliente com categoria
  "serviço técnico" caem aqui por trigger (`sync_comissao_tecnica`). Atribui-se o
  técnico (e a folha de obra), retiram-se as **deslocações, alimentação e estadia**
  e a comissão é `(fatura − despesas) × %` — a % é por técnico
  (`tecnico_comissao_taxas`, definida só por admin/financeiro) e fica gravada na
  linha ao apurar. Estados: por apurar → apurada → paga.
  Se o documento deixar de ser serviço técnico (ou for apagado), a linha fica
  `origem_anulada` e sai do apuramento, sem perder o histórico.
- **Acessos**: tudo o que é financeiro continua em `has_financeiro_access()`; as
  comissões vivem na área técnica e são geríveis por `is_staff()`, mas a taxa (%)
  só admin/financeiro pode alterar.
