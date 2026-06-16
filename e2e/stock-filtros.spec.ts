import { test, expect } from '@playwright/test'

const PLACEHOLDER_PESQUISA = 'Pesquisar por marca, modelo, serial ou destino...'

test('os filtros do stock persistem ao navegar para outra página e voltar', async ({ page }) => {
  await page.goto('/logistico')

  // Espera o carregamento dos dados terminar
  await expect(page.getByText('A carregar...')).toHaveCount(0, { timeout: 20_000 })

  // Aplica dois filtros: pesquisa de texto + "Só incompletos"
  await page.getByPlaceholder(PLACEHOLDER_PESQUISA).fill('candela')
  await page.getByLabel('Só incompletos').check()

  // O estado deve ter sido escrito no sessionStorage
  const guardado = await page.evaluate(() => sessionStorage.getItem('stock:filtros'))
  expect(guardado, 'sessionStorage deve conter a chave stock:filtros').toBeTruthy()
  expect(JSON.parse(guardado!)).toMatchObject({ pesquisa: 'candela', soIncompletos: true })

  // Navega para o Dashboard (link no cabeçalho) e volta atrás ao stock
  await page.locator('a[href="/dashboard"]').first().click()
  await expect(page).toHaveURL(/\/dashboard/)
  await page.goBack()
  await expect(page).toHaveURL(/\/logistico/)

  // Os filtros devem aparecer restaurados automaticamente
  await expect(page.getByPlaceholder(PLACEHOLDER_PESQUISA)).toHaveValue('candela')
  await expect(page.getByLabel('Só incompletos')).toBeChecked()
})
