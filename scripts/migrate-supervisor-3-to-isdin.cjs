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
  const targetAccountId = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'; // ISDIN Mexico

  console.log(`--- Migrando Supervisor 3 a ISDIN Mexico (${targetAccountId}) ---`);

  // 1. Encontrar usuario y empleado
  const { data: usuario } = await supabase
    .from('usuario')
    .select('id, empleado_id, cuenta_cliente_id')
    .or(`username.eq.${email},correo_electronico.eq.${email}`)
    .maybeSingle();

  if (!usuario) {
    console.log('Error: Supervisor no encontrado');
    return;
  }

  const empleadoId = usuario.empleado_id;

  // 2. Actualizar Usuario
  await supabase.from('usuario').update({ cuenta_cliente_id: targetAccountId }).eq('id', usuario.id);
  console.log('Usuario actualizado.');

  // 3. Actualizar Empleado (si tiene columna)
  // await supabase.from('empleado').update({ cuenta_cliente_id: targetAccountId }).eq('id', empleadoId);

  // 4. Actualizar Todas sus Rutas
  const { dataCount: rutasCount } = await supabase
    .from('ruta_semanal')
    .update({ cuenta_cliente_id: targetAccountId })
    .eq('supervisor_empleado_id', empleadoId);
  console.log('Rutas actualizadas.');

  // 5. Actualizar Todas sus Visitas
  await supabase
    .from('ruta_semanal_visita')
    .update({ cuenta_cliente_id: targetAccountId })
    .eq('supervisor_empleado_id', empleadoId);
  console.log('Visitas actualizadas.');

  // 6. Actualizar Relaciones PDV
  await supabase
    .from('supervisor_pdv')
    .update({ 
       // cuenta_cliente_id: targetAccountId // Check if this column exists
    })
    .eq('empleado_id', empleadoId);

  // 7. Actualizar Asignaciones
  await supabase
    .from('asignacion')
    .update({ cuenta_cliente_id: targetAccountId })
    .eq('supervisor_empleado_id', empleadoId);
  console.log('Asignaciones actualizadas.');

  console.log('--- Migración completada ---');
}

run();
