import { expect, test } from '@playwright/test'

test('la raiz redirige a login para usuarios sin sesion', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' })

  await page.waitForURL('**/login', { timeout: 15000 })
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Acceso al sistema')).toBeVisible()
})
