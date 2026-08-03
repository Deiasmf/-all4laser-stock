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

## Tracking automático (POR ATIVAR)

Estrutura pronta, **desligada** por omissão:
- Campos em `shipments_tracking`: `last_status_raw`, `last_status_at`,
  `carrier_code_api`, `auto_tracking_enabled` (default false).
- Adaptador: `src/lib/trackingProvider.ts` (stub `getTrackingStatus`).

Para ativar:
1. Criar conta no serviço agregador — **17track** ou **Ship24** (ambos cobrem
   expresso e carga aérea por AWB).
2. Obter a API key e defini-la no Vercel como `TRACKING_API_KEY`.
3. Implementar o adaptador em `trackingProvider.ts` (fetch à API do serviço) e
   mapear os `carrier_code_api` já semeados (`ups`, `fedex`, `dhl`, `nacex`,
   `ctt`, …).
4. Criar a rota de cron `POST /api/tracking/atualizar` (protegida por
   `CRON_SECRET`) que percorre os envios com `auto_tracking_enabled=true`,
   chama `getTrackingStatus`, e grava `last_status_raw`/`last_status_at`/`estado`.
5. Agendar o cron no `vercel.json` (ex.: `0 */6 * * *`).
