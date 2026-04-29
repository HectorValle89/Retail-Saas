import { redirect } from 'next/navigation'
import { FirstAccessReviewForm } from '@/features/auth/components'
import { readPrimerAccesoMetadata } from '@/lib/auth/firstAccess'
import { obtenerActorActual } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

function formatValue(value: string | number | null | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized || 'Sin dato visible'
}

function formatDateValue(value: string | null) {
  if (!value) {
    return 'Sin dato visible'
  }

  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

export default async function PrimerAccesoPage() {
  const actor = await obtenerActorActual()

  if (!actor) {
    redirect('/login')
  }

  if (
    actor.estadoCuenta !== 'ACTIVA' &&
    actor.estadoCuenta !== 'PENDIENTE_PRIMER_LOGIN'
  ) {
    redirect('/activacion')
  }

  const supabase = await createClient({ bypassTenantScope: true })
  const { data: empleado } = await supabase
    .from('empleado')
    .select(`
      id,
      id_nomina,
      nombre_completo,
      curp,
      nss,
      rfc,
      puesto,
      zona,
      correo_electronico,
      telefono,
      fecha_alta,
      fecha_nacimiento,
      domicilio_completo,
      codigo_postal,
      edad,
      sexo,
      estado_civil,
      originario,
      metadata
    `)
    .eq('id', actor.empleadoId)
    .maybeSingle()

  if (!empleado) {
    redirect('/dashboard')
  }

  const primerAcceso = readPrimerAccesoMetadata(empleado.metadata)
  const requierePrimerAcceso =
    actor.estadoCuenta === 'PENDIENTE_PRIMER_LOGIN' ||
    (primerAcceso.required && primerAcceso.estado === 'PENDIENTE')

  if (!requierePrimerAcceso) {
    redirect('/dashboard')
  }

  const correoVisible = actor.correoElectronico ?? empleado.correo_electronico

  const fields = [
    { label: 'Clave / nomina', value: formatValue(empleado.id_nomina) },
    { label: 'Nombre completo', value: formatValue(empleado.nombre_completo) },
    { label: 'Rol', value: formatValue(empleado.puesto) },
    { label: 'Correo actual', value: formatValue(correoVisible) },
    { label: 'Telefono celular', value: formatValue(empleado.telefono) },
    { label: 'CURP', value: formatValue(empleado.curp) },
    { label: 'RFC', value: formatValue(empleado.rfc) },
    { label: 'NSS', value: formatValue(empleado.nss) },
    { label: 'Fecha de alta', value: formatDateValue(empleado.fecha_alta) },
    { label: 'Fecha de nacimiento', value: formatDateValue(empleado.fecha_nacimiento) },
    { label: 'Domicilio completo', value: formatValue(empleado.domicilio_completo) },
    { label: 'Codigo postal', value: formatValue(empleado.codigo_postal) },
    { label: 'Edad', value: formatValue(empleado.edad) },
    { label: 'Sexo', value: formatValue(empleado.sexo) },
    { label: 'Estado civil', value: formatValue(empleado.estado_civil) },
    { label: 'Originario', value: formatValue(empleado.originario) },
    { label: 'Zona', value: formatValue(empleado.zona) },
  ]

  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Primer acceso
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Revisa y confirma tus datos
        </h1>
        <p className="mt-2 text-slate-600">
          Esta informacion proviene de la base actual del equipo ISDIN. Confirma si esta correcta
          o solicita una correccion antes de continuar. Este paso es obligatorio y mantendra bloqueado el acceso al dashboard hasta que tomes una decision.
        </p>
      </div>

      <FirstAccessReviewForm
        nombreCompleto={empleado.nombre_completo}
        username={actor.username}
        fields={fields}
      />
    </div>
  )
}
