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
  const RUTA_ID = '5273d02f-0174-45e2-979e-0923425f56cb'
  const SUPERVISOR_USER_ID = '9356fc95-0dab-4a64-ad0e-2689eb1c56a0'
  const COORDINATOR_USER_ID = '182e6ffe-b13a-4d09-a309-54b71efd13b3' // "Test COORDINADOR 01"

  console.log('--- Iniciando correccion de cuenta para visibilidad ---')

  // 1. Actualizar Usuario Supervisor
  const { error: err1 } = await supabase
    .from('usuario')
    .update({ cuenta_cliente_id: ISDIN_ACCOUNT_ID })
    .eq('id', SUPERVISOR_USER_ID)
  
  if (err1) console.error('Error actualizando usuario supervisor:', err1)
  else console.log('Usuario supervisor actualizado a ISDIN.')

  // 2. Actualizar Usuario Coordinador (por si acaso no es el que usa Hector)
  const { error: err2 } = await supabase
    .from('usuario')
    .update({ cuenta_cliente_id: ISDIN_ACCOUNT_ID })
    .eq('id', COORDINATOR_USER_ID)
  
  if (err2) console.error('Error actualizando usuario coordinador opcional:', err2)
  else console.log('Usuario coordinador actualizado a ISDIN.')

  // 3. Actualizar Ruta Semanal
  const { error: err3 } = await supabase
    .from('ruta_semanal')
    .update({ cuenta_cliente_id: ISDIN_ACCOUNT_ID })
    .eq('id', RUTA_ID)
  
  if (err3) console.error('Error actualizando ruta semanal:', err3)
  else console.log('Ruta semanal actualizada a ISDIN.')

  // 4. Actualizar Visitas de la Ruta
  const { error: err4 } = await supabase
    .from('ruta_semanal_visita')
    .update({ cuenta_cliente_id: ISDIN_ACCOUNT_ID })
    .eq('ruta_semanal_id', RUTA_ID)
  
  if (err4) console.error('Error actualizando visitas:', err4)
  else console.log('Visitas de la ruta actualizadas a ISDIN.')

  console.log('--- Correccion completada ---')
}

main().catch(console.error)
