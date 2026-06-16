# Testes E2E (Playwright)

Testes ponta-a-ponta que correm a app num browser real e iniciam sessão com uma
conta de teste.

## Pré-requisitos (uma vez)

1. Instalar o browser do Playwright:
   ```bash
   npx playwright install chromium
   ```
2. Definir as credenciais da **conta de teste** no `.env.local` (gitignored):
   ```
   E2E_EMAIL=conta-de-teste@all4laser.com
   E2E_PASSWORD=********
   ```
   Usa uma conta dedicada aos testes (role `viewer` chega), não a tua conta pessoal.

## Correr

```bash
npm run test:e2e        # corre os testes (arranca o `next dev` automaticamente)
npm run test:e2e:ui     # modo interativo (UI do Playwright)
```

Por omissão corre contra `http://localhost:3000`. Para apontar a outro ambiente:

```bash
E2E_BASE_URL=https://app.all4laser.com npm run test:e2e
```

## Como funciona

- `auth.setup.ts` — faz login uma vez e guarda a sessão em `e2e/.auth/user.json`
  (ignorado pelo git). Os restantes testes reutilizam essa sessão.
- `stock-filtros.spec.ts` — verifica que os filtros da página de stock são
  guardados em `sessionStorage` e restaurados ao navegar para outra página e voltar.
