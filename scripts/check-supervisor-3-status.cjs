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
  const email = 'test_supervisor_03@fieldforce.test';
  
  const { data: usuario } = await supabase
    .from('usuario')
    .select('id, empleado_id, username')
    .or(`username.eq.${email},correo_electronico.eq.${email}`)
    .maybeSingle();

  if (!usuario) {
    console.log('Usuario no encontrado');
    return;
  }

  const { data: empleado } = await supabase
    .from('empleado')
    .select('id, nombre_completo, estatus_laboral, puesto')
    .eq('id', usuario.empleado_id)
    .single();

  console.log('Empleado:', empleado);
}

run();
