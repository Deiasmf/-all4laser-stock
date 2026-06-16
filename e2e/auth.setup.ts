import { test as setup, expect } from '@playwright/test'
import path from 'node:path'

// Ficheiro onde fica guardada a sessão autenticada (reutilizada pelos testes)
const ficheiroAuth = path.join(__dirname, '.auth', 'user.json')

setup('autenticar com a conta de teste', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Faltam credenciais: define E2E_EMAIL e E2E_PASSWORD no .env.local ' +
        '(usa uma conta de teste dedicada, não a tua conta pessoal).'
    )
  }

  await page.goto('/login')

  // Os inputs do login não têm label associada por id, por isso usamos o tipo
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Login com sucesso → a app redireciona para fora do /login (home)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  await expect(page).not.toHaveURL(/\/login/)

  // Guarda cookies + localStorage (a sessão do Supabase fica no localStorage)
  await page.context().storageState({ path: ficheiroAuth })
})
