import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { compareBiometricBuffers } from './attendanceBiometrics'

async function buildFaceSvg(options?: { accent?: string; eyeDx?: number; mouthOffset?: number }) {
  const accent = options?.accent ?? '#1d4ed8'
  const eyeDx = options?.eyeDx ?? 0
  const mouthOffset = options?.mouthOffset ?? 0

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
      <rect width="100%" height="100%" fill="#f8fafc" />
      <rect x="56" y="52" width="208" height="292" rx="104" fill="#e2e8f0" />
      <circle cx="120" cy="170" r="18" fill="#0f172a" />
      <circle cx="200" cy="170" r="18" fill="#0f172a" />
      <circle cx="${120 + eyeDx}" cy="170" r="7" fill="#ffffff" />
      <circle cx="${200 + eyeDx}" cy="170" r="7" fill="#ffffff" />
      <rect x="149" y="190" width="22" height="62" rx="11" fill="#475569" />
      <path d="M 108 ${286 + mouthOffset} Q 160 ${318 + mouthOffset} 212 ${286 + mouthOffset}" stroke="${accent}" stroke-width="12" fill="none" stroke-linecap="round" />
      <rect x="84" y="336" width="152" height="38" rx="19" fill="${accent}" opacity="0.9" />
    </svg>
  `

  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer()
}

describe('attendance biometrics comparator', () => {
  it('mantiene un score alto para variantes cercanas de la misma referencia', async () => {
    const reference = await buildFaceSvg()
    const similar = await buildFaceSvg({ mouthOffset: 4 })

    const score = await compareBiometricBuffers({
      selfieBuffer: similar,
      referenceBuffer: reference,
    })

    expect(score).toBeGreaterThan(0.8)
  })

  it('reduce el score cuando la imagen es materialmente distinta', async () => {
    const reference = await buildFaceSvg()
    const different = await buildFaceSvg({ accent: '#b91c1c', eyeDx: 26, mouthOffset: -26 })

    const score = await compareBiometricBuffers({
      selfieBuffer: different,
      referenceBuffer: reference,
    })

    expect(score).toBeLessThan(0.8)
  })
})
