export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#031525_0%,_#0f3b63_48%,_#dce9f5_48%,_#f6f9fc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <section className="hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:px-14 lg:py-16">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
              Retail Workforce
            </div>
            <h1 className="mt-8 max-w-xl text-5xl font-semibold leading-tight text-white">
              Operacion de campo con reglas claras, evidencia y trazabilidad.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/74">
              Acceso al dashboard corporativo y a la operacion movil de promotores,
              supervisores, coordinacion y administracion.
            </p>
          </div>

          <div className="space-y-4 text-sm text-white/72">
            <p>Asistencias con GPS y selfie.</p>
            <p>Asignaciones, ventas, cuotas y nomina.</p>
            <p>Bitacora, control multirol y crecimiento por cuentas cliente.</p>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-md rounded-[28px] border border-white/55 bg-white/92 p-8 shadow-[0_24px_80px_rgba(3,21,37,0.16)] backdrop-blur">
            {children}
          </div>
        </section>
      </div>
    </div>
  )
}
