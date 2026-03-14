import { test, expect } from '@playwright/test'

test.describe('Auth Pages - Sin autenticacion', () => {
  test.setTimeout(60000)

  test('login page carga correctamente', async ({ page }) => {
    await page.goto('/login', { timeout: 45000 })

    await expect(page.getByText('Bienvenido de vuelta')).toBeVisible()
    await expect(page.getByText('Inicia sesión en tu cuenta para continuar')).toBeVisible()

    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()

    await expect(page.getByRole('button', { name: 'Iniciar Sesión' })).toBeVisible()

    await expect(page.getByText('Regístrate')).toBeVisible()
    await expect(page.getByText('¿Olvidaste tu contraseña?')).toBeVisible()
  })

  test('signup page carga correctamente', async ({ page }) => {
    await page.goto('/signup')

    await expect(page.getByText('Crea tu cuenta')).toBeVisible()
    await expect(page.getByText('Comienza gratis y gestiona tus citas como profesional')).toBeVisible()

    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear Cuenta' })).toBeVisible()
    await expect(page.getByText('Inicia sesión')).toBeVisible()
  })

  test('forgot-password page carga correctamente', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('#email')).toBeVisible()
  })

  test('navegacion login -> signup funciona', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: 'Regístrate' }).click()
    await page.waitForURL('**/signup', { timeout: 15000 })
    await expect(page).toHaveURL(/signup/)
  })

  test('navegacion signup -> login funciona', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('link', { name: 'Inicia sesión' }).click()
    await page.waitForURL('**/login', { timeout: 15000 })
    await expect(page).toHaveURL(/login/)
  })

  test('login con credenciales invalidas muestra error', async ({ page }) => {
    await page.goto('/login')

    await page.locator('#email').fill('invalid@test.com')
    await page.locator('#password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click()

    // Wait for error message text from Supabase
    await expect(page.getByText('Invalid login credentials')).toBeVisible({ timeout: 15000 })
  })

  test('login con credenciales validas redirige a dashboard', async ({ page }) => {
    await page.goto('/login')

    await page.locator('#email').fill('juan.perez@lexagenda.com')
    await page.locator('#password').fill('password123')
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click()

    await page.waitForURL('**/dashboard', { timeout: 30000 })
    await expect(page).toHaveURL(/dashboard/)
  })

  test('root path muestra homepage publica', async ({ page }) => {
    await page.goto('/', { timeout: 30000 })
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/^\/$/)
  })

  test('branding LexAgenda visible en auth layout', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Gestiona tus citas legales con profesionalismo')).toBeVisible()
  })
})
