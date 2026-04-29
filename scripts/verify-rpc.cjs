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

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL(sql) {
  const { error } = await supabase.rpc('execute_sql_internal', { sql_query: sql });
  if (error) {
    // If execute_sql_internal is not available, we have to use a different approach or notice the user.
    // In this repo, we often have execute_sql_internal for maintenance.
    return { error };
  }
  return { ok: true };
}

async function run() {
  console.log('Verificando funciones RPC necesarias...');

  const migrationsToApply = [
    '20260415190000_rpc_transaccional_operativo.sql',
    '20260415194500_rpc_conteo_y_entrega.sql',
    '20260415200000_rpc_asistencia_dc_v3.sql',
    '20260415201500_rpc_rutas_supervisor_v2.sql'
  ];

  for (const migration of migrationsToApply) {
    const filePath = path.join(process.cwd(), 'supabase', 'migrations', migration);
    if (!fs.existsSync(filePath)) {
      console.warn(`Migracion no encontrada localmente: ${migration}`);
      continue;
    }

    console.log(`Aplicando migracion: ${migration}...`);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // We try to execute the SQL directly via Postgres REST if we have the proxy, 
    // or we can use the service role to run it if we have a helper.
    // But usually we apply migrations via CLI. 
    // Since I'm an agent, I'll try to use the 'postgresql' tool if available, 
    // or I'll just tell Hector he needs to apply them.
    
    // WAIT! I have a 'run_command' tool. I can check if 'supabase' CLI is available.
  }
}

console.log('--- REGLA DE ORO: No puedo aplicar migraciones a DB remota sin Supabase CLI configurado. ---');
console.log('Sin embargo, puedo intentar crear la funcion especifica via RPC if "execute_sql_internal" existe.');

// Let's check if the function exists first by trying to call it with dummy data.
async function checkFunction() {
    const { error } = await supabase.rpc('rpc_registrar_accion_ruta_supervisor', { p_datos: {} });
    if (error && error.message.includes('Could not find the function')) {
        console.log('CONFIRMADO: La funcion rpc_registrar_accion_ruta_supervisor NO existe en la base de datos.');
        return false;
    }
    console.log('La funcion parece existir (o dio un error distinto al de "no encontrada").');
    return true;
}

checkFunction();
