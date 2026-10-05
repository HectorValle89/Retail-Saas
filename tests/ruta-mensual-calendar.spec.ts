import { expect, test, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

function buildCalendarFixture() {
  const days = Array.from({ length: 31 }, (_, index) => {
    const dayNumber = index + 1;
    const fecha = `2026-08-${String(dayNumber).padStart(2, '0')}`;
    const weekday = new Date(`${fecha}T12:00:00.000Z`).getUTCDay() || 7;
    const planned = dayNumber === 2 ? 1 : 0;

    return {
      fecha,
      numero: dayNumber,
      letra: WEEKDAY_LETTERS[weekday - 1],
      nombre: 'domingo',
      esHoy: false,
      cell: {
        fecha,
        numero: dayNumber,
        letra: WEEKDAY_LETTERS[weekday - 1],
        routeId: planned ? 'ruta-fixture' : null,
        routeStatus: planned ? 'PUBLICADA' : null,
        approvalState: planned ? 'APROBADA' : 'SIN_RUTA',
        plannedCount: planned,
        completedCount: 0,
        pendingCount: planned,
        replacementPendingCount: 0,
        eventCount: 0,
        displacedCount: 0,
        tone: planned ? 'sky' : 'neutral',
        label: planned ? '1' : 'Sin ruta',
      },
    };
  });

  return {
    data: {
      month: '2026-08',
      monthLabel: 'Agosto 2026',
      days: days.map(({ fecha, numero, letra, nombre, esHoy }) => ({
        fecha,
        numero,
        letra,
        nombre,
        esHoy,
      })),
      supervisors: [
        {
          supervisorEmpleadoId: 'supervisor-fixture',
          supervisor: 'Ana Supervisor',
          zona: 'NORTE',
          cells: days.map(({ cell }) => cell),
        },
      ],
      totals: { planned: 1, completed: 0, pending: 1, routes: 1 },
    },
  };
}

function buildDayFixture() {
  return {
    detail: {
      fecha: '2026-08-02',
      fechaLabel: '02/08',
      supervisorEmpleadoId: 'supervisor-fixture',
      supervisor: 'Ana Supervisor',
      zona: 'NORTE',
      routeId: 'ruta-fixture',
      routeStatus: 'PUBLICADA',
      approvalState: 'APROBADA',
      routeNotes: null,
      plannedVisits: [
        {
          id: 'visita-fixture',
          pdvId: 'pdv-fixture',
          pdv: 'San Pablo Valle',
          claveBtl: 'SP001',
          zona: 'NORTE',
          direccion: 'Av. Uno 100',
          orden: 1,
          estatus: 'PLANIFICADA',
          completadaEn: null,
          checkInAt: null,
          checkOutAt: null,
          evidenciaDisponible: false,
          checklistCompletion: 0,
          fotos: [],
          geocercaEstado: 'NO_REGISTRADO',
          geocercaResumen: 'GPS no registrado',
          comentarios: null,
          pendingReason: 'Visita no registrada',
          pendingClassification: 'INJUSTIFICADA',
        },
      ],
      completedVisits: [],
      pendingVisits: [
        {
          id: 'visita-fixture',
          pdvId: 'pdv-fixture',
          pdv: 'San Pablo Valle',
          claveBtl: 'SP001',
          zona: 'NORTE',
          direccion: 'Av. Uno 100',
          orden: 1,
          estatus: 'PLANIFICADA',
          completadaEn: null,
          checkInAt: null,
          checkOutAt: null,
          evidenciaDisponible: false,
          checklistCompletion: 0,
          fotos: [],
          geocercaEstado: 'NO_REGISTRADO',
          geocercaResumen: 'GPS no registrado',
          comentarios: null,
          pendingReason: 'Visita no registrada',
          pendingClassification: 'INJUSTIFICADA',
        },
      ],
      events: [],
      pendingRepositions: [
        {
          id: 'reposicion-fixture',
          visitId: 'visita-fixture',
          pdv: 'San Pablo Valle',
          fechaOrigen: '2026-08-02',
          clasificacion: 'INJUSTIFICADA',
          motivo: 'No hubo evidencia de ejecución',
          estado: 'PENDIENTE',
          semanaSugeridaInicio: '2026-08-03',
        },
      ],
    },
  };
}

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="acceso"]').fill('test_administrador_01@fieldforce.test');
  await page.locator('input[name="password"]').fill('RtlTest!Adm01');
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
}

async function loginAsSupervisor(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="acceso"]').fill('test_supervisor_01@fieldforce.test');
  await page.locator('input[name="password"]').fill('RtlTest!Sup01');
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
}

async function mockCalendarEndpoints(page: Page) {
  await page.route('**/api/ruta-semanal/calendario?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildCalendarFixture()),
    });
  });
  await page.route('**/api/ruta-semanal/calendario/dia?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildDayFixture()),
    });
  });
}

test.use({ viewport: { width: 393, height: 852 } });

test('muestra la matriz mensual, abre el detalle y devuelve el foco en móvil', async ({ page }) => {
  await loginAsAdmin(page);
  await mockCalendarEndpoints(page);

  const navigationStartedAt = Date.now();
  await page.goto(`${BASE_URL}/ruta-semanal?tab=routes`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Actividad diaria por supervisor' })).toBeVisible({
    timeout: 30000,
  });
  const navigationDurationMs = Date.now() - navigationStartedAt;
  expect(navigationDurationMs).toBeLessThan(10000);
  test.info().annotations.push({
    type: 'navigation-duration-ms',
    description: String(navigationDurationMs),
  });

  await expect(page.getByRole('columnheader', { name: 'Supervisor' })).toBeVisible();
  const releaseMonthButton = page.getByRole('button', { name: 'Liberar rutas del mes' });
  const approveMonthButton = page.getByRole('button', { name: 'Aprobar rutas del mes' });
  await expect(releaseMonthButton).toBeVisible();
  await expect(approveMonthButton).toBeVisible();
  const [releaseMonthBox, approveMonthBox] = await Promise.all([
    releaseMonthButton.boundingBox(),
    approveMonthButton.boundingBox(),
  ]);
  expect(releaseMonthBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(approveMonthBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByText('Ana Supervisor', { exact: true })).toBeVisible();
  await expect(page.getByText('Agosto 2026', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(
      'El mes completo se ajusta al ancho en escritorio; en móvil puedes deslizar para conservar objetivos táctiles legibles.'
    )
  ).toBeVisible();

  const scrollMetrics = await page.locator('table').evaluate((table) => {
    const container = table.parentElement;
    return {
      scrollWidth: container?.scrollWidth ?? 0,
      clientWidth: container?.clientWidth ?? 0,
    };
  });
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);

  const dayButton = page.getByRole('button', {
    name: /Ana Supervisor, 2026-08-02, aprobada, 1 planeadas, 0 realizadas, 1 pendientes/,
  });
  await expect(dayButton).toBeVisible();
  const dayButtonBox = await dayButton.boundingBox();
  expect(dayButtonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: test.info().outputPath('ruta-mensual-calendar-mobile.png'),
    fullPage: true,
  });

  await dayButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-label', 'Ana Supervisor · 02/08');
  await expect(dialog).toContainText('San Pablo Valle');
  await expect(dialog).toContainText('Pendientes');
  await expect(dialog).toContainText('Reposición');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(dayButton).toBeFocused();
});

test('el supervisor planea el mes directamente por fecha con controles táctiles', async ({
  page,
}) => {
  await loginAsSupervisor(page);
  await page.route('**/api/ruta-semanal/pdvs-disponibles?*', async (route) => {
    const month = new URL(route.request().url()).searchParams.get('mes') ?? '2026-10';
    const [year, monthNumber] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        month,
        planeacion: {
          envioId: null,
          estado: 'BORRADOR',
          revision: null,
          totalVisitas: 0,
          totalDiasPlaneados: 0,
          enviadoEn: null,
          revisadoEn: null,
          visitas: [],
        },
        pdvs: [
          {
            id: 'pdv-planner-fixture',
            asignacionId: 'asignacion-fixture',
            cuentaClienteId: 'cuenta-fixture',
            nombre: 'Farmacia Calendario',
            claveBtl: 'CAL-001',
            zona: 'CENTRO',
            direccion: 'Av. Calendario 1',
            latitud: null,
            longitud: null,
            formato: 'FARMACIA',
            horarioReferencia: null,
            diasDisponibles: Array.from(
              { length: lastDay },
              (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
            ),
          },
        ],
      }),
    });
  });

  await page.goto(`${BASE_URL}/ruta-semanal?tab=planning`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('monthly-route-planner')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Envío único mensual')).toBeVisible();

  const monthSelect = page.getByLabel('Mes de la ruta');
  const monthValues = await monthSelect
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  const targetMonth = monthValues.at(-1);
  expect(targetMonth).toBeTruthy();
  await monthSelect.selectOption(targetMonth!);

  const editableDay = page
    .getByTestId('monthly-route-planner')
    .locator('button[aria-label*="visitas"]:not([disabled])')
    .first();
  await expect(editableDay).toBeVisible();
  const dayBox = await editableDay.boundingBox();
  expect(dayBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await editableDay.click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Buscar tienda').fill('Calendario');
  await sheet.getByRole('button', { name: /Farmacia Calendario/ }).click();
  await sheet.getByRole('button', { name: 'Guardar día' }).click();

  await expect(page.getByText('1 visita(s)').first()).toBeVisible();
  const submit = page.getByRole('button', { name: 'Enviar ruta mensual a coordinación' });
  await expect(submit).toBeEnabled();
  const submitBox = await submit.boundingBox();
  expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('mantiene la lista de cuotas legible y táctil en móvil', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/operacion-supervisores?tab=quotas`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.getByRole('heading', { name: 'Cuotas por supervisor' })).toBeVisible({
    timeout: 30000,
  });
  const supervisorSelect = page.getByLabel('Supervisor', { exact: true });
  const supervisorIds = await supervisorSelect
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean)
    );
  const quotaRows = page.getByTestId('quota-row');

  for (const supervisorId of supervisorIds) {
    await supervisorSelect.selectOption(supervisorId);
    if ((await quotaRows.count()) > 0) break;
  }

  expect(await quotaRows.count()).toBeGreaterThan(0);
  const decrementButton = quotaRows.first().getByRole('button', { name: /Disminuir cuota de/i });
  const incrementButton = quotaRows.first().getByRole('button', { name: /Aumentar cuota de/i });
  const quotaInput = quotaRows.first().getByTestId('quota-input');
  const [decrementBox, incrementBox, inputBox] = await Promise.all([
    decrementButton.boundingBox(),
    incrementButton.boundingBox(),
    quotaInput.boundingBox(),
  ]);

  expect(decrementBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(incrementBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(inputBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const viewportMetrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(viewportMetrics.scrollWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth + 1);

  await page.screenshot({
    path: test.info().outputPath('ruta-cuotas-recurrentes-mobile.png'),
    fullPage: true,
  });
});

test.describe('escritorio de ancho completo', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('muestra las cuotas recurrentes en una lista compacta y editable', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/operacion-supervisores?tab=quotas`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: 'Cuotas por supervisor' })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Vigentes hasta que las cambies')).toBeVisible();
    await expect(page.getByText(/los meses anteriores conservan su cuota/i)).toBeVisible();

    const supervisorSelect = page.getByLabel('Supervisor', { exact: true });
    const supervisorIds = await supervisorSelect
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).filter(Boolean)
      );
    const quotaRows = page.getByTestId('quota-row');

    for (const supervisorId of supervisorIds) {
      await supervisorSelect.selectOption(supervisorId);
      if ((await quotaRows.count()) > 0) break;
    }

    expect(await quotaRows.count()).toBeGreaterThan(0);
    await expect(page.getByTestId('quota-input')).toHaveCount(await quotaRows.count());

    const firstRowBox = await quotaRows.first().boundingBox();
    expect(firstRowBox?.height ?? 100).toBeLessThan(80);
    await expect(
      quotaRows.first().getByRole('button', { name: /Disminuir cuota de/i })
    ).toBeVisible();
    await expect(
      quotaRows.first().getByRole('button', { name: /Aumentar cuota de/i })
    ).toBeVisible();

    const quotaPayloadProfile = await page.evaluate(async () => {
      const startedAt = performance.now();
      const response = await fetch('/api/ruta-semanal/panel?surface=quotas');
      const body = await response.text();
      return {
        status: response.status,
        bytes: new TextEncoder().encode(body).length,
        elapsedMs: Math.round(performance.now() - startedAt),
      };
    });
    expect(quotaPayloadProfile.status).toBe(200);
    expect(quotaPayloadProfile.bytes).toBeLessThan(500_000);
    test.info().annotations.push({
      type: 'quota-payload-profile',
      description: JSON.stringify(quotaPayloadProfile),
    });

    await page.screenshot({
      path: test.info().outputPath('ruta-cuotas-recurrentes-lista-compacta.png'),
      fullPage: true,
    });
  });

  test('mantiene los iconos, expande el sidebar y muestra los 31 días sin scroll horizontal', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await mockCalendarEndpoints(page);

    await page.goto(`${BASE_URL}/operacion-supervisores?tab=routes`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Actividad diaria por supervisor' })
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole('button', { name: 'Liberar rutas del mes' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Aprobar rutas del mes' })).toHaveCount(1);
    await expect(page.getByText('Acciones del mes completo')).toBeVisible();

    const mainWidth = await page
      .locator('main')
      .evaluate((main) => main.getBoundingClientRect().width);
    expect(mainWidth).toBeGreaterThanOrEqual(1919);

    const pageHeadingBox = await page
      .getByRole('heading', { name: 'Operación de supervisores', exact: true })
      .boundingBox();
    expect(pageHeadingBox?.x ?? 0).toBeGreaterThanOrEqual(72);

    const sidebar = page.getByTestId('desktop-sidebar');
    const activeModule = page.getByTestId('desktop-nav-operacion-supervisores');
    const dashboardModule = page.getByTestId('desktop-nav-dashboard');
    await expect(sidebar).toHaveAttribute('data-state', 'compact');
    await expect(sidebar).toHaveCSS('width', '72px');
    await expect(activeModule).toBeVisible();
    await expect(activeModule).toHaveAttribute('aria-current', 'page');
    await expect(activeModule).toHaveCSS('width', '48px');
    await expect(dashboardModule).toBeVisible();
    await expect(dashboardModule.getByText('Dashboard', { exact: true })).toBeHidden();

    await activeModule.hover();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
    await expect(sidebar).toHaveCSS('width', '288px');
    await expect(dashboardModule.getByText('Dashboard', { exact: true })).toBeVisible();

    await page.mouse.move(1100, 120);
    await expect(sidebar).toHaveAttribute('data-state', 'compact');
    await expect(sidebar).toHaveCSS('width', '72px');
    await expect(activeModule).toBeVisible();

    const calendarContainer = page.getByTestId('monthly-calendar-scroll-container');
    const scrollMetrics = await calendarContainer.evaluate((container) => ({
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
    }));
    expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.clientWidth + 1);

    const calendarTable = page.getByTestId('monthly-calendar-table');
    await expect(calendarTable.getByRole('columnheader')).toHaveCount(32);

    const compactDayButton = page.getByRole('button', {
      name: /Ana Supervisor, 2026-08-02, aprobada, 1 planeadas, 0 realizadas, 1 pendientes/,
    });
    const compactBox = await compactDayButton.boundingBox();
    expect(compactBox?.height ?? 100).toBeLessThan(44);
    expect(compactBox?.width ?? 100).toBeLessThan(64);

    const lastDayButton = page.getByRole('button', {
      name: /Ana Supervisor, 2026-08-31, sin ruta/,
    });
    await expect(lastDayButton).toBeInViewport();

    await page.screenshot({
      path: test.info().outputPath('ruta-mensual-calendar-full-width.png'),
      fullPage: true,
    });
  });
});
