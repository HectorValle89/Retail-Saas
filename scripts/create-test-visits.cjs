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
  const weekStart = '2026-04-13'; // Current week in Héctor's screenshot
  const accountId = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'; // ISDIN Mexico

  console.log(`--- Creando visitas aprobadas para ${email} en la semana ${weekStart} ---`);

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

  // 2. Encontrar o crear ruta semanal
  let { data: ruta } = await supabase
    .from('ruta_semanal')
    .select('id')
    .eq('supervisor_empleado_id', empleadoId)
    .eq('semana_inicio', weekStart)
    .maybeSingle();

  if (!ruta) {
    console.log('Creando nueva ruta semanal...');
    const { data: newRuta, error: createError } = await supabase
      .from('ruta_semanal')
      .insert({
        supervisor_empleado_id: empleadoId,
        cuenta_cliente_id: accountId,
        semana_inicio: weekStart,
        estatus: 'PUBLICADA',
        metadata: {
          approval: {
            state: 'APROBADA',
            note: 'Creada para pruebas de visitas diarias',
            reviewedAt: new Date().toISOString()
          }
        }
      })
      .select()
      .single();

    if (createError) {
      console.error('Error al crear ruta:', createError);
      return;
    }
    ruta = newRuta;
  } else {
    // Asegurar que esté publicada y aprobada
    await supabase.from('ruta_semanal').update({
       estatus: 'PUBLICADA',
       metadata: {
          approval: {
            state: 'APROBADA',
            note: 'Actualizada para pruebas',
            reviewedAt: new Date().toISOString()
          }
       }
    }).eq('id', ruta.id);
  }

  // 3. Encontrar PDV de prueba (el primero que encuentre)
  const { data: pdvs } = await supabase
    .from('pdv')
    .select('id, nombre')
    .limit(1);

  if (!pdvs || pdvs.length === 0) {
    console.log('Error: No se encontraron PDVs.');
    return;
  }
  const pdvId = pdvs[0].id;

  // 4. Crear 1 visita por día (Lunes a Domingo)
  console.log(`Asignando visitas al PDV: ${pdvs[0].nombre}`);
  const days = [1, 2, 3, 4, 5, 6, 7];
  
  for (const day of days) {
    const { error: visitError } = await supabase
      .from('ruta_semanal_visita')
      .insert({
        ruta_semanal_id: ruta.id,
        pdv_id: pdvId,
        dia_semana: day,
        orden: 1,
        estatus: 'COMPLETADA', // Para que cuente como "hecha"
        cuenta_cliente_id: accountId,
        supervisor_empleado_id: empleadoId,
        completada_en: new Date(new Date(weekStart).getTime() + (day - 1) * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          checkIn: { at: new Date().toISOString() },
          checkOut: { at: new Date().toISOString() }
        }
      });
    
    if (visitError) {
      console.error(`Error en día ${day}:`, visitError);
    } else {
      console.log(`Día ${day} completado.`);
    }
  }

  console.log('--- Proceso terminado con éxito ---');
}

run();
