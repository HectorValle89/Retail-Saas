-- ============================================================================
-- Migración: Coordenadas de domicilio de empleados
-- Propósito: Almacenar latitud y longitud del domicilio de los empleados
--            para visualización geográfica y optimización de rutas de supervisores.
-- Regla de oro: Nombres y comentarios estrictamente en español latino.
-- ============================================================================

alter table public.empleado
  add column if not exists latitud_domicilio numeric(10,7),
  add column if not exists longitud_domicilio numeric(10,7);

comment on column public.empleado.latitud_domicilio is 'Latitud decimal del domicilio particular del empleado para cálculo de distancias y visualización en mapas.';
comment on column public.empleado.longitud_domicilio is 'Longitud decimal del domicilio particular del empleado para cálculo de distancias y visualización en mapas.';

-- Índice para acelerar búsquedas de empleados con coordenadas registradas (por ejemplo, supervisores para mapas)
create index if not exists idx_empleado_coordenadas_puesto
  on public.empleado (puesto, estatus_laboral)
  where latitud_domicilio is not null and longitud_domicilio is not null;
