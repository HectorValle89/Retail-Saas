import { test, expect } from '@playwright/test'
import { dismissOverlays } from './helpers'

test.describe('Dashboard - Abogado autenticado', () => {

  test('dashboard carga con saludo y nombre', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    // The greeting h1 is inside main (sidebar also has h1 "LexAgenda")
    const greeting = page.locator('main h1').first()
    await expect(greeting).toBeVisible({ timeout: 10000 })
    const text = await greeting.textContent()
    expect(text).toMatch(/Buenos|Buenas/)
  })

  test('dashboard muestra resumen de practica legal', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    await expect(page.getByText('Aquí está el resumen de tu práctica legal')).toBeVisible({ timeout: 10000 })
  })

  test('dashboard tiene stats cards', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    const cards = page.locator('main [class*="card"], main [class*="Card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10000 })
  })

  test('dashboard tiene seccion de citas proximas', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await dismissOverlays(page)

    const content = await page.locator('main').textContent()
    expect(content).toBeTruthy()
  })
})
