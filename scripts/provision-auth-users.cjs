const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createClient } = require('@supabase/supabase-js')

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

function parseArgs(argv) {
  const args = [...argv]
  let dryRun = false
  let reportFile = null

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    if (arg === '--report-file') {
      reportFile = args.shift() ?? null
    }
  }

  return {
    dryRun,
    reportFile,
  }
}

function requireEnv(name) {
  const value = process.env[name] ?? null
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function createTemporaryPassword() {
  return `Rtl!${crypto.randomBytes(9).toString('base64url')}`
}

function normalizePlaceholderUsername(value, usuarioId) {
  if (value && value.trim()) {
    return value.trim().toLowerCase()
  }

  return `usr_${usuarioId.replace(/-/g, '').slice(0, 12)}`
}

function buildPlaceholderEmail(username) {
  return `${username}@provisional.fieldforce.invalid`
}

async function listAllAuthUsers(supabase) {
  const users = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })

    if (error) {
      throw error
    }

    const batch = data?.users ?? []
    users.push(...batch)

    if (batch.length < perPage) {
      break
    }

    page += 1
  }

  return users
}

function toIso(value) {
  return value.toISOString()
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))

  const { dryRun, reportFile } = parseArgs(process.argv.slice(2))
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: configRow } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'auth.activacion.password_temporal_horas')
    .maybeSingle()

  const tempHours = Number(configRow?.valor ?? 72) || 72
  const generatedAt = new Date()
  const expiresAt = new Date(generatedAt.getTime() + tempHours * 60 * 60 * 1000)

  const { data: usuariosData, error: usuariosError } = await supabase
    .from('usuario')
    .select(`
      id,
      empleado_id,
      cuenta_cliente_id,
      auth_user_id,
      username,
      estado_cuenta,
      correo_electronico,
      empleado:empleado_id(nombre_completo)
    `)
    .order('created_at', { ascending: true })

  if (usuariosError) {
    throw usuariosError
  }

  const usuarios = usuariosData ?? []
  const authUsers = await listAllAuthUsers(supabase)
  const authUsersByEmail = new Map(
    authUsers
      .filter((user) => user.email)
      .map((user) => [String(user.email).toLowerCase(), user])
  )

  const report = []
  let created = 0
  let linkedExisting = 0
  let updatedRows = 0
  let skipped = 0

  for (const usuario of usuarios) {
    if (usuario.auth_user_id) {
      skipped += 1
      report.push({
        usuario_id: usuario.id,
        username: usuario.username,
        empleado: usuario.empleado?.nombre_completo ?? 'Sin empleado',
        action: 'already_linked',
      })
      continue
    }

    const normalizedUsername = normalizePlaceholderUsername(usuario.username, usuario.id)
    const currentState = usuario.estado_cuenta
    const targetState =
      currentState === 'ACTIVA'
        ? 'ACTIVA'
        : currentState === 'SUSPENDIDA' || currentState === 'BAJA'
          ? currentState
          : 'PROVISIONAL'

    const useRealEmail = targetState === 'ACTIVA' && Boolean(usuario.correo_electronico)
    const loginEmail = useRealEmail
      ? String(usuario.correo_electronico).toLowerCase()
      : buildPlaceholderEmail(normalizedUsername)

    const existingAuthUser = authUsersByEmail.get(loginEmail)
    let authUserId = existingAuthUser?.id ?? null
    let tempPassword = null
    let action = existingAuthUser ? 'linked_existing_auth' : 'created_auth_user'

    if (!existingAuthUser) {
      tempPassword = createTemporaryPassword()

      if (!dryRun) {
        const { data: createdAuth, error: createError } = await supabase.auth.admin.createUser({
          email: loginEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            username: normalizedUsername,
            provisional_email: !useRealEmail,
            source: 'retail_auth_provisioning',
          },
        })

        if (createError || !createdAuth.user) {
          throw createError ?? new Error(`Failed to create auth user for ${normalizedUsername}`)
        }

        authUserId = createdAuth.user.id
      } else {
        authUserId = `dry-run-${usuario.id}`
      }

      created += 1
    } else {
      linkedExisting += 1
    }

    if (!dryRun) {
      const updatePayload = {
        auth_user_id: authUserId,
        username: usuario.username ?? normalizedUsername,
        estado_cuenta: targetState,
        password_temporal_generada_en: toIso(generatedAt),
        password_temporal_expira_en: toIso(expiresAt),
        updated_at: toIso(generatedAt),
      }

      const { error: updateError } = await supabase
        .from('usuario')
        .update(updatePayload)
        .eq('id', usuario.id)

      if (updateError) {
        throw updateError
      }

      updatedRows += 1
    }

    report.push({
      usuario_id: usuario.id,
      username: usuario.username ?? normalizedUsername,
      empleado: usuario.empleado?.nombre_completo ?? 'Sin empleado',
      estado_original: currentState,
      estado_final: targetState,
      login_email: loginEmail,
      temporary_password: tempPassword,
      auth_user_id: authUserId,
      action,
    })
  }

  const reportPath = reportFile
    ? path.resolve(reportFile)
    : path.resolve('tmp', `auth-provisioning-report-${generatedAt.toISOString().replace(/[:.]/g, '-')}.json`)

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generated_at: toIso(generatedAt),
        expires_at: toIso(expiresAt),
        dry_run: dryRun,
        totals: {
          usuarios: usuarios.length,
          created,
          linked_existing: linkedExisting,
          updated_rows: updatedRows,
          skipped,
        },
        report,
      },
      null,
      2
    ),
    'utf8'
  )

  const { count: totalUsuarios } = await supabase
    .from('usuario')
    .select('*', { count: 'exact', head: true })

  const { count: usuariosConAuth } = await supabase
    .from('usuario')
    .select('*', { count: 'exact', head: true })
    .not('auth_user_id', 'is', null)

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        report_file: reportPath,
        totals: {
          usuarios: totalUsuarios ?? usuarios.length,
          usuarios_con_auth: usuariosConAuth ?? 0,
          created,
          linked_existing: linkedExisting,
          updated_rows: updatedRows,
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
