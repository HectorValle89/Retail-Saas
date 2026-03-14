import { test, expect } from '@playwright/test'
import { dismissOverlays } from './helpers'

test.describe('Paginas protegidas - Abogado', () => {

  test('abogado puede acceder al calendario', async ({ page }) => {
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    expect(page.url()).toContain('/calendar')
  })

  test('pagina de citas carga para abogado', async ({ page }) => {
    await page.goto('/appointments')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    // Use heading role to avoid ambiguity with sidebar link
    await expect(page.getByRole('heading', { name: 'Mis Citas' })).toBeVisible()
  })

  test('dashboard muestra nombre del abogado', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    // The greeting h1 is inside main (sidebar h1 is "LexAgenda")
    const greeting = page.locator('main h1').first()
    await expect(greeting).toBeVisible({ timeout: 10000 })
    const text = await greeting.textContent()
    expect(text).toMatch(/Juan|Perez|Dr/)
  })

  test('sidebar no muestra links de admin para abogado', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    await page.waitForTimeout(2000)

    const usuariosLink = page.getByRole('link', { name: 'Usuarios' })
    await expect(usuariosLink).not.toBeVisible()
  })
})
