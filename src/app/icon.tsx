import { ImageResponse } from 'next/og'

export const size = {
  width: 512,
  height: 512,
}

export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(circle at top, #38bdf8 0%, #0f172a 45%, #020617 100%)',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            height: 360,
            width: 360,
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRadius: 72,
            border: '4px solid rgba(255,255,255,0.24)',
            background: 'rgba(15, 23, 42, 0.72)',
            padding: '48px',
          }}
        >
          <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em' }}>
            FFP
          </div>
          <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 0.9 }}>RF</div>
          <div style={{ fontSize: 32, opacity: 0.9 }}>Retail Field Ops</div>
        </div>
      </div>
    ),
    size
  )
}
