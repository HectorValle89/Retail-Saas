-- =====================================================
-- Agregar columna tipo_dispersion a lotes y dispersiones
-- Objetivo:
--   Permitir la clasificación de las dispersiones de última milla
--   para tener múltiples dispersiones al mismo PDV y mes.
-- =====================================================

alter table public.material_distribucion_lote
  add column if not exists tipo_dispersion text not null default 'MENSUAL'
  check (tipo_dispersion in ('MENSUAL', 'ADICIONAL', 'EXCLUSIVA_CANJES', 'EXCLUSIVA_TESTERS', 'EXCLUSIVA_REGALOS', 'OTRA'));

alter table public.material_distribucion_mensual
  add column if not exists tipo_dispersion text not null default 'MENSUAL'
  check (tipo_dispersion in ('MENSUAL', 'ADICIONAL', 'EXCLUSIVA_CANJES', 'EXCLUSIVA_TESTERS', 'EXCLUSIVA_REGALOS', 'OTRA'));

comment on column public.material_distribucion_lote.tipo_dispersion is 'Clasificación de la dispersión de este lote (MENSUAL, ADICIONAL, etc.)';
comment on column public.material_distribucion_mensual.tipo_dispersion is 'Clasificación de la dispersión mensual heredada del lote (MENSUAL, ADICIONAL, etc.)';
