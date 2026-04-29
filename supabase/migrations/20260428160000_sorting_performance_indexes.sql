-- Migración: Índices de Performance para Ordenamiento y Reportes
-- Objetivo: Acelerar consultas del dashboard que usan ORDER BY created_at o fechas específicas.

-- 1. Índice para reportes de asistencia (orden por creación)
CREATE INDEX IF NOT EXISTS idx_asistencia_created_at 
ON public.asistencia(created_at DESC);

-- 2. Índice para reportes de venta (orden por creación)
CREATE INDEX IF NOT EXISTS idx_venta_created_at 
ON public.venta(created_at DESC);

-- 3. Índice para el feed de auditoría (muy consultado en el dashboard)
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at 
ON public.audit_log(created_at DESC);

-- 4. Índice para reportes de gastos por fecha
CREATE INDEX IF NOT EXISTS idx_gasto_fecha_gasto 
ON public.gasto(fecha_gasto DESC);

-- 5. Índice compuesto para cuotas (empleado + periodo) si no existe
CREATE INDEX IF NOT EXISTS idx_cuota_empleado_periodo_search
ON public.cuota_empleado_periodo(empleado_id, periodo_id);

COMMENT ON INDEX idx_asistencia_created_at IS 'Optimiza el ordenamiento por fecha de creación en el dashboard de supervisores.';
COMMENT ON INDEX idx_venta_created_at IS 'Optimiza el ordenamiento por fecha de creación en el dashboard de supervisores.';
COMMENT ON INDEX idx_audit_log_created_at IS 'Acelera el feed de actividad reciente en el resumen operativo.';
COMMENT ON INDEX idx_gasto_fecha_gasto IS 'Mejora el performance de reportes de gastos filtrados por fecha.';
