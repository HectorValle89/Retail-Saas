-- =====================================================
-- Migración: Alta de nuevos productos ISDIN (Octubre 2026)
-- Objetivo:
--   Incorporar 5 nuevos productos al catálogo maestro (public.producto)
--   para que estén disponibles en el formulario público de dermoconsejo
--   y en los reportes operativos de campo.
-- =====================================================

insert into public.producto (
  sku,
  nombre,
  nombre_corto,
  categoria,
  top_30,
  activo,
  metadata
) values
  (
    '8429420303546',
    'ACNIBEN CC CREAM LIGHT 40ML',
    'ACNI CC CRM LIGHT 40ML',
    'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
    false,
    true,
    '{"fuente": "solicitud_operativa_isdin", "subcategoria": "Control de Acné y Seborrea (Gama Acniben)", "stock_inicial": 100, "precio_sugerido": 599}'::jsonb
  ),
  (
    '8429420303553',
    'ACNIBEN CC CREAM MEDIUM 40ML',
    'ACNI CC CRM MEDIUM 40ML',
    'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
    false,
    true,
    '{"fuente": "solicitud_operativa_isdin", "subcategoria": "Control de Acné y Seborrea (Gama Acniben)", "stock_inicial": 100, "precio_sugerido": 599}'::jsonb
  ),
  (
    '8429420303935',
    'ACNIBEN CC CREAM BRONZE 40ML',
    'ACNI CC CRM BRONZE 40ML',
    'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
    false,
    true,
    '{"fuente": "solicitud_operativa_isdin", "subcategoria": "Control de Acné y Seborrea (Gama Acniben)", "stock_inicial": 100, "precio_sugerido": 599}'::jsonb
  ),
  (
    '8470001527974',
    'WOMAN ISDIN CREMA ANTIESTRÍAS 250ML',
    'WOMAN CRM ANTIESTRIAS 250ML',
    'SALUD Y BIENESTAR DE LA MUJER (WOMAN ISDIN)',
    false,
    true,
    '{"fuente": "solicitud_operativa_isdin", "subcategoria": "General", "stock_inicial": 100, "precio_sugerido": 599}'::jsonb
  ),
  (
    '8429420309883',
    'ISDINCEUTICS FLAVO-C INTENSE 50ML',
    'CEUTICS FLAVO-C INTENSE 50ML',
    'COSMECÉUTICA ANTIEDAD Y RENOVACIÓN DÉRMICA',
    false,
    true,
    '{"fuente": "solicitud_operativa_isdin", "subcategoria": "Ampolletas y Sueros Concentrados (Isdinceutics)", "stock_inicial": 100, "precio_sugerido": 599}'::jsonb
  )
on conflict (sku) do update
set
  nombre = excluded.nombre,
  nombre_corto = excluded.nombre_corto,
  categoria = excluded.categoria,
  top_30 = excluded.top_30,
  activo = excluded.activo,
  metadata = public.producto.metadata || excluded.metadata,
  updated_at = now();
