import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, acceso: string, password: string) {
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="acceso"]').fill(acceso)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Entrar al sistema' }).click()
  await page.waitForURL('**/dashboard', { timeout: 30000 })
}

test('dermoconsejero ve dashboard operativo mobile-first con acciones rapidas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })

  await expect(page.getByText(/Jornada por iniciar|Jornada en curso/i)).toBeVisible()
  await expect(page.getByText(/Acciones rapidas/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Ventas/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Love ISDIN/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Registro extemporaneo/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Calendario/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Perfil/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Comunicacion/i })).toBeVisible()
  await expect(page.getByLabel(/Notificaciones/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Incidencias$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Justificacion de faltas/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Desabasto/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Incapac/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Estatus/i })).toHaveCount(0)
  await expect(page.getByText(/SUCURSAL CENTRAL/i)).toBeVisible()
  await expect(page.getByText(/Cartera visible/i)).toHaveCount(0)
  await expect(page.getByText(/Mas accesos/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Campanas/i })).toHaveCount(0)
})

test('dermoconsejero usa aviso previo y justificacion de faltas con receta IMSS', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /^Incidencias$/i }).click()
  const incidenciasDialog = page.locator('[role="dialog"][aria-label="Incidencias"]')
  await expect(incidenciasDialog).toBeVisible()
  await incidenciasDialog.getByRole('button', { name: /Avisar inasistencia/i }).click()
  await expect(incidenciasDialog.getByLabel(/Dia de la falta avisada/i)).toBeVisible()
  await expect(
    incidenciasDialog.getByText(/es el requisito para poder justificarla despues con receta del IMSS/i)
  ).toBeVisible()

  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /Justificacion de faltas/i }).click()
  const justificacionDialog = page.locator('[role="dialog"][aria-label="Justificacion de faltas"]')
  await expect(justificacionDialog).toBeVisible()
  await expect(justificacionDialog.getByLabel(/Fecha inicio/i)).toBeVisible()
  await expect(justificacionDialog.getByLabel(/Receta del IMSS/i)).toBeVisible()
  await expect(justificacionDialog.getByText(/solo se puede justificar una falta que ya haya sido avisada previamente/i)).toBeVisible()
})

test('love isdin usa flujo tipo carrito con QR fijo y guardado acumulado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /Love ISDIN/i }).click()

  await expect(page.locator('[role="dialog"][aria-label="Love ISDIN"]')).toBeVisible()
  await expect(page.getByAltText(/QR personal LOVE ISDIN/i)).toBeVisible()
  await expect(page.getByLabel(/Nombre del cliente/i)).toBeVisible()
  await expect(page.getByLabel(/Correo o contacto/i)).toBeVisible()
  await expect(page.getByLabel(/Ticket o folio opcional/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Agregar al carrito/i })).toBeVisible()
  await expect(page.getByText(/Carrito LOVE ISDIN/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Guardar afiliaciones/i })).toBeVisible()
  await expect(page.getByText(/Abrir camara/i)).toHaveCount(0)
})

test('registro extemporaneo vive en acciones rapidas con pestanas separadas para ventas y love isdin', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /Registro extemporaneo/i }).click()

  const dialog = page.locator('[role="dialog"][aria-label="Registro extemporaneo"]')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Ventas$/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /LOVE ISDIN/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Agregar venta/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Guardar ventas extemporaneas/i })).toBeVisible()

  await dialog.getByRole('button', { name: /LOVE ISDIN/i }).click()
  await expect(dialog.getByRole('button', { name: /Agregar afiliacion/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Guardar LOVE ISDIN extemporaneo/i })).toBeVisible()
})

test('incidencias unifica retardo, no llegare y desabasto en una sola hoja operativa', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /^Incidencias$/i }).click()

  await expect(page.locator('[role="dialog"][aria-label="Incidencias"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Retardo/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /No llegare/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Desabasto/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Avisar inasistencia/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Registro extemporaneo/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Faltantes/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Enviar incidencia/i })).toBeVisible()
})

test('perfil vive en acciones rapidas, comunicacion abre popup y notificaciones viven en campana superior', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /Perfil/i }).click()
  const perfilDialog = page.locator('[role="dialog"][aria-label="Perfil"]')
  await expect(perfilDialog).toBeVisible()
  await expect(perfilDialog.getByText(/Perfil operativo/i)).toBeVisible()
  await expect(perfilDialog.getByText('Sucursal', { exact: true })).toBeVisible()
  await expect(perfilDialog.getByRole('button', { name: /Solicitar correccion/i })).toBeVisible()
  await perfilDialog.getByRole('button', { name: /Solicitar correccion/i }).click()
  await expect(perfilDialog.getByRole('button', { name: /Correo/i })).toBeVisible()
  await expect(perfilDialog.getByRole('button', { name: /Telefono/i })).toBeVisible()
  await expect(perfilDialog.getByRole('button', { name: /Domicilio/i })).toBeVisible()
  await expect(perfilDialog.getByText(/Te enviaremos verificacion al nuevo correo/i)).toBeVisible()
  await perfilDialog.getByRole('button', { name: /Domicilio/i }).click()
  await expect(perfilDialog.getByLabel(/Evidencia/i)).toBeVisible()

  await page.getByRole('button', { name: /Atras/i }).click()

  await page.getByRole('button', { name: /Comunicacion/i }).click()
  const comunicacionDialog = page.locator('[role="dialog"][aria-label="Comunicacion"]')
  await expect(comunicacionDialog).toBeVisible()
  await expect(comunicacionDialog.getByRole('button', { name: /Falla en la app/i })).toBeVisible()
  await expect(comunicacionDialog.getByRole('button', { name: /Bono no recibido/i })).toBeVisible()
  await expect(comunicacionDialog.getByRole('button', { name: /Nomina no recibida/i })).toBeVisible()
  await expect(comunicacionDialog.getByText(/se enviara directo a Coordinacion/i)).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)

  await comunicacionDialog.getByRole('button', { name: /Atras/i }).click()

  await page.getByLabel(/Notificaciones/i).click()
  const notificacionesDialog = page.locator('[role="dialog"][aria-label="Notificaciones"]')
  await expect(notificacionesDialog).toBeVisible()
  await expect(notificacionesDialog.getByText(/Centro de notificaciones/i)).toBeVisible()
})

test('calendario muestra asignaciones semanales y mensuales desde acciones rapidas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /Calendario/i }).click()

  const dialog = page.locator('[role="dialog"][aria-label="Calendario"]')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Semana$/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Mes$/i })).toBeVisible()
  await expect(dialog.getByText('Tiendas asignadas', { exact: true })).toBeVisible()
})

test('incapacidad usa flujo escalonado con supervision, reclutamiento y nomina', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /Incapacidad/i }).click()

  const dialog = page.locator('[role="dialog"][aria-label="Incapacidad"]')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Ver estatus/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Incapacidad inicial/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Incapacidad subsecuente/i })).toBeVisible()
  await expect(dialog.getByLabel(/Fecha inicio/i)).toBeVisible()
  await expect(dialog.getByLabel(/Fecha fin/i)).toBeVisible()
  await expect(dialog.getByLabel(/Solicitud/i)).toBeVisible()
  await expect(dialog.getByLabel(/Motivo/i)).toBeVisible()
  const agregarEvidenciaButton = dialog.getByRole('button', {
    name: 'Agregar evidencia',
    exact: true,
  })
  await expect(agregarEvidenciaButton).toBeVisible()
  await expect(dialog.getByText(/Galeria/i)).toHaveCount(0)
  await expect(dialog.getByText(/Camara/i)).toHaveCount(0)
  await agregarEvidenciaButton.click()
  await expect(dialog.getByText(/quieres agregar un documento de tu galeria/i)).toBeVisible()
  await expect(dialog.getByText(/^Galeria$/i)).toBeVisible()
  await expect(dialog.getByText(/^Camara$/i)).toBeVisible()
  await expect(dialog.getByText(/Primero la valida supervision, despues la revisa reclutamiento y finalmente la formaliza nomina/i)).toBeVisible()

  await dialog.getByRole('button', { name: /Ver estatus/i }).click()
  await expect(dialog.getByText(/Todavia no has enviado solicitudes de este tipo/i)).toBeVisible()
})

test('dermoconsejero solo habilita check-in con asignacion activa', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, 'test_dermoconsejero_01@fieldforce.test', 'RtlTest!Der01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })

  const cta = page.getByRole('button', { name: /LLEGUE A TIENDA/i })
  await expect(cta).toBeDisabled()
  await expect(page.getByText(/asignacion activa con PDV y horario|Sin asignacion operativa activa/i)).toBeVisible()
  await expect(page.getByRole('dialog', { name: /Llegada a tienda/i })).toHaveCount(0)
})

test('supervisor usa dashboard operativo diario sin sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })

  await login(page, 'test_supervisor_01@fieldforce.test', 'RtlTest!Sup01')
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' })

  await expect(page.getByText(/Operacion diaria/i)).toBeVisible()
  await expect(page.getByLabel(/Notificaciones/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Abrir solicitudes del equipo/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Abrir mis vacaciones/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Abrir mi incapacidad/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Abrir mi dia cumple/i })).toBeVisible()
  await expect(page.getByText(/Bandeja del equipo/i)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /Tiendas asignadas hoy/i })).toBeVisible()
  await expect(page.getByText(/Cada fila resume el PDV/i)).toBeVisible()
  await expect(page.getByText(/Menu operativo/i)).toHaveCount(0)
  await expect(page.getByText(/Field Force Platform/i)).toHaveCount(0)

  await page.getByLabel(/Notificaciones/i).click()
  await expect(page.locator('[role="dialog"][aria-label="Notificaciones"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[role="dialog"][aria-label="Notificaciones"]')).toHaveCount(0)
  await page.getByRole('button', { name: /Abrir solicitudes del equipo/i }).click()
  await expect(page.locator('[role="dialog"][aria-label="Solicitudes del equipo"]')).toBeVisible()
  await expect(page.getByText(/Vacaciones \(/i).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Abrir mis vacaciones/i }).click()
  await expect(page.locator('[role="dialog"][aria-label="Mis vacaciones"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Ver estatus/i })).toBeVisible()
})
