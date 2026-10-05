-- Agrega al catálogo de canjes de ISDIN el material solicitado.
-- La llave única (cuenta_cliente_id, nombre) evita duplicados exactos.
insert into public.material_catalogo (
  cuenta_cliente_id,
  nombre,
  tipo,
  activo,
  metadata
)
select
  cuenta.id,
  'FP TRANSPARENT SPRAY WS SPF50 250ML',
  'PROMOCIONAL',
  true,
  jsonb_build_object(
    'origen', 'solicitud_catalogo_canjes',
    'fecha_alta', '2026-09-11'
  )
from public.cuenta_cliente as cuenta
where cuenta.identificador = 'isdin_mexico'
on conflict (cuenta_cliente_id, nombre) do update
set
  activo = true,
  updated_at = now();
