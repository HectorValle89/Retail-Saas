import { expect, test } from '@playwright/test'

test.use({
  viewport: { width: 393, height: 852 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
})

test('la navegacion movil de administrador abre drawer, navega y cierra el menu', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="acceso"]').fill('test_administrador_01@fieldforce.test')
  await page.locator('input[name="password"]').fill('RtlTest!Adm01')
  await page.getByRole('button', { name: 'Entrar al sistema' }).click()

  await page.waitForURL('**/dashboard', { timeout: 30000 })

  const openMenuButton = page.getByRole('button', { name: 'Abrir menu' })
  await expect(openMenuButton).toBeVisible()

  await openMenuButton.dispatchEvent('click')
  await expect(page.getByRole('link', { name: 'Configuracion' })).toBeVisible()

  await page.getByRole('link', { name: 'Configuracion' }).click()
  await page.waitForURL('**/configuracion', { timeout: 30000 })

  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Configuracion' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar menu' })).toHaveCount(0)
})
