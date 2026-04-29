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

  const cuentaId = '95f8253c-035b-4ef6-af7a-07e9444f6995'
  
  console.log('--- Contando rutas para la cuenta ISDIN ---')
  const { count, error } = await supabase
    .from('ruta_semanal')
    .select('*', { count: 'exact', head: true })
    .eq('cuenta_cliente_id', cuentaId)
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Total rutas en la cuenta:', count)
  }

  console.log('\n--- Buscando rutas de Héctor específicas ---')
  const { data: rutas } = await supabase
    .from('ruta_semanal')
    .select('id, semana_inicio, estatus, updated_at')
    .eq('supervisor_empleado_id', '23e6f53f-7fed-40be-8a75-db89d99158f1')
    .order('semana_inicio', { ascending: false })
  
  console.log('Rutas de Héctor:', rutas)
}

main().catch(console.error)
