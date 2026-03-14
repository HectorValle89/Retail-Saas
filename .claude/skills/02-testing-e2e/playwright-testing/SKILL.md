---
name: playwright-testing
description: Testing E2E de flujos críticos PWA con Playwright
---

# Playwright Testing para Beteele PWA

##Overview
Tests end-to-end de flujos críticos en la PWA Mobile-First de Beteele.

## Cuando Usar
- Después de cambios en flujo de asistencia
- Al modificar sincronización offline
- Cambios en matriz de asistencia
- Cualquier feature que use cámara o geolocalización

## Configuración

```typescript
// playwright.config.ts para Beteele
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] }, // Target: Operarios de campo
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
```

## Flujos Críticos en Beteele

### 1. Registro de Asistencia con Foto
```typescript
import { test, expect } from '@playwright/test';

test('DC registra asistencia con foto y timestamp', async ({ page, context }) => {
  // Login como DC
  await page.goto('/login');
  await page.fill('[name="email"]', 'dc01@beteele.com');
  await page.fill('[name="password"]', 'test123');
  await page.click('button[type="submit"]');
  
  // Navegar a registro
  await page.click('text=Registrar Asistencia');
  
  // Mock de cámara
  await context.grantPermissions(['camera']);
  
  // Tomar foto
  await page.click('button:has-text("Capturar Foto")');
  await page.waitForSelector('img[alt*="Captura"]');
  
  // Verificar timestamp en verde neón
  const timestamp = await page.locator('.photo-timestamp');
  await expect(timestamp).toBeVisible();
  await expect(timestamp).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  
  // Enviar registro
  await page.click('button:has-text("Confirmar Asistencia")');
  
  // Verificar éxito
  await expect(page.locator('.toast-success')).toContainText('Asistencia registrada');
});
```

### 2. Sincronización Offline
```typescript
test('Registros se guardan offline y sincronizan al reconectar', async ({ page, context }) => {
  await page.goto('/asistencia');
  
  // Simular offline
  await context.setOffline(true);
  
  // Registrar asistencia (debe guardarse en IndexedDB)
  await page.click('button:has-text("Registrar")');
  await expect(page.locator('.offline-indicator')).toContainText('Sin conexión');
  await expect(page.locator('.toast-info')).toContainText('Guardado localmente');
  
  // Reconectar
  await context.setOffline(false);
  await page.reload();
  
  // Verificar sincronización
  await expect(page.locator('.sync-status')).toContainText('Sincronizado');
  
  // Verificar registro en PocketBase (mock o API real)
  const response = await page.request.get('/api/attendance/latest');
  expect(response.status()).toBe(200);
});
```

### 3. Matriz de Asistencia (Performance)
```typescript
test('Matriz carga 500+ colaboradores en <2s', async ({ page }) => {
  await page.goto('/admin/asistencia');
  
  const startTime = Date.now();
  await page.waitForSelector('table tbody tr', { timeout: 5000 });
  const loadTime = Date.now() - startTime;
  
  // Verificar performance
  expect(loadTime).toBeLessThan(2000);
  
  // Verificar cálculo correcto de estados
  const faltasCount = await page.locator('td:has-text("Falta")').count();
  const pendingCount = await page.locator('td:has-text("Pending")').count();
  
  expect(faltasCount + pendingCount).toBeGreaterThan(0);
});
```

## Comandos
```bash
# Ejecutar todos los tests E2E
npx playwright test

# Modo UI (debugging)
npx playwright test --ui

# Específico para mobile
npx playwright test --project="Mobile Chrome"

# Con video
npx playwright test --headed
```

## Buenas Prácticas Beteele
1. **Mobile-First**: Siempre testear en viewports móviles primero
2. **Offline Testing**: Incluir pruebas de desconexión en flujos críticos
3. **Performance**: Validar tiempos de carga (matriz < 2s, sync < 5s)
4. **Timezone**: Mock de timezone para tests de timestamp
