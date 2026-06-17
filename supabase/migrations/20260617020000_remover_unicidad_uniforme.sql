-- Migración: Remover restricción UNIQUE de supervisor y ciudad en la tabla levantamiento_uniforme
-- Ruta: supabase/migrations/20260617020000_remover_unicidad_uniforme.sql

ALTER TABLE public.levantamiento_uniforme 
DROP CONSTRAINT IF EXISTS levantamiento_uniforme_supervisor_nombre_ciudad_envio_key;
