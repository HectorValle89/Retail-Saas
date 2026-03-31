import { describe, expect, it } from 'vitest'
import { buildReportPdf } from './reportePdf'

describe('buildReportPdf', () => {
  it('genera un PDF valido para exportacion de reportes con branding be te ele', async () => {
    const bytes = await buildReportPdf('ventas', '2026-03', {
      filenameBase: 'ventas-2026-03',
      headers: ['periodo', 'dc', 'producto', 'monto_confirmado'],
      rows: [
        ['2026-03', 'Ana Uno', 'Fusion Water', 1800],
        ['2026-03', 'Ana Dos', 'Fotoprotector', 950],
      ],
    })

    const output = Buffer.from(bytes)
    expect(output.subarray(0, 5).toString('utf8')).toBe('%PDF-')
    expect(output.length).toBeGreaterThan(1000)
  })
})
