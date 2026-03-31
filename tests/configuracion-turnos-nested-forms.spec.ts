import { expect, test } from '@playwright/test'

test('configuracion de turnos no anida formularios ni emite errores de hidratacion', async ({
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

  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Correo o usuario').fill('test_administrador_01@fieldforce.test')
  await page.locator('input[name="password"]').fill('RtlTest!Adm01')
  await page.getByRole('button', { name: 'Entrar al sistema' }).click()

  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.goto('http://127.0.0.1:3000/configuracion', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Configuracion' })).toBeVisible()
  await expect(page.getByText('Catalogo de horarios')).toBeVisible()

  const nestedFormErrors = [...consoleErrors, ...pageErrors].filter((message) => {
    return (
      message.includes('<form> cannot contain a nested <form>') ||
      message.includes('In HTML, <form> cannot be a descendant of <form>')
    )
  })

  expect(nestedFormErrors).toEqual([])
})
