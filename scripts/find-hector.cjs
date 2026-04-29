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

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log('--- Buscando empleados por email ---')
  const { data: usuarios } = await supabase
    .from('usuario')
    .select('id, correo_electronico, username')
    .or('correo_electronico.ilike.%hector%,username.ilike.%hector%')

  console.log('Usuarios:', usuarios)

  if (usuarios) {
    for (const u of usuarios) {
      const { data: emp } = await supabase
        .from('empleado')
        .select('id, nombre_completo, puesto')
        .eq('usuario_id', u.id)
      
      console.log(`Empleado para ${u.correo_electronico}:`, emp)
    }
  }
}

main().catch(console.error)
