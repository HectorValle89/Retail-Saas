const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const XLSX = require('xlsx')
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
  const options = {
    dryRun: false,
    file: path.resolve('INFORMACION PERSONAL AL 25 DE MARZO.xlsx'),
    reportDir: path.resolve('tmp', 'isdin-current-employees-import'),
    forceResetActive: false,
  }

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--force-reset-active') {
      options.forceResetActive = true
      continue
    }

    if (arg === '--file') {
      options.file = path.resolve(args.shift() ?? '')
      continue
    }

    if (arg === '--report-dir') {
      options.reportDir = path.resolve(args.shift() ?? '')
    }
  }

  return options
}

function requireEnv(name) {
  const value = process.env[name] ?? null
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }

  return value
}

function toIso(value) {
  return value.toISOString()
}

function timestampFileSafe(date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function sanitizeToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .replace(/[_\-.]{2,}/g, '_')
}

function normalizeText(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeUpperNoSpaces(value) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return normalized || null
}

function normalizeEmail(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized || null
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D+/g, '')
  return digits || null
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null
    }

    return value > 0 ? value : null
  }

  const normalized = Number(String(value).replace(/,/g, '').trim())
  if (!Number.isFinite(normalized)) {
    return null
  }

  return normalized > 0 ? normalized : null
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (!date || !date.y || !date.m || !date.d) {
      return null
    }

    return `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }

  const trimmed = String(value).trim()
  if (!trimmed) {
    return null
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return trimmed
  }

  const mxMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mxMatch) {
    const day = mxMatch[1].padStart(2, '0')
    const month = mxMatch[2].padStart(2, '0')
    const year = mxMatch[3].length === 2 ? `20${mxMatch[3]}` : mxMatch[3]
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

function normalizePuesto(value) {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

  if (!raw) {
    return null
  }

  if (raw === 'DERMOCONSEJO') return 'DERMOCONSEJERO'
  if (raw === 'SUPERVISOR') return 'SUPERVISOR'
  if (raw === 'COORDINADOR') return 'COORDINADOR'
  if (raw === 'LOVE ISDIN') return 'LOVE_IS'
  if (raw === 'NOMINA') return 'NOMINA'
  if (raw === 'RECLUTAMIENTO') return 'RECLUTAMIENTO'
  if (raw === 'VENTAS') return 'VENTAS'
  if (raw === 'ADMINISTRADOR') return 'ADMINISTRADOR'

  return null
}

function buildPlaceholderEmail(username) {
  return `${username}@provisional.fieldforce.invalid`
}

function createTemporaryPassword() {
  return `Rtl!${crypto.randomBytes(9).toString('base64url')}`
}

function buildOnboardingMetadata(existingMetadata, row, context) {
  const current =
    existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
      ? existingMetadata
      : {}
  const onboarding =
    current.onboarding_inicial &&
    typeof current.onboarding_inicial === 'object' &&
    !Array.isArray(current.onboarding_inicial)
      ? current.onboarding_inicial
      : {}

  return {
    ...current,
    onboarding_inicial: {
      ...onboarding,
      source: 'INFORMACION PERSONAL AL 25 DE MARZO.xlsx',
      source_date: '2026-03-25',
      imported_at: context.importedAt,
      provisional_username: row.usernameProvisional,
      import_kind: 'PADRON_ACTUAL_ISDIN',
      source_snapshot: {
        clave: row.idNomina,
        nombre: row.nombreCompleto,
        nss: row.nss,
        rfc: row.rfc,
        curp: row.curp,
        fecha_alta: row.fechaAlta,
        salario_diario: row.salarioDiario,
        sdi: row.sdi,
        correo: row.correo,
        rol: row.puesto,
        fecha_nacimiento: row.fechaNacimiento,
        domicilio_completo: row.domicilioCompleto,
        codigo_postal: row.codigoPostal,
        telefono: row.telefono,
        edad: row.edad,
        sexo: row.sexo,
        estado_civil: row.estadoCivil,
      },
      primer_acceso: {
        required: context.primerAccesoRequired,
        estado: context.primerAccesoRequired ? 'PENDIENTE' : 'CONFIRMADO',
        source: 'INFORMACION PERSONAL AL 25 DE MARZO.xlsx',
        importedAt: context.importedAt,
        reviewedAt: context.primerAccesoRequired ? null : context.importedAt,
        correctionRequestedAt: null,
        correctionNote: null,
        correctionMessageId: null,
      },
    },
  }
}

function parseWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: null })

  return rawRows
    .map((rawRow, index) => {
      const puesto = normalizePuesto(rawRow['ROL'])
      const usernameProvisional = sanitizeToken(rawRow['USUARIO PROVISIONAL'])
      return {
        rowNumber: index + 2,
        idNomina: normalizeText(rawRow['Clave']),
        nombreCompleto: normalizeText(rawRow['Nombre del trabajador']),
        nss: normalizeUpperNoSpaces(rawRow['NSS']),
        rfc: normalizeUpperNoSpaces(rawRow['RFC']),
        curp: normalizeUpperNoSpaces(rawRow['CURP']),
        fechaAlta: normalizeDate(rawRow['Fecha de Alta']),
        salarioDiario: normalizeNumber(rawRow['Salario Diario']),
        sdi: normalizeNumber(rawRow['SDI']),
        usernameProvisional: usernameProvisional || null,
        correo: normalizeEmail(rawRow['CORREO']),
        puesto,
        fechaNacimiento: normalizeDate(rawRow['Fecha de nacimiento']),
        domicilioCompleto: normalizeText(rawRow['Domicilio Completo']),
        codigoPostal: normalizeText(rawRow['Código postal']),
        telefono: normalizePhone(rawRow['Teléfono celular']),
        edad: normalizeNumber(rawRow['EDAD']),
        sexo: normalizeText(rawRow['SEXO']),
        estadoCivil: normalizeText(rawRow['ESTADO       CIVIL']),
      }
    })
    .filter((row) => row.idNomina || row.nombreCompleto || row.usernameProvisional)
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

async function getIsdinAccountId(supabase) {
  const { data, error } = await supabase
    .from('cuenta_cliente')
    .select('id, nombre, activa')
    .eq('identificador', 'isdin_mexico')
    .maybeSingle()

  if (error || !data || !data.activa) {
    throw error ?? new Error('No fue posible encontrar la cuenta ISDIN Mexico activa.')
  }

  return data.id
}

async function findEmpleadoExistente(supabase, row) {
  if (row.idNomina) {
    const { data, error } = await supabase
      .from('empleado')
      .select('id, id_nomina, metadata')
      .eq('id_nomina', row.idNomina)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (data) {
      return data
    }
  }

  if (row.curp) {
    const { data, error } = await supabase
      .from('empleado')
      .select('id, id_nomina, metadata')
      .eq('curp', row.curp)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (data) {
      return data
    }
  }

  return null
}

async function upsertEmpleado(supabase, row, context) {
  const existing = await findEmpleadoExistente(supabase, row)
  const payload = {
    id_nomina: row.idNomina,
    nombre_completo: row.nombreCompleto,
    curp: row.curp,
    nss: row.nss,
    rfc: row.rfc,
    puesto: row.puesto,
    zona: null,
    correo_electronico: row.correo,
    telefono: row.telefono,
    estatus_laboral: 'ACTIVO',
    fecha_alta: row.fechaAlta,
    fecha_nacimiento: row.fechaNacimiento,
    fecha_baja: null,
    domicilio_completo: row.domicilioCompleto,
    codigo_postal: row.codigoPostal,
    edad: row.edad,
    anios_laborando: null,
    sexo: row.sexo,
    estado_civil: row.estadoCivil,
    originario: null,
    sbc_diario: row.sdi,
    supervisor_empleado_id: null,
    sueldo_base_mensual: row.salarioDiario !== null ? Math.round(row.salarioDiario * 30 * 100) / 100 : null,
    expediente_estado: 'PENDIENTE_DOCUMENTOS',
    imss_estado: 'ALTA_IMSS',
    imss_fecha_alta: row.fechaAlta,
    metadata: buildOnboardingMetadata(existing?.metadata ?? null, row, context),
  }

  if (existing) {
    const { data, error } = await supabase
      .from('empleado')
      .update({
        ...payload,
        updated_at: context.importedAt,
      })
      .eq('id', existing.id)
      .select('id, nombre_completo, metadata')
      .maybeSingle()

    if (error || !data) {
      throw error ?? new Error(`No fue posible actualizar el empleado ${row.nombreCompleto}.`)
    }

    return { empleado: data, action: 'updated' }
  }

  const { data, error } = await supabase
    .from('empleado')
    .insert(payload)
    .select('id, nombre_completo, metadata')
    .maybeSingle()

  if (error || !data) {
    throw error ?? new Error(`No fue posible crear el empleado ${row.nombreCompleto}.`)
  }

  return { empleado: data, action: 'created' }
}

async function findUsuarioExistente(supabase, empleadoId, username) {
  const { data: byEmployee, error: byEmployeeError } = await supabase
    .from('usuario')
    .select('id, auth_user_id, username, estado_cuenta, correo_electronico')
    .eq('empleado_id', empleadoId)
    .maybeSingle()

  if (byEmployeeError) {
    throw byEmployeeError
  }

  if (byEmployee) {
    return byEmployee
  }

  if (!username) {
    return null
  }

  const { data: byUsername, error: byUsernameError } = await supabase
    .from('usuario')
    .select('id, auth_user_id, username, estado_cuenta, correo_electronico, empleado_id')
    .eq('username', username)
    .maybeSingle()

  if (byUsernameError) {
    throw byUsernameError
  }

  return byUsername ?? null
}

async function upsertAuthUser(
  supabase,
  authUsersById,
  authUsersByEmail,
  existingAuthUserId,
  username,
  options
) {
  const placeholderEmail = buildPlaceholderEmail(username)
  const temporaryPassword = createTemporaryPassword()

  if (existingAuthUserId) {
    const existingAuthUser = authUsersById.get(existingAuthUserId) ?? null
    if (existingAuthUser && existingAuthUser.email && !String(existingAuthUser.email).endsWith('@provisional.fieldforce.invalid')) {
      if (!options.forceResetActive) {
        return {
          authUserId: existingAuthUserId,
          temporaryPassword: null,
          placeholderEmail: existingAuthUser.email,
          action: 'kept_existing_auth',
          resetApplied: false,
        }
      }
    }

    if (!options.dryRun) {
      const { data, error } = await supabase.auth.admin.updateUserById(existingAuthUserId, {
        email: placeholderEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          username,
          provisional_email: true,
          source: 'isdin_current_base_import',
        },
      })

      if (!error && data.user) {
        return {
          authUserId: existingAuthUserId,
          temporaryPassword,
          placeholderEmail,
          action: 'updated_auth',
          resetApplied: true,
        }
      }

      if (!/User not found/i.test(error?.message ?? '')) {
        throw error ?? new Error(`No fue posible actualizar auth para ${username}.`)
      }
    }
  }

  const existingByPlaceholderEmail = authUsersByEmail.get(placeholderEmail.toLowerCase()) ?? null
  if (existingByPlaceholderEmail) {
    if (!options.dryRun) {
      const { data, error } = await supabase.auth.admin.updateUserById(existingByPlaceholderEmail.id, {
        email: placeholderEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          username,
          provisional_email: true,
          source: 'isdin_current_base_import',
        },
      })

      if (error || !data.user) {
        throw error ?? new Error(`No fue posible reutilizar auth para ${username}.`)
      }
    }

    return {
      authUserId: existingByPlaceholderEmail.id,
      temporaryPassword,
      placeholderEmail,
      action: 'updated_auth',
      resetApplied: true,
    }
  }

  let createdUserId = crypto.randomUUID()
  if (!options.dryRun) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: placeholderEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        username,
        provisional_email: true,
        source: 'isdin_current_base_import',
      },
    })

      if (error || !data.user) {
        throw error ?? new Error(`No fue posible crear auth para ${username}.`)
      }

      createdUserId = data.user.id
      authUsersByEmail.set(placeholderEmail.toLowerCase(), data.user)
      authUsersById.set(data.user.id, data.user)
    }

  return {
    authUserId: createdUserId,
    temporaryPassword,
    placeholderEmail,
    action: 'created_auth',
    resetApplied: true,
  }
}

async function upsertUsuario(supabase, row, empleadoId, cuentaClienteId, authProvision, context, existingUsuario) {
  const generatedAt = context.importedAt
  const payload = {
    auth_user_id: authProvision.authUserId,
    empleado_id: empleadoId,
    cuenta_cliente_id: cuentaClienteId,
    username: row.usernameProvisional,
    estado_cuenta: 'PROVISIONAL',
    correo_electronico: row.correo,
    correo_verificado: false,
    password_temporal_generada_en: authProvision.resetApplied ? generatedAt : existingUsuario?.password_temporal_generada_en ?? generatedAt,
    password_temporal_expira_en: authProvision.resetApplied ? context.passwordExpiresAt : existingUsuario?.password_temporal_expira_en ?? context.passwordExpiresAt,
    ultimo_acceso_en: null,
    updated_at: generatedAt,
  }

  if (existingUsuario) {
    const { data, error } = await supabase
      .from('usuario')
      .update(payload)
      .eq('id', existingUsuario.id)
      .select('id')
      .maybeSingle()

    if (error || !data) {
      throw error ?? new Error(`No fue posible actualizar el usuario ${row.usernameProvisional}.`)
    }

    return { usuarioId: data.id, action: 'updated' }
  }

  const { data, error } = await supabase
    .from('usuario')
    .insert(payload)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    throw error ?? new Error(`No fue posible crear el usuario ${row.usernameProvisional}.`)
  }

  return { usuarioId: data.id, action: 'created' }
}

function assertRowValid(row) {
  const errors = []

  if (!row.idNomina) {
    errors.push('Falta Clave')
  }

  if (!row.nombreCompleto) {
    errors.push('Falta Nombre del trabajador')
  }

  if (!row.usernameProvisional) {
    errors.push('Falta USUARIO PROVISIONAL')
  }

  if (!row.puesto) {
    errors.push('ROL no mapeado')
  }

  return errors
}

function buildCsv(records) {
  const headers = [
    'clave',
    'nombre_completo',
    'puesto',
    'username_provisional',
    'password_temporal',
    'correo_base',
    'accion_empleado',
    'accion_usuario',
    'accion_auth',
  ]

  const lines = [headers.join(',')]
  for (const record of records) {
    const values = [
      record.idNomina,
      record.nombreCompleto,
      record.puesto,
      record.username,
      record.temporaryPassword,
      record.correo,
      record.empleadoAction,
      record.usuarioAction,
      record.authAction,
    ].map((value) => {
      const text = String(value ?? '')
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`
      }

      return text
    })

    lines.push(values.join(','))
  }

  return lines.join('\n')
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const candidate = {
      message: error.message ?? null,
      code: error.code ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    }

    if (candidate.message || candidate.code || candidate.details || candidate.hint) {
      return JSON.stringify(candidate)
    }
  }

  return String(error)
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))

  const options = parseArgs(process.argv.slice(2))
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const rows = parseWorkbook(options.file)
  const startedAt = new Date()

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
  const generatedAt = toIso(startedAt)
  const expiresAt = toIso(new Date(startedAt.getTime() + tempHours * 60 * 60 * 1000))
  const accountId = await getIsdinAccountId(supabase)
  const authUsers = await listAllAuthUsers(supabase)
  const authUsersById = new Map(authUsers.map((item) => [item.id, item]))
  const authUsersByEmail = new Map(
    authUsers
      .filter((item) => item.email)
      .map((item) => [String(item.email).toLowerCase(), item])
  )

  fs.mkdirSync(options.reportDir, { recursive: true })

  const report = {
    generated_at: generatedAt,
    dry_run: options.dryRun,
    source_file: options.file,
    totals: {
      rows: rows.length,
      created_empleados: 0,
      updated_empleados: 0,
      created_usuarios: 0,
      updated_usuarios: 0,
      created_auth: 0,
      updated_auth: 0,
      kept_existing_auth: 0,
      skipped_invalid: 0,
      skipped_active: 0,
      errors: 0,
    },
    skipped: [],
    errors: [],
    credentials: [],
  }

  for (const row of rows) {
    const rowErrors = assertRowValid(row)
    if (rowErrors.length > 0) {
      report.totals.skipped_invalid += 1
      report.skipped.push({
        row: row.rowNumber,
        id_nomina: row.idNomina,
        nombre_completo: row.nombreCompleto,
        reasons: rowErrors,
      })
      continue
    }

    try {
      const employeeUpsert = await upsertEmpleado(supabase, row, {
        importedAt: generatedAt,
        primerAccesoRequired: true,
      })

      if (employeeUpsert.action === 'created') {
        report.totals.created_empleados += 1
      } else {
        report.totals.updated_empleados += 1
      }

      const existingUsuario = await findUsuarioExistente(
        supabase,
        employeeUpsert.empleado.id,
        row.usernameProvisional
      )

      const isExistingActive = existingUsuario?.estado_cuenta === 'ACTIVA'
      if (isExistingActive && !options.forceResetActive) {
        report.totals.skipped_active += 1
        report.skipped.push({
          row: row.rowNumber,
          id_nomina: row.idNomina,
          nombre_completo: row.nombreCompleto,
          reasons: ['El usuario ya estaba ACTIVO y no se forzo reactivacion'],
        })
        continue
      }

      const authProvision = await upsertAuthUser(
        supabase,
        authUsersById,
        authUsersByEmail,
        existingUsuario?.auth_user_id ?? null,
        row.usernameProvisional,
        options
      )

      if (authProvision.action === 'created_auth') {
        report.totals.created_auth += 1
      } else if (authProvision.action === 'updated_auth') {
        report.totals.updated_auth += 1
      } else {
        report.totals.kept_existing_auth += 1
      }

      const usuarioUpsert = await upsertUsuario(
        supabase,
        row,
        employeeUpsert.empleado.id,
        accountId,
        authProvision,
        {
          importedAt: generatedAt,
          passwordExpiresAt: expiresAt,
        },
        existingUsuario
      )

      if (usuarioUpsert.action === 'created') {
        report.totals.created_usuarios += 1
      } else {
        report.totals.updated_usuarios += 1
      }

      report.credentials.push({
        idNomina: row.idNomina,
        nombreCompleto: row.nombreCompleto,
        puesto: row.puesto,
        username: row.usernameProvisional,
        temporaryPassword: authProvision.temporaryPassword,
        correo: row.correo,
        empleadoAction: employeeUpsert.action,
        usuarioAction: usuarioUpsert.action,
        authAction: authProvision.action,
      })
    } catch (error) {
      report.totals.errors += 1
      report.errors.push({
        row: row.rowNumber,
        id_nomina: row.idNomina,
        nombre_completo: row.nombreCompleto,
        error: formatError(error),
      })
    }
  }

  const stamp = timestampFileSafe(startedAt)
  const jsonPath = path.join(options.reportDir, `isdin-current-employees-import-${stamp}.json`)
  const csvPath = path.join(options.reportDir, `isdin-current-employees-credentials-${stamp}.csv`)

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  fs.writeFileSync(csvPath, buildCsv(report.credentials), 'utf8')

  console.log(
    JSON.stringify(
      {
        report_json: jsonPath,
        credentials_csv: csvPath,
        totals: report.totals,
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
