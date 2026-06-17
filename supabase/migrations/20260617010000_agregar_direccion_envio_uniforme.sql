-- Migración: Agregar columna direccion_envio a la tabla levantamiento_uniforme
-- Ruta: supabase/migrations/20260617010000_agregar_direccion_envio_uniforme.sql

ALTER TABLE public.levantamiento_uniforme ADD COLUMN IF NOT EXISTS direccion_envio TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.levantamiento_uniforme.direccion_envio IS 'Dirección completa del destino de entrega del paquete de uniformes (puede ser vacío o entrega presencial para CDMX).';
