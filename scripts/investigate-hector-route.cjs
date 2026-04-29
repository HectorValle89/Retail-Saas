const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://btlee-one.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const accountId = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'; // ISDIN Mexico
  const weekStart = '2026-04-20';

  console.log(`--- Buscando rutas en la cuenta ISDIN para la semana ${weekStart} ---`);

  const { data: rutas, error } = await supabase
    .from('ruta_semanal')
    .select('*, supervisor:supervisor_empleado_id(id, nombre_completo)')
    .eq('cuenta_cliente_id', accountId)
    .eq('semana_inicio', weekStart);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!rutas || rutas.length === 0) {
    console.log('No se encontraron rutas.');
    return;
  }

  for (const ruta of rutas) {
    console.log(`\nRuta ID: ${ruta.id}`);
    console.log(`Supervisor: ${ruta.supervisor?.nombre_completo}`);
    console.log(`Estatus: ${ruta.estatus}`);
    console.log(`Metadata:`, JSON.stringify(ruta.metadata, null, 2));

    const { data: visitas } = await supabase
      .from('ruta_semanal_visita')
      .select('*, pdv:pdv_id(*)')
      .eq('ruta_semanal_id', ruta.id)
      .order('dia_semana', { ascending: true })
      .order('orden', { ascending: true });

    console.log(`Visitas encontradas: ${visitas?.length || 0}`);
    visitas?.forEach(v => {
      console.log(`  [Día ${v.dia_semana}] PDV: ${v.pdv?.nombre} | Lat: ${v.latitud} | Lng: ${v.longitud}`);
    });
  }
}

run();
