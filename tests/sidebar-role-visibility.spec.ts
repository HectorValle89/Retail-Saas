import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, acceso: string, password: string) {
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="acceso"]').fill(acceso)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Entrar al sistema' }).click()
  await page.waitForURL('**/dashboard', { timeout: 30000 })
}

test('reclutamiento solo ve modulos alineados a su operacion en el sidebar', async ({ page }) => {
  await login(page, 'test_reclutamiento_01@fieldforce.test', 'RtlTest!Rec01')

  await expect(page.getByRole('link', { name: 'Empleados' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Formaciones' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Solicitudes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mensajes' })).toBeVisible()

  await expect(page.getByRole('link', { name: 'Ventas' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'LOVE ISDIN' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Nomina' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Configuracion' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
})

test('administrador conserva los modulos de control total en el sidebar', async ({ page }) => {
  await login(page, 'test_administrador_01@fieldforce.test', 'RtlTest!Adm01')

  await expect(page.getByRole('link', { name: 'Ventas' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Configuracion' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reglas' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Usuarios' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Clientes' })).toBeVisible()
})

test('nomina opera desde su bandeja propia y ya no usa empleados como modulo diario', async ({ page }) => {
  await login(page, 'test_nomina_01@fieldforce.test', 'RtlTest!Nom01')

  await expect(page.getByRole('link', { name: 'Nomina' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Solicitudes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mensajes' })).toBeVisible()

  await expect(page.getByRole('link', { name: 'Empleados' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ventas' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Configuracion' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
})
