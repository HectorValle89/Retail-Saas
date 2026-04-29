import Image from 'next/image'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#eff5fb] text-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          src="/login-fluid-blue.png"
          alt=""
          fill
          priority
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,_rgba(244,249,255,0.42)_0%,_rgba(244,249,255,0.18)_35%,_rgba(244,249,255,0.08)_62%,_rgba(244,249,255,0.28)_100%)]" />
        <div className="absolute inset-y-0 left-0 w-full bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.58),_rgba(255,255,255,0)_30%),radial-gradient(circle_at_bottom_left,_rgba(27,125,214,0.14),_rgba(27,125,214,0)_28%),radial-gradient(circle_at_right,_rgba(255,255,255,0.4),_rgba(255,255,255,0)_22%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1360px] items-center px-4 py-5 sm:px-6 lg:px-10">
        <div className="grid w-full items-center gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.72fr)]">
          <section className="relative flex flex-col justify-center lg:pr-10">
            <div className="max-w-[31rem]">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/50 bg-white/72 px-4 py-2 shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur-md">
                <div className="relative h-9 w-9 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <Image
                    src="/beteele-app-icon.png"
                    alt="Beteele One"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#1269b2]">
                    Beteele One
                  </p>
                  <p className="text-xs text-slate-600">
                    Sistema operativo de campo
                  </p>
                </div>
              </div>

              <div className="mt-10 rounded-[34px] border border-white/45 bg-[linear-gradient(180deg,_rgba(10,46,88,0.7)_0%,_rgba(22,82,138,0.52)_100%)] px-7 py-8 shadow-[0_30px_70px_rgba(13,47,87,0.18)] backdrop-blur-md lg:px-8 lg:py-9">
                <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-[#cfe3ff]">
                  Acceso corporativo
                </p>
                <h1 className="mt-5 text-[clamp(2.45rem,4vw,4.35rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">
                  <span className="block">Estrategia visible,</span>
                  <span className="mt-1 block">operacion clara.</span>
                </h1>
                <p className="mt-5 max-w-[24rem] text-[15px] leading-7 text-[#e7f1ff]">
                  Un acceso sereno y preciso para equipos que necesitan foco,
                  orden y lectura inmediata de la operacion.
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center lg:justify-end">
            <div className="w-full rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7 lg:max-w-[30rem] lg:p-8">
              {children}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
