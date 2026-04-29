const { Client } = require('pg');
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

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL configuration');
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  console.log('--- APLICANDO MIGRACIONES RPC PENDIENTES ---');
  
  const migrationsToApply = [
    '20260415190000_rpc_transaccional_operativo.sql',
    '20260415194500_rpc_conteo_y_entrega.sql',
    '20260415200000_rpc_asistencia_dc_v3.sql',
    '20260415201500_rpc_rutas_supervisor_v2.sql'
  ];

  try {
    await client.connect();
    console.log('Conectado a la base de datos.');

    for (const migration of migrationsToApply) {
      const filePath = path.join(process.cwd(), 'supabase', 'migrations', migration);
      if (!fs.existsSync(filePath)) {
        console.warn(`Migracion no encontrada localmente: ${migration}`);
        continue;
      }

      console.log(`Ejecutando SQL de: ${migration}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      try {
        await client.query(sql);
        console.log(`✅ ${migration} aplicada con éxito.`);
      } catch (err) {
        console.error(`❌ Error aplicando ${migration}:`, err.message);
        // We continue with others if one fails, but usually they depend on each other.
      }
    }
  } catch (err) {
    console.error('Error de conexion:', err.message);
  } finally {
    await client.end();
    console.log('Conexion cerrada.');
  }
}

run();
