import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPreviousWeekStartIso, getWeekDateIso, getWeekStartIso } from './weeklyRoute'

describe('weeklyRoute date helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('normaliza una fecha al inicio de la semana', () => {
    expect(getWeekStartIso('2026-04-19')).toBe('2026-04-13')
  })

  it('usa el dia operativo de Mexico cuando calcula la semana actual sin referencia', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T02:30:00.000Z'))

    expect(getWeekStartIso()).toBe('2026-04-06')
  })

  it('resuelve la semana anterior al inicio normalizado', () => {
    expect(getPreviousWeekStartIso('2026-04-19')).toBe('2026-04-06')
    expect(getPreviousWeekStartIso('2026-04-13')).toBe('2026-04-06')
  })

  it('convierte un dia operativo de ruta a fecha ISO dentro de la semana', () => {
    expect(getWeekDateIso('2026-04-20', 1)).toBe('2026-04-20')
    expect(getWeekDateIso('2026-04-20', 4)).toBe('2026-04-23')
    expect(getWeekDateIso('2026-04-20', 7)).toBe('2026-04-26')
  })
})
