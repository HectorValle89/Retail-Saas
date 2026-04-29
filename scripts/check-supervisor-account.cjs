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

  const supervisorId = '23e6f53f-7fed-40be-8a75-db89d99158f1'
  
  console.log('--- Buscando usuario del supervisor ---')
  const { data: user, error } = await supabase
    .from('usuario')
    .select('id, cuenta_cliente_id, username')
    .eq('empleado_id', supervisorId)
    .single()
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Usuario supervisor:', user)
  }

  console.log('\n--- Buscando empleado supervisor ---')
  const { data: emp } = await supabase
    .from('empleado')
    .select('id, nombre_completo, cuenta_cliente_id')
    .eq('id', supervisorId)
    .single()
  
  console.log('Empleado supervisor (directo):', emp)
}

main().catch(console.error)
