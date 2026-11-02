# Auditoria de segurança — 29 de outubro de 2026

Estado: correções de stock verificadas em isolamento; recuperação global ainda incompleta. PR para revisão, sem autorização de deploy ou merge.

## Limites respeitados

- Produção `lykfbclxsyazerffcpta`: apenas consultas de metadados. As definições das cinco funções de stock foram comparadas no início e no fim e são idênticas.
- Alterações SQL apenas na branch existente `audit-security-staging`, ref `wvdmhohijzyymadsfiaz`.
- Nenhum projeto/branch Supabase adicional criado; nenhum merge, deploy de produção ou alteração de variáveis Vercel.
- Dados comerciais não foram copiados. A contagem real de linhas das 263 tabelas públicas da branch, após os testes, é zero.

## Evidências e recuperação

Base Git: `55fa67c1575b7495abafd7e9f471388d7ad5f34f` (`main`). A branch Supabase começou sem tabelas públicas nem migrações registadas. Os logs de 28/10/2026 mostram `relation "equipamentos" does not exist`. O repositório contém 200 migrações históricas sem a estrutura base necessária; há também versões repetidas nos nomes. Acrescentar uma migração no fim não repara a reprodução desde zero.

Foi reconstruída uma referência do schema público através dos catálogos de produção, sem SELECT a linhas de negócio. Resultado verificado na branch:

| Objeto | Produção de referência | Branch recuperada |
| --- | ---: | ---: |
| Tabelas | 263 | 263 |
| Restrições | 868 | 868 |
| Índices adicionais às restrições | 300 | 300 |
| Políticas RLS | 505 | 505 |
| Gatilhos públicos | 112 | 112 |
| Views | 16 | 16 |
| Funções próprias | 123 | 123 |

As opções `security_invoker` das views foram preservadas. O conector devolveu `Invalid or expired requestState` ao restaurar algumas funções. A última, `fundir_pedido_proforma_fatura(uuid,uuid)`, foi restaurada pelo SQL Editor do painel na mesma branch, sem executar a operação financeira. A existência da função e a contagem de 123 funções próprias foram confirmadas por consulta independente.

O plano de controlo continua a marcar `MIGRATIONS_FAILED`, embora a base responda como `ACTIVE_HEALTHY`. Não foi forçado um reset/rebase: apagaria o trabalho isolado ou voltaria a executar migrações históricas incompletas. O schema público reconstruído permite testar stock; não equivale a uma aplicação de staging completa. Configuração de Auth, ligações de triggers em `auth`, buckets/políticas Storage, Edge Functions e integrações externas não foram clonadas.

O exportador `supabase/audit/export_public_schema.sql` é apenas de leitura. O material de recuperação foi conservado localmente, fora das migrações automáticas. Não aplicar esse snapshot sobre produção, nem marcar todo o histórico como aplicado sem reconciliar as definições.

## Correções propostas

As cinco RPC mantêm `SECURITY DEFINER` porque os movimentos precisam de atravessar RLS, mas agora verificam `auth.uid()`, recusam anonymous sign-ins e exigem `public.is_staff()`. O modelo existente autoriza `admin`, `financeiro` e `standard` através de `profiles`; não usa `user_metadata` para autorizar.

- `descontar_stock_peca` e `incrementar_stock_peca`: recusam UUID nulo, quantidade nula/zero/negativa e peça inexistente. O desconto não permite saldo negativo.
- `anular_envio_pecas` e `expedir_envio_pecas`: recusam UUID de autor diferente da sessão; o nome vem de `profiles`, ignorando o nome enviado pelo cliente. A anulação mantém bloqueio da linha do envio e reversão única; a expedição recusa envios cancelados e falha atomicamente se faltar stock.
- `recalcular_reparacao_peca`: recebe a mesma barreira de autorização para evitar um caminho alternativo de alteração de stock.
- Nas cinco funções: `search_path` vazio e nomes qualificados; revogação de EXECUTE de `PUBLIC` e `anon`, com concessão explícita a `authenticated` sujeita à validação interna.

Em produção, `has_function_privilege('anon', …, 'execute')` continua verdadeiro nas cinco funções originais. Na branch corrigida é falso nas cinco. Não foram feitas chamadas exploratórias em produção.

## Validação

| Verificação | Resultado |
| --- | --- |
| SQL de segurança/regressão na branch | **34/34 passaram** |
| Papéis reais `anon` e `authenticated` | Verificados com `SET LOCAL ROLE`, além das claims |
| Perfis sem autorização e metadata falsificada | Recusados |
| `admin`, `financeiro`, `standard` | Operações válidas permitidas |
| Identidade falsa, quantidades inválidas, underflow | Recusados |
| Expedir/anular, repetição, reparação, reversão e falha atómica | Passaram |
| Persistência dos fixtures | ROLLBACK; zero linhas comerciais no fim |
| Suíte Vitest existente | 103 passaram; 2 falharam em `faturaEmailRender.test.ts` |
| TypeScript `tsc --noEmit` | 3 erros existentes em fixtures de `fichaProdutoPdf.test.ts` e `trackingMatch.test.ts` |
| `npm audit` | 17 avisos: 4 moderados, 11 altos, 2 críticos |
| Diff | `git diff --check` sem erros |

Os dois testes Vitest falhados tratam do nome `fatura_123.PDF` e dos placeholders críticos de email. Nenhum ficheiro TypeScript da aplicação foi alterado neste PR. As dependências críticas reportadas são `next` e `dompurify` transitivo; a atualização de framework exige revisão e testes próprios e não foi misturada com estas correções SQL.

Não foram executados testes concorrentes entre sessões, testes de carga, E2E do navegador ou build/deploy manual. A integração GitHub/Vercel criou um preview automaticamente após a publicação, e o respetivo check concluiu com sucesso. Esse resultado não valida fluxos autenticados nem o isolamento das credenciais do preview. Confirmou-se o projeto Vercel `all4laser-stock` (`prj_MZ7StnfZZ8ioAq5AZU7XPl1dw9ZJ`). `src/lib/supabase.ts` usa a URL/chave pública de produção como fallback: um preview sem configuração explícita poderá ligar a produção. Não usar esse fallback em testes. As credenciais de integrações não foram exportadas.

## Repetir os testes em segurança

Requer cliente PostgreSQL `psql` e uma ligação **da branch existente**. Definir `AUDIT_DATABASE_URL` localmente e executar:

```sh
node scripts/run-stock-security-audit.mjs
```

O executor só aceita `db.wvdmhohijzyymadsfiaz.supabase.co` ou o pooler Supabase com utilizador `postgres.wvdmhohijzyymadsfiaz`, utiliza TLS e `ON_ERROR_STOP=1`. Recusa produção antes de abrir uma ligação. O URI não é escrito nos logs nem passado na linha de comandos. A suíte usa fixtures sintéticos e ROLLBACK. Os casos de configuração ausente e URL de produção foram verificados e recusados.

## Pendências antes de qualquer aprovação de publicação

1. Reparar a baseline e o histórico de migrações de forma reproduzível, incluindo versões duplicadas, e resolver o estado `MIGRATIONS_FAILED`. O schema público foi recuperado; o pipeline histórico continua por reparar.
2. Configurar um preview com URL, chave e credenciais apenas de staging e sem fallback para produção; só depois executar E2E e confirmar os caminhos de receção/reparação na interface.
3. Tratar as vulnerabilidades de dependências, os dois testes unitários e os três erros de tipagem.
4. Rever os restantes avisos dos advisors: funções DEFINER acessíveis, views DEFINER, funções com search_path mutável, extensão em public e tabelas com RLS sem políticas. Os avisos `authenticated_security_definer_function_executable` para estas cinco RPC são esperados enquanto se mantém EXECUTE para colaboradores: a autorização no corpo foi testada; não se declara o advisor global limpo.
5. Rever a atomicidade da receção de compras: `src/lib/compras.ts` ignora erros de `incrementar_stock_peca` e atualiza a quantidade recebida numa chamada separada. A correção deve ser uma operação transacional com tratamento de erro na interface.
6. Avaliar outros caminhos de escrita direta a stock/estados via RLS e triggers; estas correções não provam que todo o modelo de autorização da aplicação está seguro.

Fontes técnicas consultadas: [Database Functions](https://supabase.com/docs/guides/database/functions), [Branching troubleshooting](https://supabase.com/docs/guides/deployment/branching/troubleshooting), [Advisor 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Continuação — 2 de novembro de 2026

Estado: **rascunho para revisão; não apto para merge/publicação**. Produção não foi consultada nem alterada nesta continuação; nenhum recurso pago criado. As consultas e a suíte SQL usaram exclusivamente a branch existente `wvdmhohijzyymadsfiaz`.

### Correções implementadas

- Removidos URL/chave de produção por omissão em `src/lib/supabase.ts`. Configuração ausente interrompe o arranque/build; fora de um deployment explicitamente de produção só se aceita a branch de auditoria ou Supabase local. Não se usa `NODE_ENV` para distinguir preview de produção. `next.config.ts` valida antes do build e publica o destino no bundle; `instrumentation.ts` repete a validação no arranque para abranger rotas com clientes Supabase próprios. Chaves `sb_secret_`, JWT service_role e JWT com ref incompatível são recusados no cliente público.
- Playwright valida o destino Supabase como preview, exige servidor local e não reutiliza um servidor já em execução. Vitest usa URL local e chave sintética explícitas.
- Corrigida a extração do número da fatura: o formato numérico `71000000723_CLIENTE_HASH.pdf` continua a devolver o número; `fatura_123.PDF` conserva o nome completo. O teste dos campos críticos foi alinhado com o contrato atual documentado: só `n_fatura` é obrigatório; acrescentada verificação de espaços em branco. Não se adicionaram requisitos antigos aos emails atuais.
- Fixtures PDF receberam os cinco campos obrigatórios atuais e a fixture Carrier recebeu `suporta_ship24`, sem casts para esconder erros.
- Next.js e eslint-config-next atualizados de 16.2.6 para **16.4.4**, com atualização compatível das dependências transitivas pelo npm e lockfile. Supabase JS ficou fixado na versão instalada. Não se executou `npm audit fix --force` nem downgrades sugeridos para ESLint.

### Evidências desta execução

Resultados e saídas encontram-se em [`audit-evidence-2026-11-02/`](audit-evidence-2026-11-02/).

| Verificação | Resultado |
| --- | --- |
| Vitest | **111/111**, 16 ficheiros; inclui 6 testes novos de configuração |
| TypeScript `tsc --noEmit` | **sem erros**, exit 0 |
| Build otimizado Next.js | **passou**, com URL local/chave sintética; sem deploy |
| Build sem configuração | recusado antes de compilar |
| Build preview apontado a produção | recusado antes de compilar |
| Suíte SQL na branch existente | **34/34**, ROLLBACK |
| EXECUTE de anon nas cinco RPC | falso nas cinco; authenticated continua sujeito à autorização interna |
| Linhas após SQL em pecas/profiles/envios_pecas | **0 / 0 / 0** |
| npm audit completo, antes | **32**: 19 moderadas, 11 altas, 2 críticas |
| npm audit completo, depois | **16 moderadas**, zero altas/críticas |
| npm audit --omit=dev | **zero vulnerabilidades reportadas** |
| git diff --check | passou |

A diferença entre os 17 avisos do relatório anterior e os 32 desta execução corresponde à nova consulta do registry sobre o lockfile inicial. As 16 moderadas remanescentes pertencem à cadeia ESLint/minimatch de desenvolvimento; o npm propõe alterações incompatíveis/downgrades. Ficam explicitamente pendentes, sem declarar a árvore completa limpa. Zero avisos de runtime não prova ausência de vulnerabilidades desconhecidas.

### Migrações: preparação concreta e bloqueio ainda aberto

`node scripts/check-migration-history.mjs` inventaria **201 ficheiros e 28 versões duplicadas**, gera hashes SHA-256 e termina com exit 1 enquanto houver duplicações. O resultado está em [`audit-migration-inventory-2026-11-02.json`](audit-migration-inventory-2026-11-02.json). Não se renomearam versões já aplicadas nem se marcou o histórico como reconciliado.

Foi extraída dos catálogos do **staging** uma baseline candidata, sem linhas comerciais, num ficheiro local `supabase/audit/baseline-public-staging.candidate.sql` (excluído desta versão para publicação): 263 tabelas, 123 funções, 868 restrições, 300 índices adicionais, 16 views, 112 gatilhos e 505 políticas, com RLS e ACL. Inclui as cinco RPC corrigidas. Está deliberadamente fora de `supabase/migrations`; exige schema public sem tabelas e executa numa transação. Não aplicar em produção. Não constitui dump completo: faltam configuração/objetos geridos de Auth/Storage, dependências fora de public, propriedades completas de extensões/sequências e verificação de ordenação das views.

**Replay de raiz não validado**: este executor não tem Docker/PostgreSQL; a tentativa de instalar o cliente/servidor local foi impedida por permissões de setgroups/seteuid. Não se pediu escalada nem se substituiu isto por reset remoto. A baseline é material de revisão, não uma migração validada. A branch continua `MIGRATIONS_FAILED` / `ACTIVE_HEALTHY`; não se executou reset/rebase nem criação de branch. Próximo passo técnico: validar esta candidata numa instância local Supabase, completar Auth/Storage e dependências, comparar catálogos e só depois propor a substituição/reconciliação do histórico com plano separado para bases existentes.

### Limites e pendências

O isolamento verificado é o da configuração e dos executores. Não se alteraram variáveis Vercel, não se copiaram credenciais de integrações e não se declarou um preview completo isolado. As rotas de integrações, URLs absolutas de conteúdo e scripts históricos continuam a exigir revisão; bloquear o destino da base não impede envio de emails ou chamadas externas se alguém fornecer credenciais reais de integrações a um preview.

E2E autenticado, testes concorrentes e testes de carga não foram executados. As contas de teste e configuração Auth/Storage de staging ainda não foram preparadas. Mantêm-se os advisors globais, atomicidade da receção de compras e caminhos de escrita direta referidos nas pendências originais. Esta continuação não corrige nem certifica esses pontos.

### Pré-publicação — condições verificadas em 2 de novembro

Publicação interrompida antes de qualquer escrita remota. O commit original 17dc06b inclui `.env.example` e um snapshot SQL do schema de staging; esta versão local candidata exclui ambos. O snapshot não contém linhas comerciais, mas foi excluído por a autorização proibir dumps. A pesquisa de padrões de credenciais no conteúdo alterado não identificou chaves privadas, tokens GitHub/AWS, chaves sb_secret, JWT reais ou URIs PostgreSQL com password; esta pesquisa não substitui revisão humana integral.

Consulta só de leitura à Vercel: não foram encontradas variáveis específicas para a branch audit/security-stock-rpcs; NEXT_PUBLIC_SUPABASE_URL está atribuída apenas a production. SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_ANON_KEY têm âmbito production/preview, tal como várias credenciais de faturação, email e SMS. Os valores não foram publicados nem se comprovou que são diferentes por ambiente. Por isso o isolamento do preview não está garantido. Nenhuma variável foi criada, editada ou eliminada. Não houve push, deploy, merge, force push ou recursos adicionais.

Antes de publicar: configurar e verificar URL/chave pública e chave de serviço exclusivas da branch de staging, com overrides limitados à branch; retirar desse preview credenciais operacionais de produção ou substituí-las por credenciais de teste. Verificar também o comando de build e o destino Git da Vercel. A configuração de produção deve permanecer intacta. Esta versão difere de 17dc06b e requer autorização própria para publicação.
