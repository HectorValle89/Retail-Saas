const fs = require('node:fs')
const path = require('node:path')
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

function requireEnv(name) {
  const value = process.env[name] ?? null
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }

  return value
}

function timestampFileSafe(date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function toIso(value) {
  return value.toISOString()
}

function buildPhone(index) {
  return `5510000${String(index).padStart(3, '0')}`
}

function buildCurp(token, index) {
  const suffix = String(index).padStart(2, '0')
  return `TST${token}900101HDF${suffix}AA`.slice(0, 18)
}

function buildRfc(token, index) {
  const suffix = String(index).padStart(2, '0')
  return `TST${token}900101${suffix}`.slice(0, 13)
}

function buildNss(index) {
  return `99010${String(index).padStart(6, '0')}`
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

async function ensureDemoAccountId(supabase) {
  const { data, error } = await supabase
    .from('cuenta_cliente')
    .select('id, identificador, activa')
    .eq('identificador', 'be_te_ele_demo')
    .maybeSingle()

  if (error || !data || !data.activa) {
    throw error ?? new Error('No fue posible encontrar la cuenta cliente activa be_te_ele_demo.')
  }

  return data.id
}

async function findEmpleadoByIdNomina(supabase, idNomina) {
  const { data, error } = await supabase
    .from('empleado')
    .select('id, id_nomina, nombre_completo, puesto, supervisor_empleado_id')
    .eq('id_nomina', idNomina)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ?? null
}

async function upsertEmpleado(supabase, spec) {
  const existing = await findEmpleadoByIdNomina(supabase, spec.idNomina)
  const nowIso = toIso(new Date())

  if (existing) {
    const { data, error } = await supabase
      .from('empleado')
      .update({
        nombre_completo: spec.nombreCompleto,
        puesto: spec.puesto,
        zona: spec.zona,
        correo_electronico: spec.email,
        telefono: spec.telefono,
        estatus_laboral: 'ACTIVO',
        fecha_baja: null,
        supervisor_empleado_id: spec.supervisorEmpleadoId,
        expediente_estado: 'PENDIENTE_DOCUMENTOS',
        imss_estado: 'NO_INICIADO',
        metadata: {
          source: 'test_users_by_role_script',
          test_user: true,
          role: spec.puesto,
          sequence: spec.sequence,
        },
        updated_at: nowIso,
      })
      .eq('id', existing.id)
      .select('id, id_nomina, nombre_completo, puesto')
      .maybeSingle()

    if (error || !data) {
      throw error ?? new Error(`No fue posible actualizar el empleado ${spec.idNomina}.`)
    }

    return { empleado: data, action: 'updated' }
  }

  const { data, error } = await supabase
    .from('empleado')
    .insert({
      id_nomina: spec.idNomina,
      nombre_completo: spec.nombreCompleto,
      curp: spec.curp,
      nss: spec.nss,
      rfc: spec.rfc,
      puesto: spec.puesto,
      zona: spec.zona,
      correo_electronico: spec.email,
      telefono: spec.telefono,
      estatus_laboral: 'ACTIVO',
      fecha_alta: spec.fechaAlta,
      fecha_baja: null,
      supervisor_empleado_id: spec.supervisorEmpleadoId,
      expediente_estado: 'PENDIENTE_DOCUMENTOS',
      imss_estado: 'NO_INICIADO',
      metadata: {
        source: 'test_users_by_role_script',
        test_user: true,
        role: spec.puesto,
        sequence: spec.sequence,
      },
    })
    .select('id, id_nomina, nombre_completo, puesto')
    .maybeSingle()

  if (error || !data) {
    throw error ?? new Error(`No fue posible crear el empleado ${spec.idNomina}.`)
  }

  return { empleado: data, action: 'created' }
}

async function upsertAuthUser(supabase, authUsersByEmail, spec) {
  const existing = authUsersByEmail.get(spec.email.toLowerCase()) ?? null

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      user_metadata: {
        username: spec.username,
        source: 'test_users_by_role_script',
        test_user: true,
      },
    })

    if (error || !data.user) {
      throw error ?? new Error(`No fue posible actualizar auth user ${spec.email}.`)
    }

    authUsersByEmail.set(spec.email.toLowerCase(), data.user)
    return { authUser: data.user, action: 'updated' }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
    user_metadata: {
      username: spec.username,
      source: 'test_users_by_role_script',
      test_user: true,
    },
  })

  if (error || !data.user) {
    throw error ?? new Error(`No fue posible crear auth user ${spec.email}.`)
  }

  authUsersByEmail.set(spec.email.toLowerCase(), data.user)
  return { authUser: data.user, action: 'created' }
}

async function upsertUsuario(supabase, spec) {
  const nowIso = toIso(new Date())
  const { data: existing, error: existingError } = await supabase
    .from('usuario')
    .select('id')
    .eq('empleado_id', spec.empleadoId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  const payload = {
    auth_user_id: spec.authUserId,
    empleado_id: spec.empleadoId,
    cuenta_cliente_id: spec.cuentaClienteId,
    username: spec.username,
    estado_cuenta: 'ACTIVA',
    correo_electronico: spec.email,
    correo_verificado: true,
    password_temporal_generada_en: null,
    password_temporal_expira_en: null,
    ultimo_acceso_en: null,
    updated_at: nowIso,
  }

  if (existing) {
    const { data, error } = await supabase
      .from('usuario')
      .update(payload)
      .eq('id', existing.id)
      .select('id, username, cuenta_cliente_id, estado_cuenta')
      .maybeSingle()

    if (error || !data) {
      throw error ?? new Error(`No fue posible actualizar el usuario ${spec.username}.`)
    }

    return { usuario: data, action: 'updated' }
  }

  const { data, error } = await supabase
    .from('usuario')
    .insert({
      ...payload,
      created_at: nowIso,
    })
    .select('id, username, cuenta_cliente_id, estado_cuenta')
    .maybeSingle()

  if (error || !data) {
    throw error ?? new Error(`No fue posible crear el usuario ${spec.username}.`)
  }

  return { usuario: data, action: 'created' }
}

async function verifyLogin(supabaseUrl, anonKey, credentials) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  })

  if (error || !data.user || !data.session) {
    throw error ?? new Error(`No fue posible validar login para ${credentials.email}.`)
  }

  await client.auth.signOut()
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const generatedAt = new Date()

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const demoAccountId = await ensureDemoAccountId(service)
  const authUsers = await listAllAuthUsers(service)
  const authUsersByEmail = new Map(
    authUsers
      .filter((user) => user.email)
      .map((user) => [String(user.email).toLowerCase(), user])
  )

  const roles = [
    { puesto: 'ADMINISTRADOR', token: 'ADM', passwordToken: 'Adm', accountMode: 'global' },
    { puesto: 'SUPERVISOR', token: 'SUP', passwordToken: 'Sup', accountMode: 'scoped' },
    { puesto: 'COORDINADOR', token: 'COO', passwordToken: 'Coo', accountMode: 'scoped' },
    { puesto: 'RECLUTAMIENTO', token: 'REC', passwordToken: 'Rec', accountMode: 'scoped' },
    { puesto: 'NOMINA', token: 'NOM', passwordToken: 'Nom', accountMode: 'scoped' },
    { puesto: 'LOGISTICA', token: 'LOG', passwordToken: 'Log', accountMode: 'scoped' },
    { puesto: 'LOVE_IS', token: 'LOV', passwordToken: 'Lov', accountMode: 'scoped' },
    { puesto: 'VENTAS', token: 'VTA', passwordToken: 'Vta', accountMode: 'scoped' },
    { puesto: 'DERMOCONSEJERO', token: 'DER', passwordToken: 'Der', accountMode: 'scoped' },
    { puesto: 'CLIENTE', token: 'CLI', passwordToken: 'Cli', accountMode: 'scoped' },
  ]

  const roleCounters = new Map()
  const supervisorIds = []
  const results = []

  for (const role of roles) {
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      const padded = String(sequence).padStart(2, '0')
      const username = `test_${role.puesto.toLowerCase()}_${padded}`.replace(/[^a-z0-9_]/g, '_')
      const email = `${username}@fieldforce.test`
      const password = `RtlTest!${role.passwordToken}${padded}`
      const idNomina = `TST-${role.token}-${padded}`
      const roleIndex = (roleCounters.get(role.puesto) ?? 0) + 1
      roleCounters.set(role.puesto, roleIndex)

      const supervisorEmpleadoId =
        role.puesto === 'DERMOCONSEJERO' && supervisorIds.length > 0
          ? supervisorIds[(sequence - 1) % supervisorIds.length]
          : null

      const empleadoSpec = {
        idNomina,
        nombreCompleto: `Test ${role.puesto} ${padded}`,
        puesto: role.puesto,
        email,
        telefono: buildPhone(roleIndex + roles.indexOf(role) * 10),
        zona: 'TEST',
        fechaAlta: '2026-03-20',
        supervisorEmpleadoId,
        curp: buildCurp(role.token, sequence),
        rfc: buildRfc(role.token, sequence),
        nss: buildNss(sequence + roles.indexOf(role) * 10),
        sequence,
      }

      const { empleado, action: empleadoAction } = await upsertEmpleado(service, empleadoSpec)

      if (role.puesto === 'SUPERVISOR') {
        supervisorIds.push(empleado.id)
      }

      const { authUser, action: authAction } = await upsertAuthUser(service, authUsersByEmail, {
        email,
        password,
        username,
      })

      const cuentaClienteId = role.accountMode === 'global' ? null : demoAccountId
      const { usuario, action: usuarioAction } = await upsertUsuario(service, {
        authUserId: authUser.id,
        empleadoId: empleado.id,
        cuentaClienteId,
        username,
        email,
      })

      results.push({
        puesto: role.puesto,
        sequence,
        username,
        email,
        password,
        account_scope: cuentaClienteId ? 'be_te_ele_demo' : 'global',
        empleado_id: empleado.id,
        usuario_id: usuario.id,
        auth_user_id: authUser.id,
        actions: {
          empleado: empleadoAction,
          auth: authAction,
          usuario: usuarioAction,
        },
      })
    }
  }

  for (const credential of results) {
    await verifyLogin(supabaseUrl, anonKey, credential)
  }

  const reportPath = path.resolve('tmp', `test-users-by-role-${timestampFileSafe(generatedAt)}.json`)
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generated_at: toIso(generatedAt),
        totals: {
          roles: roles.length,
          users: results.length,
        },
        credentials: results,
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(
    JSON.stringify(
      {
        generated_at: toIso(generatedAt),
        report_file: reportPath,
        totals: {
          roles: roles.length,
          users: results.length,
        },
        summary: results.map((item) => ({
          puesto: item.puesto,
          sequence: item.sequence,
          email: item.email,
          password: item.password,
          account_scope: item.account_scope,
        })),
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
