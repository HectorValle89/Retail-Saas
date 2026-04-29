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

  const ISDIN_ACCOUNT_ID = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'
  
  const subjects = [
    'test_administrador', 'test_supervisor', 'test_coordinador',
    'test_reclutamiento', 'test_nomina', 'test_logistica',
    'test_love_is', 'test_ventas', 'test_dermoconsejero', 'test_cliente'
  ]

  const usernames = []
  for (const sub of subjects) {
    for (let i = 1; i <= 3; i++) {
      usernames.push(`${sub}_0${i}`)
    }
  }

  console.log(`--- Iniciando actualizacion masiva para ${usernames.length} usuarios ---`)

  const { data: users, error: fetchError } = await supabase
    .from('usuario')
    .select('id, username, cuenta_cliente_id')
    .in('username', usernames)
  
  if (fetchError) {
    console.error('Error buscando usuarios:', fetchError)
    return
  }

  console.log(`Encontrados ${users.length} usuarios de los ${usernames.length} solicitados.`)

  const idsToUpdate = users.map(u => u.id)

  if (idsToUpdate.length > 0) {
    const { error: updateError } = await supabase
      .from('usuario')
      .update({ cuenta_cliente_id: ISDIN_ACCOUNT_ID })
      .in('id', idsToUpdate)
    
    if (updateError) {
      console.error('Error en la actualizacion masiva:', updateError)
    } else {
      console.log('¡Actualización completada con éxito!')
      console.log('Usernames actualizados:', users.map(u => u.username).join(', '))
    }
  } else {
    console.warn('No se encontró ningún usuario para actualizar.')
  }
}

main().catch(console.error)
