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
  const weekStart = '2026-04-13';

  console.log(`--- Aprobando visitas de Supervisor 3 ---`);

  // 1. Encontrar empleado
  const { data: usuario } = await supabase
    .from('usuario')
    .select('empleado_id')
    .or(`username.eq.${email},correo_electronico.eq.${email}`)
    .maybeSingle();

  if (!usuario) {
    console.log('Error: Supervisor no encontrado');
    return;
  }

  const empleadoId = usuario.empleado_id;

  // 2. Encontrar ruta
  const { data: ruta } = await supabase
    .from('ruta_semanal')
    .select('id')
    .eq('supervisor_empleado_id', empleadoId)
    .eq('semana_inicio', weekStart)
    .single();

  if (!ruta) {
    console.log('Error: No se encontró ruta para esta semana.');
    return;
  }

  // Marcar ruta como PUBLICADA
  await supabase.from('ruta_semanal').update({ estatus: 'PUBLICADA' }).eq('id', ruta.id);

  // 3. Marcar TODAS sus visitas como COMPLETADA
  const { data: updated, error: updateError } = await supabase
    .from('ruta_semanal_visita')
    .update({ 
      estatus: 'COMPLETADA',
      completada_en: new Date().toISOString()
    })
    .eq('ruta_semanal_id', ruta.id);

  if (updateError) {
    console.error('Error al actualizar visitas:', updateError);
  } else {
    console.log('Visitas actualizadas a COMPLETADA con éxito.');
  }

  console.log('--- Fin ---');
}

run();
