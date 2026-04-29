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
  const actorCuentaId = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'; // ISDIN Mexico
  const weekStart = '2026-04-13';

  console.log('Simulando búsqueda de coordinador para la semana 13-04...');

  const { data: rutas, error } = await supabase
    .from('ruta_semanal')
    .select(`
      id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      semana_inicio,
      estatus,
      metadata
    `)
    .eq('cuenta_cliente_id', actorCuentaId)
    .eq('semana_inicio', weekStart);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Rutas encontradas en ISDIN para la semana ${weekStart}: ${rutas.length}`);
  rutas.forEach(r => {
    console.log(`- ID: ${r.id} | Sup: ${r.supervisor_empleado_id} | Estatus: ${r.estatus}`);
  });
}

run();
