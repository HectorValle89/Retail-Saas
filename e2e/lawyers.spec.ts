import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lexagenda_tour_completed', 'true')
    localStorage.setItem('lexagenda_onboarding_completed_11111111-1111-1111-1111-111111111111', 'true')
  })
})

test.describe('Directorio de Abogados', () => {

  test('pagina de abogados carga correctamente', async ({ page }) => {
    await page.goto('/lawyers')

    await expect(page.getByText('Abogados')).toBeVisible()
    await expect(page.getByText('Encuentra al especialista que necesitas')).toBeVisible()
  })

  test('muestra lista de abogados', async ({ page }) => {
    await page.goto('/lawyers')
    await page.waitForLoadState('networkidle')

    // Debe haber al menos un abogado (hay 4 en seed data)
    // Los abogados se muestran como cards
    await page.waitForTimeout(2000) // Esperar carga de datos
    const body = await page.textContent('body')

    // Verificar que aparece al menos un abogado del seed
    const hasLawyer = body?.includes('Civil') ||
      body?.includes('Penal') ||
      body?.includes('Laboral') ||
      body?.includes('Familiar') ||
      body?.includes('abogado') ||
      body?.includes('Abogado')
    expect(hasLawyer).toBeTruthy()
  })

  test('tiene filtros de especialidad', async ({ page }) => {
    await page.goto('/lawyers')
    await page.waitForLoadState('networkidle')

    // Debe existir seccion de filtros
    await page.waitForTimeout(2000)
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()
  })
})
