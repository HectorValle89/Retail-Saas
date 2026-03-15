-- =====================================================
-- RLS SMOKE TEST
-- =====================================================
-- Ejecutar con una conexion Postgres privilegiada.
-- Simula claims JWT para verificar aislamiento multi-tenant sin depender
-- de usuarios reales en auth.users.
-- =====================================================

begin;

select set_config(
  'app.demo_cuenta_cliente_id',
  (select id::text from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
  true
);

select set_config(
  'app.isdin_cuenta_cliente_id',
  (select id::text from public.cuenta_cliente where identificador = 'isdin_mexico'),
  true
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'rol', 'CLIENTE',
    'cuenta_cliente_id', current_setting('app.demo_cuenta_cliente_id', true)
  )::text,
  true
);

do $$
declare
  pdvs_visibles text[];
  asignaciones_visibles integer;
  configuraciones_visibles integer;
begin
  select array_agg(clave_btl order by clave_btl)
  into pdvs_visibles
  from public.pdv;

  if pdvs_visibles is distinct from array['BTL-BEN-2001', 'BTL-SAN-1001']::text[] then
    raise exception 'RLS demo client failed, PDVs visibles: %', pdvs_visibles;
  end if;

  select count(*) into asignaciones_visibles from public.asignacion;
  if asignaciones_visibles <> 2 then
    raise exception 'RLS demo client failed, asignaciones visibles: %', asignaciones_visibles;
  end if;

  select count(*) into configuraciones_visibles from public.configuracion;
  if configuraciones_visibles <> 0 then
    raise exception 'RLS demo client should not read configuracion, got: %', configuraciones_visibles;
  end if;
end
$$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'rol', 'CLIENTE',
    'cuenta_cliente_id', current_setting('app.isdin_cuenta_cliente_id', true)
  )::text,
  true
);

do $$
declare
  pdvs_visibles text[];
  asignaciones_visibles integer;
begin
  select array_agg(clave_btl order by clave_btl)
  into pdvs_visibles
  from public.pdv;

  if pdvs_visibles is distinct from array['BTL-LIV-3001', 'BTL-SEP-4001']::text[] then
    raise exception 'RLS isdin client failed, PDVs visibles: %', pdvs_visibles;
  end if;

  select count(*) into asignaciones_visibles from public.asignacion;
  if asignaciones_visibles <> 1 then
    raise exception 'RLS isdin client failed, asignaciones visibles: %', asignaciones_visibles;
  end if;
end
$$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'rol', 'ADMINISTRADOR'
  )::text,
  true
);

do $$
declare
  total_pdvs integer;
  total_configuracion integer;
  total_misiones integer;
begin
  select count(*) into total_pdvs from public.pdv;
  if total_pdvs < 4 then
    raise exception 'Admin should see all PDVs, got: %', total_pdvs;
  end if;

  select count(*) into total_configuracion from public.configuracion;
  if total_configuracion < 8 then
    raise exception 'Admin should see configuracion base, got: %', total_configuracion;
  end if;

  select count(*) into total_misiones from public.mision_dia where activa = true;
  if total_misiones < 20 then
    raise exception 'Admin should see at least 20 misiones activas, got: %', total_misiones;
  end if;
end
$$;

rollback;
