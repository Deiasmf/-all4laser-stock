# Módulo Tracking (Área Administrativa)

Separador que centraliza **todos os envios** (expresso e carga aérea) com número
de tracking / AWB / carta de porte, sincronizados automaticamente a partir dos
outros módulos.

## Como funciona

- **Tabelas** (`supabase/migrations/20260803_shipments_tracking.sql`):
  - `carriers` — transportadoras/companhias geríveis (expresso + carga aérea).
  - `shipments_tracking` — os envios.
  - `shipments_tracking_sources` — origens (quando o mesmo tracking vem de >1 sítio).
- **Role**: `administrativo` (`20260803_tracking_role_administrativo.sql`).
  Acesso via `has_administrativo_access()` = admin ∪ administrativo.
  Atribuir o role em `/definicoes/utilizadores`.
- **Sincronização automática**: triggers Postgres em `envios_pecas` e
  `equipamentos` chamam `sync_shipment_tracking(...)`. Robusto — corre
  independentemente de quem cria/edita o registo de origem. Anular a origem
  marca `origem_anulada=true` (não apaga).
- **Deduplicação**: coluna gerada `dedup_key` (tracking ∨ AWB) com índice único;
  o mesmo número vindo de dois sítios fica numa só entrada, com as duas origens
  em `shipments_tracking_sources`.

## Deteção e validação

- **Transportadora expresso**: por regex (`carriers.deteta_regex`) — UPS `1Z…`,
  FedEx 12/15 dígitos, DHL 10 dígitos. Override manual sempre disponível.
- **Companhia aérea**: pelo prefixo IATA da AWB (`carriers.prefixo_awb`).
- **AWB**: valida o dígito de controlo (8.º dígito = série mod 7); avisa se
  inválido, sem bloquear a gravação.

## Links de seguimento

- Expresso: `carriers.url_template` com `{tracking}`.
- Carga aérea: se a companhia tiver `url_template` próprio, é usado (prioridade);
  senão abre o `track-trace.com/aircargo` e copia a AWB para o clipboard (o site
  é uma SPA e não expõe deep-link estável por query string).

## Tracking automático (Ship24)

Integração com o **Ship24** (docs.ship24.com). O Ship24 é conhecido **apenas**
pelo adaptador `src/lib/trackingProvider.ts` e pela rota de webhook — trocar de
fornecedor = escrever outro adaptador com a mesma interface, sem mudar mais nada.

**Peças:**
- `shipments_tracking`: `auto_tracking_enabled`, `estado_manual`,
  `carrier_code_api`, `ship24_tracker_id`, `last_status_*`, `last_event_*`.
- `tracking_updates`: linha temporal de eventos por envio (idempotência por
  `event_id`).
- `tracking_integracao`: estado/config (ativo, plano, quota, cron, webhook, erros).
- Adaptador: `src/lib/trackingProvider.ts` (criar/consultar/parar tracker,
  `GET /couriers`, mapeamento de estados, parse de webhook).
- Automação: `src/lib/trackingAuto.ts` (registar, aplicar eventos, reconciliar) —
  service_role.
- Webhook: `POST /api/webhooks/ship24` (valida `Authorization: Bearer` contra
  `SHIP24_WEBHOOK_SECRET`; idempotente).
- Cron: `GET /api/tracking/atualizar` (Vercel Cron diário, `CRON_SECRET`) —
  regista pendentes + reconcilia, respeitando o rate limit.
- Painel: `/admin-dept/tracking/integracao`.

**Variáveis de ambiente (Vercel):** `SHIP24_API_KEY`, `SHIP24_WEBHOOK_SECRET`,
`CRON_SECRET` (já existente).

**Ativar:**
1. Criar conta Ship24, obter API key, definir `SHIP24_API_KEY` no Vercel.
2. No dashboard Ship24, configurar o Webhook URL
   `https://app.all4laser.com/api/webhooks/ship24` e copiar o Webhook Secret para
   `SHIP24_WEBHOOK_SECRET`.
3. Correr `GET /couriers` (via adaptador) para confirmar/mapear os
   `carrier_code_api` e marcar `carriers.suporta_ship24`.
4. Ligar a integração no painel e ligar `auto_tracking_enabled` nos envios (⚡).

Envios de transportadoras sem cobertura Ship24 ficam em modo manual, sem erros.
Estado terminal (entregue/devolvido) → o tracker é desativado (liberta quota).
