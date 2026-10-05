import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="acceso"]').fill('test_administrador_01@fieldforce.test');
  await page.locator('input[name="password"]').fill('RtlTest!Adm01');
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

test.describe('Planeación mensual móvil', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('mantiene scroll táctil, abre detalle diferido y devuelve el foco', async ({ page }) => {
    await loginAsAdmin(page);
    const startedAt = Date.now();
    await page.goto(`${BASE_URL}/asignaciones?mes=2026-08`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: 'Planeación mensual' })).toBeVisible({
      timeout: 30_000,
    });
    expect(Date.now() - startedAt).toBeLessThan(10_000);

    const scroll = page.getByTestId('planeacion-scroll');
    const metrics = await scroll.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    const dayButton = scroll.getByTestId('planeacion-dia').first();
    await dayButton.scrollIntoViewIfNeeded();
    const box = await dayButton.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);

    await dayButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('planeacion-detail')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('button', { name: 'Editar asignación' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Editar asignación' }).click();
    const editor = page.getByTestId('planeacion-editor');
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();
    await editor.getByLabel('Operación').selectOption('LIBERAR_DC');
    await editor.getByLabel('Motivo operativo').fill('Validación E2E de vista previa sin publicar');
    await editor.getByRole('button', { name: 'Previsualizar impacto' }).click();
    await expect(editor.getByText('Vista previa lista para confirmar.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(editor.getByRole('button', { name: 'Confirmar cambio' })).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(dayButton).toBeFocused();

    await page.screenshot({
      path: test.info().outputPath('planeacion-mensual-mobile.png'),
      fullPage: true,
    });
  });
});

test.describe('Planeación mensual escritorio', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('muestra las columnas operativas congeladas y filtros locales', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/asignaciones?mes=2026-08`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: 'Planeación mensual' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('columnheader', { name: 'Cadena' })).toHaveCSS(
      'position',
      'sticky'
    );
    await expect(page.getByRole('columnheader', { name: 'Tienda' })).toHaveCSS(
      'position',
      'sticky'
    );
    await expect(page.getByRole('columnheader', { name: 'Rol' })).toHaveCSS('position', 'sticky');
    await expect(page.getByRole('columnheader', { name: 'Dermoconsejera' })).toHaveCSS(
      'position',
      'sticky'
    );
    await expect(page.getByRole('columnheader', { name: 'Vigencia' })).toHaveCSS(
      'position',
      'sticky'
    );
    await expect(page.getByRole('columnheader', { name: 'Turno / descanso' })).toHaveCSS(
      'position',
      'sticky'
    );
    await expect(page.getByRole('columnheader', { name: 'Supervisor' })).toHaveCSS(
      'position',
      'sticky'
    );

    const table = page.getByTestId('planeacion-scroll').locator('table');
    await expect(table.locator('tbody tr')).not.toHaveCount(0);
    const workedHeader = table.getByRole('columnheader', { name: '# Lab.' });
    const pdvQuotaHeader = table.getByRole('columnheader', { name: 'Cuota PDV' });
    const dcQuotaHeader = table.getByRole('columnheader', { name: 'Cuota DC' });
    await expect(workedHeader).toHaveCSS('position', 'sticky');
    await expect(pdvQuotaHeader).toHaveCSS('position', 'sticky');
    await expect(dcQuotaHeader).toHaveCSS('position', 'sticky');

    const desktopMetrics = await page.getByTestId('planeacion-scroll').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      top: element.getBoundingClientRect().top,
    }));
    expect(desktopMetrics.scrollWidth).toBeGreaterThan(desktopMetrics.clientWidth);
    expect(desktopMetrics.top).toBeLessThan(330);

    const supervisorBounds = await page
      .getByRole('columnheader', { name: 'Supervisor' })
      .boundingBox();
    const workedBounds = await workedHeader.boundingBox();
    expect(supervisorBounds).toBeTruthy();
    expect(workedBounds).toBeTruthy();
    const visibleDayCount = await table.locator('th[data-calendar-pan="true"]').evaluateAll(
      (headers, boundaries) =>
        headers.filter((header) => {
          const bounds = header.getBoundingClientRect();
          const center = bounds.left + bounds.width / 2;
          return center > boundaries.left && center < boundaries.right;
        }).length,
      {
        left: supervisorBounds ? supervisorBounds.x + supervisorBounds.width : 0,
        right: workedBounds?.x ?? 0,
      }
    );
    expect(visibleDayCount).toBeGreaterThanOrEqual(13);
    expect(visibleDayCount).toBeLessThanOrEqual(16);

    const scrollPanel = page.getByTestId('planeacion-scroll');
    await page.getByRole('button', { name: 'Mostrar las dos semanas siguientes' }).click();
    await expect
      .poll(() => scrollPanel.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(500);
    await page.getByRole('button', { name: 'Mostrar las dos semanas anteriores' }).click();
    await expect
      .poll(() => scrollPanel.evaluate((element) => element.scrollLeft))
      .toBeLessThan(100);

    const dragCell = table.getByTestId('planeacion-dia').nth(10);
    const dragBounds = await dragCell.boundingBox();
    expect(dragBounds).toBeTruthy();
    if (dragBounds) {
      await page.mouse.move(
        dragBounds.x + dragBounds.width / 2,
        dragBounds.y + dragBounds.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(dragBounds.x - 220, dragBounds.y + dragBounds.height / 2, {
        steps: 8,
      });
      await page.mouse.up();
    }
    await expect
      .poll(() => scrollPanel.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(150);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const clickCell = table.getByTestId('planeacion-dia').nth(15);
    await clickCell.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    const rowsBefore = await table.locator('tbody tr').count();
    await page.getByPlaceholder('Buscar cadena, tienda, DC...').fill('texto-inexistente-xyz');
    await expect(page.getByText('Sin filas para estos filtros')).toBeVisible();
    await page.getByPlaceholder('Buscar cadena, tienda, DC...').fill('');
    await expect(table.locator('tbody tr')).toHaveCount(rowsBefore);

    await page.screenshot({
      path: test.info().outputPath('planeacion-mensual-desktop.png'),
      fullPage: true,
    });
  });

  test('selecciona PDVs únicos y previsualiza cambios masivos', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/asignaciones?mes=2026-08`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'Planeación mensual' })).toBeVisible({
      timeout: 30_000,
    });

    const selectors = page.getByTestId('seleccionar-pdv');
    await selectors.nth(0).check();
    await selectors.nth(1).check();
    const selectionBar = page.getByTestId('planeacion-seleccion-masiva');
    await expect(selectionBar).toContainText('2 PDVs seleccionados');

    await selectionBar.getByRole('button', { name: 'Liberar DCs' }).click();
    const bulkEditor = page.getByTestId('planeacion-editor-masivo');
    await expect(bulkEditor).toBeVisible();
    await bulkEditor
      .getByLabel('Motivo operativo')
      .fill('Validación E2E de liberación masiva sin publicar');
    await bulkEditor.getByRole('button', { name: 'Previsualizar lote' }).click();
    await expect(bulkEditor.getByText('Vista previa lista para confirmar.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(bulkEditor.getByRole('button', { name: 'Confirmar 2 PDVs' })).toBeEnabled();
    await page.screenshot({
      path: test.info().outputPath('planeacion-mensual-seleccion-masiva.png'),
      fullPage: true,
    });

    await bulkEditor.getByRole('button', { name: 'Cancelar' }).click();
    const selectedRows = page.getByTestId('planeacion-scroll').locator('tbody tr');
    const currentSupervisorNames = await Promise.all(
      [0, 1].map((index) =>
        selectedRows.nth(index).locator('td').nth(6).locator('span[title]').getAttribute('title')
      )
    );
    await selectionBar.getByRole('button', { name: 'Asignar supervisor' }).click();
    const supervisorEditor = page.getByTestId('planeacion-editor-masivo');
    const supervisorSelect = supervisorEditor.getByLabel('Supervisor que recibirá los PDVs');
    const supervisorOptions = await supervisorSelect.locator('option').evaluateAll((options) =>
      options.map((option) => ({
        value: (option as HTMLOptionElement).value,
        label: option.textContent?.trim() ?? '',
      }))
    );
    const successor = supervisorOptions.find(
      (option) => option.value && !currentSupervisorNames.includes(option.label)
    );
    expect(successor).toBeTruthy();
    await supervisorSelect.selectOption(successor?.value ?? '');
    await supervisorEditor
      .getByLabel('Motivo operativo')
      .fill('Validación E2E de reasignación selectiva sin publicar');
    await supervisorEditor.getByRole('button', { name: 'Previsualizar lote' }).click();
    await expect(supervisorEditor.getByText('Vista previa lista para confirmar.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(supervisorEditor.getByRole('button', { name: 'Confirmar 2 PDVs' })).toBeEnabled();
  });

  test('descarga la plantilla y valida una cuota sin publicar el lote', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/asignaciones?mes=2026-08`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'Planeación mensual' })).toBeVisible({
      timeout: 30_000,
    });

    const firstPdvMeta = await page
      .getByTestId('planeacion-scroll')
      .locator('tbody tr')
      .first()
      .getByTestId('planeacion-pdv-meta')
      .textContent();
    const claveBtl = firstPdvMeta?.split(' · ')[0]?.trim();
    expect(claveBtl).toBeTruthy();

    await page.getByTestId('abrir-importador-cuotas').click();
    const importer = page.getByTestId('importador-cuotas-mensuales');
    await expect(importer).toBeVisible();
    await expect(importer.getByRole('button', { name: 'Validar archivo' })).toBeDisabled();

    const downloadPromise = page.waitForEvent('download');
    await importer.getByRole('link', { name: 'Descargar XLSX' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('plantilla-cuotas-pdv-2026-08.xlsx');

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          MES: '2026-08',
          'BTL CVE': claveBtl,
          'CUOTA MENSUAL': 31000,
          'PESO LUN': 1,
          'PESO MAR': 1,
          'PESO MIE': 1,
          'PESO JUE': 1,
          'PESO VIE': 1.25,
          'PESO SAB': 1.5,
          'PESO DOM': 1.5,
        },
      ]),
      'Cuotas_Mensuales'
    );
    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await importer.locator('input[type="file"]').setInputFiles({
      name: 'cuotas-e2e.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bytes,
    });
    await importer.getByRole('button', { name: 'Validar archivo' }).click();
    await expect(
      importer.getByText('Vista previa validada. El lote completo está listo para publicarse.')
    ).toBeVisible({ timeout: 15_000 });
    await expect(importer.getByRole('button', { name: 'Publicar lote completo' })).toBeVisible();
  });

  test('expone operaciones extendidas y revierte una edición inválida sin alterar la matriz', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/asignaciones?mes=2026-08`, {
      waitUntil: 'domcontentloaded',
    });
    const table = page.getByTestId('planeacion-scroll').locator('table');
    await expect(table.locator('tbody tr')).not.toHaveCount(0, { timeout: 30_000 });
    const rowsBefore = await table.locator('tbody tr').count();

    const editableRow = table.locator('tbody tr').filter({ hasNotText: 'Por cubrir' }).first();
    await editableRow.getByTestId('planeacion-dia').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Editar asignación' }).click();
    const editor = page.getByTestId('planeacion-editor');

    await editor.getByLabel('Operación').selectOption('CAMBIAR_ROTACION');
    await editor.getByLabel('Nueva naturaleza').selectOption('ROTATIVA');
    await expect(editor.getByLabel('PDVs en el grupo')).toBeVisible();
    await expect(editor.getByLabel('Patrón semanal')).toBeVisible();
    await expect(editor.getByLabel('Punto de venta B')).toBeVisible();
    await expect(editor.getByLabel('Dermoconsejera del PDV A')).toBeVisible();
    await expect(editor.getByLabel('Días laborados del PDV A')).toHaveValue('LUN,MAR,MIE');
    await expect(editor.getByLabel('Días laborados del PDV B')).toHaveValue('JUE,VIE,SAB');
    await expect(editor.getByLabel('Turno del PDV B')).toBeVisible();
    await expect(editor.getByText(/Supervisor efectivo:/).first()).toBeVisible();

    const partnerSelect = editor.getByLabel('Punto de venta B');
    const partnerPdvId = await partnerSelect
      .locator('option')
      .evaluateAll(
        (options) =>
          options
            .map((option) => option as HTMLOptionElement)
            .find((option) => option.value && !option.disabled)?.value
      );
    expect(partnerPdvId).toBeTruthy();
    if (!partnerPdvId) throw new Error('No hay un PDV compañero disponible para esta prueba.');
    await partnerSelect.selectOption(partnerPdvId);
    await editor.getByLabel('Motivo operativo').fill('Validación E2E de rotación por grupo');
    await editor.getByRole('button', { name: 'Previsualizar impacto' }).click();
    await expect(editor.getByText('Vista previa lista para confirmar.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(editor.getByRole('button', { name: 'Confirmar cambio' })).toBeEnabled();

    await editor.getByLabel('Operación').selectOption('CAMBIAR_ESTADO_PDV');
    await expect(editor.getByLabel('Nuevo estado del PDV')).toBeVisible();

    await editor.getByLabel('Operación').selectOption('AGREGAR_EVENTO');
    await expect(editor.getByLabel('Nombre del evento')).toBeVisible();

    await editor.getByLabel('Operación').selectOption('REASIGNAR_SUPERVISOR');
    await expect(editor.getByLabel('Supervisor saliente')).toBeVisible();
    await expect(editor.getByLabel('Supervisor sucesor')).toBeVisible();

    await editor.getByLabel('Operación').selectOption('CAMBIAR_HORARIO');
    await editor.getByLabel('Nuevo turno o rango directo').fill('9 a 6');
    await editor.getByLabel('Motivo operativo').fill('Validar rollback de edición inválida');
    await editor.getByRole('button', { name: 'Previsualizar impacto' }).click();
    await expect(editor.getByText(/HORARIO_INVALIDO/)).toBeVisible({ timeout: 15_000 });
    await expect(editor.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(table.locator('tbody tr')).toHaveCount(rowsBefore);
  });

  test('abre la asignación maestra desde el PDV y comunica continuidad futura', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/asignaciones?mes=2026-09`, {
      waitUntil: 'domcontentloaded',
    });

    const table = page.getByTestId('planeacion-scroll').locator('table');
    const masterButton = table
      .getByRole('button', { name: /Editar asignación maestra de/ })
      .first();
    await expect(masterButton).toBeVisible({ timeout: 30_000 });
    await masterButton.click();

    const editor = page.getByTestId('planeacion-editor');
    await expect(editor).toBeVisible();
    await expect(
      editor.getByText(/se hereda automáticamente en los meses posteriores/i)
    ).toBeVisible();
    await expect(editor.getByLabel('Inicio de la nueva vigencia')).toHaveValue(/2026-09-/);

    await editor.getByLabel('Operación').selectOption('MOVER_DC');
    await editor.getByLabel('Naturaleza').selectOption('COBERTURA_TEMPORAL');
    await expect(editor.getByText(/hasta el siguiente cambio/i)).toBeVisible();
    await expect(editor.getByLabel('Fin (opcional)')).not.toHaveAttribute('max');
  });

  test('hereda en septiembre a diciembre la estructura maestra de agosto', async ({ page }) => {
    await loginAsAdmin(page);

    const readStructuralProjection = async (month: string) => {
      await page.goto(`${BASE_URL}/asignaciones?mes=${month}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('heading', { name: 'Planeación mensual' })).toBeVisible({
        timeout: 30_000,
      });
      const table = page.getByTestId('planeacion-scroll').locator('table');
      await expect(table.locator('tbody tr')).not.toHaveCount(0);
      return table.locator('tbody tr').evaluateAll((rows) =>
        rows.map((row) => {
          const cells = row.querySelectorAll('td');
          return [0, 1, 2, 3, 6]
            .map((index) => cells[index]?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .join('|');
        })
      );
    };

    const august = await readStructuralProjection('2026-08');
    expect(august).toHaveLength(339);

    for (const month of ['2026-09', '2026-10', '2026-11', '2026-12']) {
      expect(await readStructuralProjection(month)).toEqual(august);
    }
  });
});
