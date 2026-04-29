const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvFile(filePath, { override = false } = {}) {
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
    if (override || !process.env[key]) {
      process.env[key] = value
    }
  }
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))
  loadEnvFile(path.resolve('.dev.vars'), { override: true })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Faltan variables de entorno.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log('--- Buscando usuario en la base de datos ---')
  const { data: usuario, error: dbError } = await supabase
    .from('usuario')
    .select('*')
    .eq('correo_electronico', 'hector@artolagroup.com')
    .maybeSingle()

  if (dbError) {
    console.error('Error DB:', dbError)
    process.exit(1)
  }

  if (!usuario) {
    console.log('Usuario no encontrado en la tabla public.usuario')
    process.exit(0)
  }

  console.log('Status en DB:', {
    id: usuario.id,
    auth_user_id: usuario.auth_user_id,
    estado_cuenta: usuario.estado_cuenta,
    username: usuario.username
  })

  if (usuario.auth_user_id) {
    console.log('--- Buscando usuario en Auth ---')
    const { data: authResult, error: authError } = await supabase.auth.admin.getUserById(usuario.auth_user_id)
    
    if (authError) {
      console.error('Error Auth:', authError)
    } else {
      const user = authResult.user
      console.log('Status en Auth:', {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        last_sign_in_at: user.last_sign_in_at,
        metadata: user.user_metadata
      })
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
