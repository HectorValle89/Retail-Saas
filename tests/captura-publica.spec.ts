import { expect, test } from '@playwright/test';

test('el control de cantidad (stepper) incrementa y decrementa de uno en uno en el formulario de captura pública', async ({ page }) => {
  // 1. Navegar a la página de captura pública
  await page.goto('http://127.0.0.1:3000/captura/isdin-mexico', { waitUntil: 'domcontentloaded' });

  // 2. Esperar a que la página y el formulario carguen
  await expect(page.locator('h1')).toContainText('ISDIN México - Portal Dermoconsejo');

  // 3. Seleccionar un Producto directamente (sin depender de PDV/Dermoconsejera para probar el stepper)
  const prodSelectBtn = page.locator('button:has-text("Buscar o elegir producto...")');
  await prodSelectBtn.click();
  
  const prodSearchInput = page.locator('input[placeholder="Escribe para buscar..."]');
  await expect(prodSearchInput).toBeVisible();
  
  // Buscar 'POMADA' (un producto estándar en el catálogo)
  await prodSearchInput.fill('POMADA');
  const prodOption = page.locator('button:has-text("POMADA DEL PAÑAL REGENERADORA ZN40")');
  await expect(prodOption).toBeVisible();
  await prodOption.click();

  // 4. Verificar que la cantidad inicial sea 1
  const cantidadLabel = page.locator('div.w-12.text-center.font-black');
  await expect(cantidadLabel).toHaveText('1');

  // 5. Localizar el botón de incremento (+)
  const incrementBtn = page.locator('button:has-text("+")');

  // 6. Hacer un clic en incrementar y verificar que sea exactamente 2 (y no 3 debido al bug de doble disparo)
  await incrementBtn.click();
  await expect(cantidadLabel).toHaveText('2');

  // 7. Hacer otro clic en incrementar y verificar que sea exactamente 3
  await incrementBtn.click();
  await expect(cantidadLabel).toHaveText('3');

  // 8. Localizar el botón de decremento (−)
  const decrementBtn = page.locator('button:has-text("−")');

  // 9. Hacer un clic en decrementar y verificar que sea exactamente 2
  await decrementBtn.click();
  await expect(cantidadLabel).toHaveText('2');

  // 10. Hacer otro clic en decrementar y verificar que sea exactamente 1
  await decrementBtn.click();
  await expect(cantidadLabel).toHaveText('1');

  // 11. Hacer otro clic en decrementar y verificar que se mantenga en 1 (límite mínimo)
  await decrementBtn.click();
  await expect(cantidadLabel).toHaveText('1');
});
