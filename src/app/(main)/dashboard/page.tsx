import { requerirActorActivo } from '@/lib/auth/session'

const modules = [
  {
    title: 'Estructura maestra',
    items: ['Clientes', 'Empleados', 'PDVs', 'Usuarios', 'Configuracion', 'Reglas'],
  },
  {
    title: 'Planeacion operativa',
    items: ['Asignaciones', 'Ruta semanal', 'Campanas', 'Formaciones'],
  },
  {
    title: 'Ejecucion diaria',
    items: ['Asistencias', 'Ventas', 'LOVE ISDIN', 'Solicitudes', 'Entrega de material'],
  },
  {
    title: 'Control y gobierno',
    items: ['Nomina', 'Cuotas', 'Reportes', 'Bitacora', 'Mensajes'],
  },
]

export const metadata = {
  title: 'Dashboard | Field Force Platform',
}

export default async function DashboardPage() {
  const actor = await requerirActorActivo()

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <section className="rounded-[32px] bg-slate-950 px-8 py-10 text-white shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
          Field Force Platform
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Bienvenido, {actor.nombreCompleto}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          Acceso activo para el puesto <span className="font-semibold text-white">{actor.puesto}</span>. Este tablero
          queda preparado para evolucionar hacia los modulos definidos en `design.md`,
          `requirements.md` y `tasks.md`.
        </p>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        {modules.map((module) => (
          <article
            key={module.title}
            className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-slate-950">{module.title}</h2>
            <ul className="mt-5 space-y-3 text-sm text-slate-600">
              {module.items.map((item) => (
                <li key={item} className="rounded-2xl bg-slate-50 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  )
}
