const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function requireEnv(name) {
  const value = process.env[name] ?? null
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }

  return value
}

function toIso(date) {
  return date.toISOString()
}

function buildDefaultWorkflowMetadata(existingMetadata, pdvIds, nowIso) {
  const source = existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}
  const approval = source.approval && typeof source.approval === 'object' ? source.approval : {}
  const changeRequest =
    source.changeRequest && typeof source.changeRequest === 'object' ? source.changeRequest : {}
  const pdvMonthlyQuotas =
    source.pdvMonthlyQuotas && typeof source.pdvMonthlyQuotas === 'object'
      ? { ...source.pdvMonthlyQuotas }
      : {}

  for (const pdvId of pdvIds) {
    if (!Number.isFinite(Number(pdvMonthlyQuotas[pdvId]))) {
      pdvMonthlyQuotas[pdvId] = 1
    }
  }

  return {
    expectedMonthlyVisits:
      Number.isFinite(Number(source.expectedMonthlyVisits)) ? Number(source.expectedMonthlyVisits) : pdvIds.length,
    minimumVisitsPerPdv:
      Number.isFinite(Number(source.minimumVisitsPerPdv)) ? Number(source.minimumVisitsPerPdv) : 1,
    pdvMonthlyQuotas,
    approval: {
      state: 'APROBADA',
      note: 'Ruta test generada para pruebas de checklist.',
      reviewedAt: nowIso,
      reviewedByUsuarioId: approval.reviewedByUsuarioId ?? null,
    },
    changeRequest: {
      status: 'NINGUNO',
      note: null,
      targetVisitId: null,
      targetPdvId: null,
      targetDayLabel: null,
      requestedAt: null,
      requestedByUsuarioId: null,
      resolvedAt: changeRequest.resolvedAt ?? null,
      resolvedByUsuarioId: changeRequest.resolvedByUsuarioId ?? null,
    },
  }
}

function buildEmptyChecklist() {
  return {
    puntal_primera_visita: false,
    registro_supervisor_pdv: false,
    acceso_gerente_solicitado: false,
    feedback_dc_solicitada: false,
    saludo_personalizado_dc: false,
    selfie_con_dc: false,
    foto_producto_lanzamiento: false,
    horario_dc_registrado: false,
    feedback_gerente_registrado: false,
    observaciones_operativas_registradas: false,
    retroalimentacion_venta_entregada: false,
    proceso_venta_verificado: false,
    pronunciacion_reforzada: false,
    feedback_dc_recibida: false,
    cierre_profesional: false,
  }
}

async function fetchSupervisorsAndPdvs(client, emails) {
  const query = `
    select
      e.id as supervisor_id,
      e.nombre_completo as supervisor_nombre,
      e.correo_electronico as supervisor_correo,
      sp.pdv_id,
      p.nombre as pdv_nombre,
      p.clave_btl,
      ccp.cuenta_cliente_id
    from public.empleado e
    join public.supervisor_pdv sp
      on sp.empleado_id = e.id
     and sp.activo = true
    join public.pdv p
      on p.id = sp.pdv_id
    join public.cuenta_cliente_pdv ccp
      on ccp.pdv_id = p.id
     and ccp.activo = true
    where e.correo_electronico = any($1::text[])
    order by e.correo_electronico asc, p.nombre asc
  `

  const { rows } = await client.query(query, [emails])
  const grouped = new Map()

  for (const row of rows) {
    const current =
      grouped.get(row.supervisor_id) ??
      {
        supervisorId: row.supervisor_id,
        supervisorNombre: row.supervisor_nombre,
        supervisorCorreo: row.supervisor_correo,
        cuentaClienteId: row.cuenta_cliente_id,
        pdvs: [],
      }

    current.pdvs.push({
      id: row.pdv_id,
      nombre: row.pdv_nombre,
      claveBtl: row.clave_btl,
    })

    grouped.set(row.supervisor_id, current)
  }

  return Array.from(grouped.values())
}

async function upsertRouteForSupervisor(client, supervisor, weekStart, nowIso) {
  const existingRoute = await client.query(
    `
      select id, metadata
      from public.ruta_semanal
      where supervisor_empleado_id = $1
        and semana_inicio = $2
      order by created_at asc
      limit 1
    `,
    [supervisor.supervisorId, weekStart]
  )

  const pdvIds = supervisor.pdvs.map((pdv) => pdv.id)
  const metadata = buildDefaultWorkflowMetadata(existingRoute.rows[0]?.metadata ?? null, pdvIds, nowIso)

  if (existingRoute.rows[0]) {
    const { rows } = await client.query(
      `
        update public.ruta_semanal
        set
          cuenta_cliente_id = $2,
          estatus = 'PUBLICADA',
          notas = $3,
          metadata = $4::jsonb,
          updated_at = now()
        where id = $1
        returning id
      `,
      [
        existingRoute.rows[0].id,
        supervisor.cuentaClienteId,
        'Ruta test publicada para checklist de visita.',
        JSON.stringify(metadata),
      ]
    )

    return rows[0].id
  }

  const { rows } = await client.query(
    `
      insert into public.ruta_semanal (
        cuenta_cliente_id,
        supervisor_empleado_id,
        semana_inicio,
        estatus,
        notas,
        metadata
      )
      values ($1, $2, $3, 'PUBLICADA', $4, $5::jsonb)
      returning id
    `,
    [
      supervisor.cuentaClienteId,
      supervisor.supervisorId,
      weekStart,
      'Ruta test publicada para checklist de visita.',
      JSON.stringify(metadata),
    ]
  )

  return rows[0].id
}

async function replacePlannedVisits(client, routeId, supervisor, dayNumbers) {
  const existingVisits = await client.query(
    `
      select id, dia_semana, estatus
      from public.ruta_semanal_visita
      where ruta_semanal_id = $1
        and dia_semana = any($2::smallint[])
    `,
    [routeId, dayNumbers]
  )

  const lockedVisits = existingVisits.rows.filter((row) => row.estatus !== 'PLANIFICADA')
  if (lockedVisits.length > 0) {
    const blockedDays = [...new Set(lockedVisits.map((row) => row.dia_semana))].join(', ')
    throw new Error(
      `No se pudo regenerar la ruta del supervisor ${supervisor.supervisorCorreo} porque ya hay visitas no planificadas en los dias ${blockedDays}.`
    )
  }

  await client.query(
    `
      delete from public.ruta_semanal_visita
      where ruta_semanal_id = $1
        and dia_semana = any($2::smallint[])
    `,
    [routeId, dayNumbers]
  )

  const checklist = buildEmptyChecklist()

  for (let index = 0; index < dayNumbers.length; index += 1) {
    const day = dayNumbers[index]
    const pdv = supervisor.pdvs[index % supervisor.pdvs.length]

    await client.query(
      `
        insert into public.ruta_semanal_visita (
          cuenta_cliente_id,
          ruta_semanal_id,
          supervisor_empleado_id,
          pdv_id,
          asignacion_id,
          dia_semana,
          orden,
          estatus,
          checklist_calidad,
          comentarios,
          metadata
        )
        values ($1, $2, $3, $4, null, $5, 1, 'PLANIFICADA', $6::jsonb, null, '{}'::jsonb)
      `,
      [
        supervisor.cuentaClienteId,
        routeId,
        supervisor.supervisorId,
        pdv.id,
        day,
        JSON.stringify(checklist),
      ]
    )
  }
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))

  const databaseUrl = requireEnv('DATABASE_URL')
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  })

  const weekStart = '2026-03-23'
  const plannedDays = [3, 4, 5, 6, 7]
  const supervisorEmails = [
    'test_supervisor_01@fieldforce.test',
    'test_supervisor_02@fieldforce.test',
    'test_supervisor_03@fieldforce.test',
  ]

  await client.connect()

  try {
    const supervisors = await fetchSupervisorsAndPdvs(client, supervisorEmails)

    if (supervisors.length !== supervisorEmails.length) {
      const found = new Set(supervisors.map((item) => item.supervisorCorreo))
      const missing = supervisorEmails.filter((email) => !found.has(email))
      throw new Error(`No se encontraron todos los supervisores test. Faltan: ${missing.join(', ')}`)
    }

    const nowIso = toIso(new Date())
    const summary = []

    await client.query('begin')

    for (const supervisor of supervisors) {
      const routeId = await upsertRouteForSupervisor(client, supervisor, weekStart, nowIso)
      await replacePlannedVisits(client, routeId, supervisor, plannedDays)

      summary.push({
        supervisor: supervisor.supervisorCorreo,
        routeId,
        pdvs: supervisor.pdvs.map((pdv) => pdv.nombre),
        plannedDays,
      })
    }

    await client.query('commit')
    console.log(JSON.stringify({ ok: true, weekStart, summary }, null, 2))
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
