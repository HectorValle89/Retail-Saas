const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const sep = trimmed.indexOf('=')
    if (sep === -1) continue

    const key = trimmed.slice(0, sep).trim()
    const value = trimmed.slice(sep + 1).trim()
    if (override || !process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv) {
  const args = [...argv]
  let dryRun = false
  let reportFile = null
  let username = null
  let email = null
  let employeeId = null

  while (args.length) {
    const arg = args.shift()
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    if (arg === '--report-file') {
      reportFile = args.shift() ?? null
      continue
    }

    if (arg === '--username') {
      username = args.shift() ?? null
      continue
    }

    if (arg === '--email') {
      email = args.shift() ?? null
      continue
    }

    if (arg === '--employee-id') {
      employeeId = args.shift() ?? null
    }
  }

  return { dryRun, reportFile, username, email, employeeId }
}

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function normalizeUsername(value, fallbackId) {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (trimmed) {
    return trimmed
  }

  return `sup_${String(fallbackId ?? '').replace(/-/g, '').slice(0, 12)}`
}

function buildProvisionalEmail(username) {
  return `${username}@provisional.fieldforce.invalid`
}

function mergePrimerAccesoMetadata(metadata) {
  const root =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {}
  const onboarding =
    root.onboarding_inicial && typeof root.onboarding_inicial === 'object' && !Array.isArray(root.onboarding_inicial)
      ? { ...root.onboarding_inicial }
      : {}
  const primerAcceso =
    onboarding.primer_acceso && typeof onboarding.primer_acceso === 'object' && !Array.isArray(onboarding.primer_acceso)
      ? { ...onboarding.primer_acceso }
      : {}

  onboarding.primer_acceso = {
    ...primerAcceso,
    required: true,
    estado: 'PENDIENTE',
    reviewedAt: null,
    correctionRequestedAt: null,
    correctionNote: null,
    correctionMessageId: null,
  }

  root.onboarding_inicial = onboarding
  return root
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))
  loadEnvFile(path.resolve('.dev.vars'), { override: true })

  const { dryRun, reportFile, username, email, employeeId } = parseArgs(process.argv.slice(2))
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: supervisoresEmpleados, error: supervisorError } = await service
    .from('empleado')
    .select('id, nombre_completo, metadata, estatus_laboral, puesto')
    .eq('puesto', 'SUPERVISOR')

  if (supervisorError) {
    throw supervisorError
  }

  const supervisorEmpleadoIds = new Set((supervisoresEmpleados ?? []).map((item) => item.id))

  const { data: todosUsuarios, error: usuariosError } = await service
    .from('usuario')
    .select(`
      id,
      auth_user_id,
      username,
      correo_electronico,
      estado_cuenta,
      empleado_id,
      empleado:empleado_id(nombre_completo, metadata, estatus_laboral, puesto)
    `)
    .not('auth_user_id', 'is', null)

  if (usuariosError) {
    throw usuariosError
  }

  const normalizedUsernameFilter = typeof username === 'string' ? username.trim().toLowerCase() : null
  const normalizedEmailFilter = typeof email === 'string' ? email.trim().toLowerCase() : null
  const normalizedEmployeeIdFilter = typeof employeeId === 'string' ? employeeId.trim() : null

  const supervisores = (todosUsuarios ?? []).filter((usuario) => {
    const matchesSupervisorRole = supervisorEmpleadoIds.has(usuario.empleado_id)

    if (!matchesSupervisorRole) {
      return false
    }

    if (!normalizedUsernameFilter && !normalizedEmailFilter && !normalizedEmployeeIdFilter) {
      return true
    }

    const matchesEmployeeId =
      normalizedEmployeeIdFilter && usuario.empleado_id === normalizedEmployeeIdFilter
    const matchesUsername =
      normalizedUsernameFilter &&
      String(usuario.username ?? '').trim().toLowerCase() === normalizedUsernameFilter
    const matchesEmail =
      normalizedEmailFilter &&
      String(usuario.correo_electronico ?? '').trim().toLowerCase() === normalizedEmailFilter

    return Boolean(matchesEmployeeId || matchesUsername || matchesEmail)
  })

  const empleadoNombres = new Map(
    (supervisoresEmpleados ?? []).map((empleado) => [empleado.id, empleado.nombre_completo])
  )

  const ahora = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
  const report = []
  let updated = 0
  let skipped = 0

  for (const usuario of supervisores) {
    const normalizedUsername = normalizeUsername(usuario.username, usuario.id)
    const provisionalEmail = buildProvisionalEmail(normalizedUsername)
    const empleadoRelacionado = Array.isArray(usuario.empleado)
      ? usuario.empleado[0] ?? null
      : usuario.empleado ?? null

    if (!dryRun) {
      const { error: deleteFlowsError } = await service
        .from('auth_activation_flow')
        .delete()
        .eq('usuario_id', usuario.id)

      if (deleteFlowsError) {
        throw deleteFlowsError
      }

      const { error: authError } = await service.auth.admin.updateUserById(usuario.auth_user_id, {
        email: provisionalEmail,
        password: 'BTL2026',
        email_confirm: true,
        user_metadata: {
          username: normalizedUsername,
          provisional_email: true,
          allow_username_login: true,
          first_access_password: true,
          pending_email: null,
          confirmed_email: null,
          activated_at: null,
          source: 'supervisor_surgical_reset',
          reset_at: ahora,
        },
      })

      if (authError) {
        throw authError
      }

      const { error: usuarioError } = await service
        .from('usuario')
        .update({
          username: usuario.username ?? normalizedUsername,
          estado_cuenta: 'PROVISIONAL',
          correo_verificado: false,
          correo_electronico: provisionalEmail,
          password_temporal_generada_en: ahora,
          password_temporal_expira_en: expiresAt,
          ultimo_acceso_en: null,
          updated_at: ahora,
        })
        .eq('id', usuario.id)

      if (usuarioError) {
        throw usuarioError
      }

      if (usuario.empleado_id && empleadoRelacionado?.metadata !== undefined) {
        const { error: empleadoError } = await service
          .from('empleado')
          .update({
            metadata: mergePrimerAccesoMetadata(empleadoRelacionado.metadata),
            updated_at: ahora,
          })
          .eq('id', usuario.empleado_id)

        if (empleadoError) {
          throw empleadoError
        }
      }

      updated += 1
    } else {
      skipped += 1
    }

    report.push({
      usuario_id: usuario.id,
      nombre: empleadoNombres.get(usuario.empleado_id) ?? 'Desconocido',
      estado_original: usuario.estado_cuenta,
      estado_final: 'PROVISIONAL',
      correo_final: provisionalEmail,
      action: dryRun ? 'would_reset_to_provisional' : 'reset_to_provisional',
    })
  }

  const reportPath = reportFile
    ? path.resolve(reportFile)
    : path.resolve('tmp', `supervisor-reset-${ahora.replace(/[:.]/g, '-')}.json`)

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generated_at: ahora,
        dry_run: dryRun,
        report,
        totals: {
          supervisores: supervisores.length,
          updated,
          skipped,
        },
      },
      null,
      2
    ),
    'utf8'
  )

    console.log(
      JSON.stringify(
        {
          dry_run: dryRun,
          scope: {
            username: normalizedUsernameFilter,
            email: normalizedEmailFilter,
            employee_id: normalizedEmployeeIdFilter,
          },
          report_file: reportPath,
          totals: {
            supervisores: supervisores.length,
          updated,
          skipped,
        },
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
