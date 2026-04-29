const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

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

loadEnvFile('.env.local');
loadEnvFile('.dev.vars', { override: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const supervisorId = '23e6f53f-7fed-40be-8a75-db89d99158f1'; // Supervisor 3
  
  console.log('Actualizando timestamp de las rutas para forzar refresco...');
  
  const { data, error } = await supabase
    .from('ruta_semanal')
    .update({ updated_at: new Date().toISOString() })
    .eq('supervisor_empleado_id', supervisorId);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Rutas actualizadas.');
  }
}

run();
