import { expect, test } from '@playwright/test'

test.use({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})

test('la entrada movil no muestra hydration mismatch ni service worker stale en desarrollo', async ({
  page,
}) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' })
  await page.waitForURL('**/login', { timeout: 15000 })
  await expect(page.getByText('Acceso al sistema')).toBeVisible()

  await page.waitForTimeout(1500)

  const serviceWorkerCount = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return 0
    }

    const registrations = await navigator.serviceWorker.getRegistrations()
    return registrations.length
  })

  const hydrationErrors = [...consoleErrors, ...pageErrors].filter((message) => {
    return (
      message.includes("A tree hydrated but some attributes of the server rendered HTML didn't match the client properties") ||
      message.includes('react-hydration-error')
    )
  })

  expect(hydrationErrors).toEqual([])
  expect(serviceWorkerCount).toBe(0)
})
