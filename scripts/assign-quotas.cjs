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

const SUPERVISORS = [
  'test_supervisor_01@fieldforce.test',
  'test_supervisor_02@fieldforce.test',
  'test_supervisor_03@fieldforce.test',
  'test_supervisor_01', // also support without suffix
  'test_supervisor_02',
  'test_supervisor_03'
];

const WEEKS = ['2026-04-13', '2026-04-20', '2026-04-27'];
const visitsPerStore = 4;

async function run() {
  console.log(`--- Asignando metas de ${visitsPerStore} visitas por tienda ---`);

  for (const weekStart of WEEKS) {
    console.log(`\n=== SEMANA: ${weekStart} ===`);
    for (const email of SUPERVISORS) {
      console.log(`\nProcesando supervisor: ${email}`);

      // 1. Encontrar empleado
      const { data: usuario } = await supabase
        .from('usuario')
        .select('empleado_id')
        .or(`username.eq.${email},correo_electronico.eq.${email}`)
        .maybeSingle();

      if (!usuario) {
        // console.log(`  AVISO: Usuario ${email} no encontrado.`);
        continue;
      }

      const empleadoId = usuario.empleado_id;

      // 2. Encontrar ruta para la semana
      const { data: ruta } = await supabase
        .from('ruta_semanal')
        .select('id, metadata')
        .eq('supervisor_empleado_id', empleadoId)
        .eq('semana_inicio', weekStart)
        .maybeSingle();

      if (!ruta) {
        console.log(`  AVISO [${email}]: No se encontró ruta para la semana ${weekStart}.`);
        continue;
      }

      // 3. Encontrar tiendas (PDVs) asignadas a este supervisor
      const { data: asignaciones } = await supabase
        .from('supervisor_pdv')
        .select('pdv_id')
        .eq('empleado_id', empleadoId)
        .eq('activo', true);

      if (!asignaciones || asignaciones.length === 0) {
        console.log(`  AVISO [${email}]: No hay PDVs activos asignados.`);
        continue;
      }

      const pdvIds = [...new Set(asignaciones.map(a => a.pdv_id))];
      const quotas = {};
      pdvIds.forEach(id => {
        quotas[id] = visitsPerStore;
      });

      const totalExpected = pdvIds.length * visitsPerStore;

      // 4. Actualizar metadata
      const updatedMetadata = {
        ...(ruta.metadata || {}),
        pdvMonthlyQuotas: quotas,
        expectedMonthlyVisits: totalExpected,
        minimumVisitsPerPdv: visitsPerStore
      };

      const { error: updateError } = await supabase
        .from('ruta_semanal')
        .update({ metadata: updatedMetadata })
        .eq('id', ruta.id);

      if (updateError) {
        console.error(`  ERROR [${email}] al actualizar:`, updateError);
      } else {
        console.log(`  EXITO [${email}]: Meta de ${totalExpected} visitas (${pdvIds.length} tiendas x ${visitsPerStore}) asignada.`);
      }
    }
  }
}

run();
