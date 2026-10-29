# Auditoria de segurança — 29 de outubro de 2026

Estado: correções de stock verificadas em isolamento; recuperação global ainda incompleta. PR para revisão, sem autorização de deploy ou merge.

## Limites respeitados

- Produção `lykfbclxsyazerffcpta`: apenas consultas de metadados. As definições das cinco funções de stock foram comparadas no início e no fim e são idênticas.
- Alterações SQL apenas na branch existente `audit-security-staging`, ref `wvdmhohijzyymadsfiaz`.
- Nenhum projeto/branch adicional criado; nenhum merge, deploy de produção ou alteração de variáveis Vercel.
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

Não foram executados testes concorrentes entre sessões, testes de carga, E2E do navegador ou build/deploy Vercel. Confirmou-se o projeto Vercel `all4laser-stock` (`prj_MZ7StnfZZ8ioAq5AZU7XPl1dw9ZJ`). `src/lib/supabase.ts` usa a URL/chave pública de produção como fallback: um preview sem configuração explícita poderá ligar a produção. Não usar esse fallback em testes. As credenciais de integrações não foram exportadas.

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
