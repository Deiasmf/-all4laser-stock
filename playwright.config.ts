import { defineConfig, devices } from '@playwright/test'

// Carrega o .env.local (gitignored) para os testes E2E — inclui as credenciais
// da conta de teste (E2E_EMAIL / E2E_PASSWORD). Em CI as variáveis vêm do ambiente.
try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local pode não existir (ex: CI) — segue com as variáveis do ambiente
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    // 1) Faz login uma vez e guarda a sessão em e2e/.auth/user.json
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // 2) Os testes reutilizam essa sessão (já autenticados)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  // Arranca o servidor de desenvolvimento automaticamente (reutiliza se já estiver a correr)
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
