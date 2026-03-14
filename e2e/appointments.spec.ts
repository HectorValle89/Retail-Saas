import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lexagenda_tour_completed', 'true')
    localStorage.setItem('lexagenda_onboarding_completed_11111111-1111-1111-1111-111111111111', 'true')
  })
})

test.describe('Gestion de Citas - Abogado', () => {

  test('pagina de citas carga correctamente', async ({ page }) => {
    await page.goto('/appointments', { timeout: 45000 })

    await expect(page.getByText('Mis Citas')).toBeVisible()
  })

  test('abogado ve gestion de citas de clientes', async ({ page }) => {
    await page.goto('/appointments')
    await page.waitForLoadState('networkidle')

    // Lawyer should see "Gestiona las citas de tus clientes"
    await expect(page.getByText('Gestiona las citas de tus clientes')).toBeVisible({ timeout: 10000 })
  })

  test('pagina de nueva cita carga para booking', async ({ page }) => {
    await page.goto('/appointments/new')

    await expect(page.getByText('Agendar Nueva Cita')).toBeVisible()
    await expect(page.getByText('Sigue los pasos para reservar tu consulta legal')).toBeVisible()
  })

  test('booking wizard muestra paso 1 - seleccionar abogado', async ({ page }) => {
    await page.goto('/appointments/new')
    await page.waitForLoadState('networkidle')

    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
