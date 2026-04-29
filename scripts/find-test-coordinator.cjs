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

  console.log('--- Buscando al empleado "Test COORDINADOR 01" ---')
  const { data: emps, error } = await supabase
    .from('empleado')
    .select('id, nombre_completo, puesto, usuario_id')
    .ilike('nombre_completo', '%Test COORDINADOR 01%')
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Empleados encontrados:', emps)
    for (const emp of emps) {
      if (emp.usuario_id) {
        const { data: user } = await supabase
          .from('usuario')
          .select('id, cuenta_cliente_id, username, correo_electronico')
          .eq('id', emp.usuario_id)
          .single()
        console.log(`Usuario asociado (${emp.nombre_completo}):`, user)
      }
    }
  }
}

main().catch(console.error)
