const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name] ?? null;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  loadEnvFile(path.resolve('.env.local'));

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: usuarios, error: usuariosError } = await supabase
    .from('usuario')
    .select('auth_user_id, cuenta_cliente_id, empleado:empleado_id(puesto)')
    .not('auth_user_id', 'is', null)
    .not('cuenta_cliente_id', 'is', null)
    .limit(5);

  if (usuariosError) {
    throw usuariosError;
  }

  if (!usuarios?.length) {
    throw new Error('No scoped auth users were found to verify custom claims.');
  }

  const report = [];

  for (const usuario of usuarios) {
    const authUserId = usuario.auth_user_id;
    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(authUserId);

    if (authUserError || !authUser?.user) {
      throw authUserError ?? new Error(`Unable to load auth user ${authUserId}`);
    }

    const appMetadata = authUser.user.app_metadata ?? {};
    const claims = appMetadata.claims ?? {};
    const puesto = Array.isArray(usuario.empleado) ? usuario.empleado[0]?.puesto ?? null : usuario.empleado?.puesto ?? null;

    const item = {
      authUserId,
      puesto,
      expectedCuentaClienteId: usuario.cuenta_cliente_id,
      topLevelRol: appMetadata.rol ?? null,
      topLevelEmpleadoId: appMetadata.empleado_id ?? null,
      topLevelCuentaClienteId: appMetadata.cuenta_cliente_id ?? null,
      claimsRol: claims.rol ?? null,
      claimsEmpleadoId: claims.empleado_id ?? null,
      claimsCuentaClienteId: claims.cuenta_cliente_id ?? null,
      claimsEstadoCuenta: claims.estado_cuenta ?? null,
      hasClaimsContextTimestamp: typeof claims.auth_context_updated_at === 'string',
    };

    const ok =
      item.topLevelRol === puesto &&
      typeof item.topLevelEmpleadoId === 'string' &&
      item.topLevelCuentaClienteId === item.expectedCuentaClienteId &&
      item.claimsRol === puesto &&
      typeof item.claimsEmpleadoId === 'string' &&
      item.claimsCuentaClienteId === item.expectedCuentaClienteId &&
      typeof item.claimsEstadoCuenta === 'string' &&
      item.hasClaimsContextTimestamp;

    report.push({ ok, ...item });
  }

  const failing = report.filter((item) => !item.ok);
  console.log(
    JSON.stringify(
      {
        verifiedUsers: report.length,
        failingUsers: failing.length,
        report,
      },
      null,
      2
    )
  );

  if (failing.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
