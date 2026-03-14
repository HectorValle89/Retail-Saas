import { test, expect } from '@playwright/test'
import { dismissOverlays } from './helpers'

test.describe('Navegacion - Sidebar (Abogado)', () => {

  test('sidebar muestra logo LexAgenda', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)
    await expect(page.getByText('LexAgenda').first()).toBeVisible()
  })

  test('sidebar muestra links de navegacion para abogado', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Calendario' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: 'Mis Citas' })).toBeVisible()
  })

  test('sidebar link Dashboard navega correctamente', async ({ page }) => {
    await page.goto('/appointments')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await page.waitForURL('**/dashboard', { timeout: 15000 })
    await expect(page).toHaveURL(/dashboard/)
  })

  test('sidebar link Mis Citas navega correctamente', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)
    await page.getByRole('link', { name: 'Mis Citas' }).click()
    await page.waitForURL('**/appointments', { timeout: 15000 })
    await expect(page).toHaveURL(/appointments/)
  })

  test('sidebar link Calendario navega correctamente', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)
    await page.getByRole('link', { name: 'Calendario' }).click()
    await page.waitForURL('**/calendar', { timeout: 15000 })
    await expect(page).toHaveURL(/calendar/)
  })

  test('sidebar tiene boton Cerrar Sesion', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)
    await expect(page.getByText('Cerrar Sesión')).toBeVisible()
  })

  test('sidebar muestra rol Abogado', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    await expect(page.getByText('Abogado', { exact: true })).toBeVisible({ timeout: 10000 })
  })
})
