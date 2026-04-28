import { expect, test } from 'vitest'

import { resolveEmpleadosInitialTab } from './empleadosTabs'

test('resuelve la pestaña inicial de empleados segun rol y query', () => {
  expect(resolveEmpleadosInitialTab('COORDINADOR', undefined)).toBe('base')
  expect(resolveEmpleadosInitialTab('RECLUTAMIENTO', undefined)).toBe('base')
  expect(resolveEmpleadosInitialTab('ADMINISTRADOR', undefined)).toBe('base')
  expect(resolveEmpleadosInitialTab('COORDINADOR', 'pdvs')).toBe('base')
  expect(resolveEmpleadosInitialTab('RECLUTAMIENTO', ['coordinacion'])).toBe('base')
})
