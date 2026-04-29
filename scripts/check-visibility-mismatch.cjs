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

  console.log('--- Buscando Rutas y sus Cuentas para la semana del 20 de Abril ---')
  const { data: rutas, error } = await supabase
    .from('ruta_semanal')
    .select('id, supervisor_empleado_id, cuenta_cliente_id, semana_inicio, estatus, metadata')
    .eq('semana_inicio', '2026-04-20')
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Rutas encontradas:', rutas.length)
    rutas.forEach(r => {
      console.log(`Ruta ID: ${r.id}`)
      console.log(`Supervisor ID: ${r.supervisor_empleado_id}`)
      console.log(`Cuenta ID: ${r.cuenta_cliente_id}`)
      console.log(`Estatus: ${r.estatus}`)
      console.log(`Approval State: ${r.metadata?.approval?.state}`)
      console.log('---')
    })
  }

  console.log('\n--- Buscando al Coordinador actual (hector@artolagroup.com) ---')
  const { data: coordinator, error: coordError } = await supabase
    .from('usuario')
    .select('id, empleado_id, cuenta_cliente_id, username')
    .eq('correo_electronico', 'hector@artolagroup.com')
    .single()

  if (coordError) {
    console.error('Error buscando coordinador:', coordError)
  } else {
    console.log('Coordinador encontrado:', coordinator)
  }
}

main().catch(console.error)
