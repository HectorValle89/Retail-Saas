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
  
  // 1. Encontrar empleado
  const { data: usuario } = await supabase
    .from('usuario')
    .select('empleado_id, cuenta_cliente_id')
    .or(`username.eq.${email},correo_electronico.eq.${email}`)
    .maybeSingle();

  if (!usuario) {
    console.log('Error: Supervisor no encontrado');
    return;
  }

  console.log('Supervisor ID:', usuario.empleado_id);
  console.log('Cuenta Cliente ID:', usuario.cuenta_cliente_id);

  // 2. Listar rutas
  const { data: rutas } = await supabase
    .from('ruta_semanal')
    .select('*')
    .eq('supervisor_empleado_id', usuario.empleado_id)
    .order('semana_inicio', { ascending: false });

  console.log('\nRutas encontradas:', rutas.length);
  rutas.forEach(r => {
    console.log(`- ID: ${r.id} | Semana: ${r.semana_inicio} | Estatus: ${r.estatus} | Cuenta: ${r.cuenta_cliente_id}`);
    console.log(`  Metadata:`, JSON.stringify(r.metadata, null, 2));
  });

  // 3. Verificar si hay rutas para la semana del 13 de abril
  const week13 = rutas.find(r => r.semana_inicio === '2026-04-13');
  if (week13) {
    const { data: visitas } = await supabase
      .from('ruta_semanal_visita')
      .select('id, pdv_id, dia_semana, orden, estatus')
      .eq('ruta_semanal_id', week13.id);
    console.log(`\nVisitas para la semana del 13 de abril (${visitas.length}):`);
    visitas.forEach(v => {
      console.log(`  - Día ${v.dia_semana} | Orden ${v.orden} | Estatus: ${v.estatus}`);
    });
  }
}

run();
