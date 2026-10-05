-- ============================================================================
-- Migración: Normalización de Canjes Con Ticket sin Evidencia Fotográfica
-- Fecha: 2026-08-13
-- Descripción:
-- Reclasifica a CANJE_SIN_TICKET todos los registros de canje a partir del 
-- 1 de agosto de 2026 que fueron registrados como CANJE_CON_TICKET pero no 
-- cuentan con evidencia fotográfica adjunta en foto_evidencia_url.
-- ============================================================================

-- 1. Actualización masiva de registros históricos desde el 1 de agosto de 2026
UPDATE public.captura_publica_registro
SET subtipo_registro = 'CANJE_SIN_TICKET',
    updated_at = timezone('utc'::text, now())
WHERE tipo_registro = 'CANJE'
  AND subtipo_registro = 'CANJE_CON_TICKET'
  AND fecha_operativa >= '2026-08-01'
  AND (
    foto_evidencia_url IS NULL 
    OR trim(foto_evidencia_url) = '' 
    OR foto_evidencia_url = 'null'
  );
