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

  console.log('--- Listando Políticas RLS para ruta_semanal ---')
  const { data: policies, error } = await supabase
    .rpc('get_policies_for_table', { table_name: 'ruta_semanal' })
  
  if (error) {
    // Si el RPC no existe, probamos con una query directa a pg_policies
    console.log('RPC get_policies_for_table no encontrado, usando query SQL...')
    const { data: policies2, error: error2 } = await supabase.rpc('execute_sql', {
      sql: "SELECT * FROM pg_policies WHERE tablename = 'ruta_semanal';"
    })
    
    if (error2) {
      console.error('Error al obtener políticas:', error2)
    } else {
      console.log('Políticas (SQL):', policies2)
    }
  } else {
    console.log('Políticas (RPC):', policies)
  }
}

main().catch(console.error)
