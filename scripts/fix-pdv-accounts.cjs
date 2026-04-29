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
  const targetAccountId = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'; // ISDIN Mexico

  // 1. Encontrar todos los PDV
  const { data: pdvs, error } = await supabase
    .from('pdv')
    .select('id, nombre, cuenta_cliente_id');

  if (error) {
    console.error('Error al consultar PDVs:', error);
    return;
  }

  console.log(`Total PDVs encontrados: ${pdvs.length}`);
  
  const misaligned = pdvs.filter(p => !p.cuenta_cliente_id || p.cuenta_cliente_id !== targetAccountId);
  console.log(`PDVs fuera de cuenta ISDIN: ${misaligned.length}`);

  if (misaligned.length > 0) {
    console.log('Migrando PDVs a la cuenta ISDIN...');
    for (const p of misaligned) {
       console.log(`- Migrando: ${p.nombre} (${p.id})`);
       await supabase.from('pdv').update({ cuenta_cliente_id: targetAccountId }).eq('id', p.id);
       await supabase.from('geocerca_pdv').update({ cuenta_cliente_id: targetAccountId }).eq('pdv_id', p.id);
    }
    console.log('Completo.');
  }

  console.log('--- Proceso terminado ---');
}

run();
