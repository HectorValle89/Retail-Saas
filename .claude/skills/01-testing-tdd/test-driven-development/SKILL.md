---
name: test-driven-development
description: Framework TDD completo (RED-GREEN-REFACTOR) para Beteele SAAS
---

# Test-Driven Development para Beteele SAAS

## Overview
Implementa el ciclo TDD completo para lógica de negocio crítica en Beteele Platform.

## Cuando Usar
- **ANTES** de implementar cálculo de cuotas diarias
- **ANTES** de modificar lógica de asignaciones temporales
- **ANTES** de cambiar recálculo de asistencias
- Cualquier función que manipule datos de `assignments_daily`, `employees`, `attendance`

## Proceso TDD

### 🔴 RED - Escribir Test que Falla
```typescript
// Ejemplo: Test para calcularMetaDiaria()
import { calcularMetaDiaria } from '@/lib/quota-calculator';

describe('calcularMetaDiaria', () => {
  it('debe calcular cuota diaria correctamente para bloque mensual', () => {
    const result = calcularMetaDiaria({
      cuotaMensual: 30000,
      diasRealesBloque: 25,
      factor: 1.0
    });
    
    expect(result).toBe(1200); // 30000 / 25 * 1.0
  });
});
```

### 🟢 GREEN - Código Mínimo que Pasa
```typescript
export function calcularMetaDiaria(params: QuotaParams): number {
  const { cuotaMensual, diasRealesBloque, factor } = params;
  return (cuotaMensual / diasRealesBloque) * factor;
}
```

### 🔵 REFACTOR - Mejorar sin Romper Tests
```typescript
export function calcularMetaDiaria(params: QuotaParams): number {
  const { cuotaMensual, diasRealesBloque, factor } = params;
  
  if (diasRealesBloque === 0) {
    throw new Error('diasRealesBloque no puede ser 0');
  }
  
  return Math.round((cuotaMensual / diasRealesBloque) * factor);
}
```

## Casos de Uso en Beteele

### 1. Cálculo de Cuotas
```typescript
describe('Quota Calculator', () => {
  test('ajusta por días laborales reales del mes');
  test('aplica factor correcto');
  test('maneja casos edge (febrero, año bisiesto)');
});
```

### 2. Sincronización Offline
```typescript
describe('Offline Sync Queue', () => {
  test('guarda registros en IndexedDB cuando offline');
  test('sincroniza en orden FIFO al recuperar conexión');
  test('maneja conflictos (mismo registro editado online)');
});
```

### 3. Validación de API Rules
```typescript
describe('PocketBase Security Rules', () => {
  test('nómina NO puede editar asistencias');
  test('DC solo ve sus PDVs asignados');
  test('supervisor solo ve su territorio');
});
```

## Comandos
```bash
# Ejecutar tests
npm run test

# Watch mode
npm run test:watch

# Cobertura
npm run test:coverage
```

## Reglas para Beteele
1. **Atomicidad Diaria**: Tests deben validar cálculos por DÍA, no promedios mensuales
2. **SQL Syntax**: Tests de queries deben usar sintaxis PocketBase (`user_id = @request.auth.id`)
3. **Offline-First**: Mock IndexedDB en tests de sincronización
