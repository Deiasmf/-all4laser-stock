# Plano de Implementação — Módulo Marketing e Publicações

> Briefing de origem: `CLAUDE_MODULO_MARKETING_PUBLICACOES_ALL4LASER.md` (4 set 2026).
> Este documento mapeia esse briefing à arquitetura **real** do all4laser-stock e
> define o que se constrói, por que ordem, e onde. Atualizado à medida que avança.

## 1. Arquitetura existente (o que se reutiliza)

| Necessidade | Já existe no projeto | Ficheiro(s) |
|---|---|---|
| Navegação / menu | `NAV` + `TITULOS` em `Shell.tsx` (entrada `/marketing` já presente) | `src/components/Shell.tsx` |
| Design system | Vars `--a4l-*` + objetos de estilo inline; `.a4l-card`; `EmConstrucao` | `src/app/globals.css`, `src/components/EmConstrucao.tsx` |
| Autenticação/roles | `useAuth()` → `isAdmin`(=staff), `isFinanceiro`(=admin/financeiro), `isGestorUtilizadores`(=admin) | `src/lib/auth.tsx` |
| Cliente Supabase (browser) | `supabase` (anon) | `src/lib/supabase.ts` |
| Cliente Supabase (servidor) | service-role em rotas API (validação de sessão + role) | `src/app/api/**/route.ts` |
| RLS helpers | `is_staff()`, `has_financeiro_access()`, `is_admin()` | migrações `supabase/migrations/` |
| Storage | buckets públicos/privados + signed URLs; helper de upload | `src/lib/mediaUpload.ts`, buckets `equipamentos-media`, `tracking-docs` |
| Cron/jobs | GitHub Actions → rota GET protegida por `CRON_SECRET`, `maxDuration` | `.github/workflows/*.yml` |
| Tarefas / notificações internas | `user_tasks`, `user_task_comments`, `user_notes` | migração `20260727_minha_area_*` |
| Catálogo de equipamentos | `equipamentos` (uuid id, `marca`, `modelo`, `serial_number` — texto livre) | `src/types/equipamento.ts` |
| Marcas + fuzzy match | tabela `marcas` + RPC `marcas_semelhantes()` (pg_trgm) | `src/lib/marcas.ts` |
| Clientes | `clientes` (id, nome, nif, pais, nacional, email…) | `src/types/cliente.ts`, `src/lib/clientes.ts` |
| Mercados/países | **Não há tabela**; usa-se `'nacional'|'internacional'` + país texto livre | `src/lib/situacaoAlugueres.ts` |
| Convenções de migração | `YYYYMMDD_desc.sql`; `gen_random_uuid()`, `set_updated_at()`, `criado_por[_nome]`, soft-delete, contador+`gerar_numero_*`, RLS+grants | `supabase/migrations/20260831_pedidos_fatura.sql` (exemplo completo) |
| Exportação CSV/XLSX | `BotaoExportar` + `exportar.ts` | `src/components/BotaoExportar.tsx` |
| PDF | `BotaoPdf` | `src/components/BotaoPdf.tsx` |

**Princípio:** não criar auth, DB, storage, filas ou libs redundantes. Namespace de tudo: `marketing_*`.

## 2. Modelo de acessos (mapeado às regras do projeto)

O projeto só restringe **Financeiro** e **Gestão de Utilizadores**. Marketing é uma
área de gestão normal → **todo o staff** (`is_staff()`) pode criar/editar/aprovar
conteúdo. A **única exceção** é a **aprovação de orçamento** de promoção paga, que
fica em `has_financeiro_access()` (= admin/financeiro) — corresponde ao papel
"Aprovador de Orçamento" do briefing.

Papéis funcionais do briefing (§15) → como se implementam aqui:
- Leitor / Editor / Revisor / Aprovador / Publicador → **todos = `is_staff()`** (capacidades por UI + estado, não por role de BD).
- **Aprovador de Orçamento** → `has_financeiro_access()`.
- **Administrador** (ligar contas sociais, feature flags) → `is_admin()` (role admin).

A publicação real e as campanhas pagas ficam **desligadas por feature flag** até validação (Fase 2/3).

## 3. Modelo de dados — Fase 1 (`marketing_*`)

Todas as tabelas com: `id uuid pk default gen_random_uuid()`, `criado_por uuid`,
`criado_por_nome text`, `created_at`, `updated_at` (trigger `set_updated_at`),
soft-delete `deleted_at/deleted_by/deleted_by_nome`. RLS: CRUD por `is_staff()`;
`grant … to authenticated` + `grant all … to service_role`.

1. **`marketing_campaigns`** — campanhas editoriais/comerciais. Campos: `nome`,
   `objetivo_comercial`, `linha_negocio` (check: Venda/Aluguer/Assistência Técnica/Formação/Institucional),
   `oferta`, `mercados text[]`, `publicos`, `data_inicio`, `data_fim`, `idiomas text[]`,
   `canais text[]`, `landing_url`, `kpi_principal`, `kpis_secundarios`, `responsavel_id`,
   `estado` (rascunho/ativa/encerrada), `notas`, `numero` (CAMP-AAAA-NNNN).
2. **`marketing_posts`** — conteúdo editorial (o "post"). Campos: `titulo_interno`,
   `campaign_id` (fk, nullable), `linha_negocio`, `objetivo`
   (Notoriedade/Educação/Prova/Captação/Conversão/Retenção), `mercados text[]`,
   `idioma_base`, `publico_alvo`, `responsavel_id`, `prioridade`, `notas_internas`,
   `canva_url`, `estrategia_promocao` (Organica/CandidataPaga/PagaAprovada),
   `estado_global` (máquina de estados §6.3), `numero` (PUB-AAAA-NNNN).
3. **`marketing_post_variants`** — variante por plataforma. Campos: `post_id` (fk),
   `plataforma` (instagram_feed/instagram_story/instagram_reel/facebook/linkedin),
   `account_ref` (texto na Fase 1; fk a `marketing_social_accounts` na Fase 2),
   `idioma`, `texto`, `titulo`, `cta`, `url_destino`, `utm jsonb`, `hashtags text[]`,
   `primeiro_comentario`, `alt_text`, `formato` (imagem/carrossel/video/reel/story/documento/texto),
   `data_agendada timestamptz` (UTC), `estado` (máquina de estados própria).
4. **`marketing_media_assets`** — biblioteca. Campos: `nome_interno`, `tipo`
   (imagem/video/documento/canva_link), `caminho` (bucket), `thumbnail_caminho`,
   `canva_url`, `marca`, `modelo`, `campaign_id`, `mercado`, `idioma`, `origem`,
   `proprietario_id`, `direitos`, `direitos_validade`, `versao`, `hash` (dedup),
   `etiquetas text[]`, `estado` (rascunho/aprovado/expirado/arquivado).
5. **`marketing_post_media`** — ordem de media numa variante: `variant_id` (fk),
   `asset_id` (fk), `ordem int`.
6. **`marketing_post_equipment`** — 1..N equipamentos por post: `post_id` (fk),
   `equipamento_id` (fk `equipamentos`), `marca`, `modelo` (denormalizados).
7. **`marketing_post_approvals`** — revisões/aprovações: `post_id` (fk),
   `variant_id` (fk, nullable), `acao` (submeteu/pediu_alteracoes/aprovou/rejeitou),
   `por_id`, `por_nome`, `comentario`, `created_at`.
8. **`marketing_compliance_checks`** — checklist (§7): `post_id` (fk), `item` (chave),
   `estado` (confirmado/nao_aplicavel/pendente), `justificacao`, `por_id`, `por_nome`, `created_at`.
9. **`marketing_paid_proposals`** — proposta de promoção paga: `post_id` (fk),
   `motivo`, `objetivo` (alcance/trafego/leads/conversao), `mercado`, `publico`,
   `periodo_inicio/fim`, `orcamento_proposto numeric(12,2)`, `estado`
   (proposta/aprovada/rejeitada), **`aprovado_por_id/nome`**, `aprovado_em`,
   `campanha_externa_ref` (ID/URL do gestor de anúncios), `observacoes`.

**Fase 2/3 (não criar agora):** `marketing_social_accounts` (OAuth),
`marketing_publication_schedules`, `marketing_publication_attempts`,
`marketing_publication_metrics`.

**Regras de integridade:** nunca apagar posts/variantes/métricas ao remover uma
campanha ou conta (cascades conservadoras: `on delete set null`). Índices em
`estado`, `data_agendada`, `plataforma`, `campaign_id`. Constraint anti-duplicação
por `(account_ref, data_agendada)` como aviso (não bloqueante na app).

## 4. Máquina de estados (§6.3)

`IDEA → DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED`,
mais `CHANGES_REQUESTED`, `FAILED`, `CANCELLED`, `ARCHIVED`.
Regras aplicadas em `src/lib/marketing.ts` **e** validadas no servidor:
editar copy/media/CTA/mercado/data depois de `APPROVED` → volta a `IN_REVIEW`
(invalida aprovação); alterações só internas não invalidam.

## 5. Estrutura de ficheiros a criar

```
src/app/marketing/
  page.tsx                 # Overview (grelha de cartões p/ as 7 secções) — substitui EmConstrucao
  dashboard/page.tsx       # Dashboard operacional (§4)
  calendario/page.tsx      # Calendário editorial (§5) — mês/semana/lista
  publicacoes/
    page.tsx  novo/page.tsx  [id]/page.tsx
  campanhas/
    page.tsx  nova/page.tsx  [id]/page.tsx
  biblioteca/page.tsx      # Biblioteca de media (§10)
  relatorios/page.tsx      # Relatórios (§13) — Fase 3 real; placeholder na 1
  configuracoes/page.tsx   # Contas sociais, flags (§11/§26) — Fase 2; placeholder na 1
src/types/marketing.ts     # Tipos (Campanha, Post, Variante, MediaAsset, …)
src/lib/marketing.ts       # Data helpers (CRUD + máquina de estados + import)
supabase/migrations/2026XXXX_marketing_fase1.sql
docs/social-integrations.md            # Fase 2
docs/marketing-publications-user-guide.md
docs/marketing-publications-release-checklist.md
.env.example               # placeholders p/ Meta/LinkedIn/Canva/feature flags
```

Registar rotas em `Shell.tsx`: converter a entrada `/marketing` num grupo com
`filhos` (Dashboard, Calendário, Publicações, Campanhas, Biblioteca, Relatórios,
Configurações) e acrescentar os `TITULOS`.

## 6. Faseamento e entregas

### Fase 1 — Organização e aprovação (foco atual)
Navegação, Overview, Dashboard, Calendário, Publicações+variantes, Campanhas,
Biblioteca (+link Canva), checklist de conformidade, workflow de aprovação,
classificação orgânica/paga + aprovação de orçamento, importação CSV/XLSX,
permissões e auditoria. **Sem publicação real.**

### Fase 2 — Publicação automática
`marketing_social_accounts` + OAuth Meta/LinkedIn, providers (`SocialProvider`),
scheduler (cron GitHub Actions → rota `GET /api/marketing/publicar` com
`CRON_SECRET`, idempotência, retries, feature flag `MARKETING_PUBLISH_ENABLED`).

### Fase 3 — Analytics
Sincronização de métricas, dashboard de resultados, relatórios/exportação,
análise por plataforma/equipamento/mercado/horário (com limiar de amostra).

## 7. Segurança (§2.2 / §19)

- Nada é publicado sem `APPROVED`; nenhuma campanha paga é ativada automaticamente.
- Tokens OAuth cifrados no servidor, nunca no browser/logs/repo (Fase 2).
- Toda a ação sensível fica em `marketing_post_approvals` / audit trail.
- Feature flag desliga publicação automática.
- Uploads: validar MIME + tamanho; bucket privado `marketing-media` + signed URLs.

## 8. Testes (§21) e Definition of Done (§24)

Unitários: transições de estado, invalidação de aprovação, permissões, timezone/UTC,
validações de media, idempotência, regras de aprovação paga. Integração/E2E: fluxo
Editor→Revisor→Aprovador→Publicador; import com linhas válidas/ inválidas/duplicadas;
proposta paga sem ativar orçamento. `lint`/`typecheck`/`build` verdes; sem segredos;
verificado em desktop e telemóvel; parar antes de ligar publicação real (pedir
autorização à Andreia).

## 9. Decisões pendentes (§26 — não inventar)

Credenciais Meta/LinkedIn, IDs de páginas/contas, aprovadores definitivos, limites
de orçamento, mercados por oferta, retenção de dados. Ficam **configuráveis** e
documentadas como pendentes; publicação real desligada até validação.
