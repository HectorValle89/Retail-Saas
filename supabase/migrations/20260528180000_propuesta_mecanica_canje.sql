-- Migración: Creación de la tabla de propuestas de mecánicas de canje por Dermoconsejo
-- Ruta: supabase/migrations/20260528180000_propuesta_mecanica_canje.sql

CREATE TABLE IF NOT EXISTS public.propuesta_mecanica_canje (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_cliente_id UUID NOT NULL REFERENCES public.cuenta_cliente(id) ON DELETE CASCADE,
    pdv_id UUID NOT NULL REFERENCES public.pdv(id) ON DELETE CASCADE,
    pdv_nombre_snapshot TEXT NOT NULL,
    material_canje_nombre TEXT NOT NULL,
    condicion_tipo TEXT NOT NULL CHECK (condicion_tipo IN ('MONTO', 'PRODUCTOS')),
    condicion_monto NUMERIC NULL CHECK (condicion_monto >= 0),
    condicion_productos JSONB NULL, -- Array de {producto_id, producto_nombre, cantidad}
    descripcion_mecanica TEXT NOT NULL,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    metadata JSONB NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.propuesta_mecanica_canje ENABLE ROW LEVEL SECURITY;

-- Crear índices de rendimiento optimizados
CREATE INDEX IF NOT EXISTS idx_propuesta_mecanica_cuenta ON public.propuesta_mecanica_canje(cuenta_cliente_id);
CREATE INDEX IF NOT EXISTS idx_propuesta_mecanica_pdv ON public.propuesta_mecanica_canje(pdv_id);
CREATE INDEX IF NOT EXISTS idx_propuesta_mecanica_fecha ON public.propuesta_mecanica_canje(fecha_creacion);

-- Políticas RLS de Seguridad Multi-tenant
DROP POLICY IF EXISTS "Permitir insercion publica anonima de propuestas" ON public.propuesta_mecanica_canje;
CREATE POLICY "Permitir insercion publica anonima de propuestas" 
ON public.propuesta_mecanica_canje
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir select administrativo de propuestas" ON public.propuesta_mecanica_canje;
CREATE POLICY "Permitir select administrativo de propuestas" 
ON public.propuesta_mecanica_canje
FOR SELECT
TO authenticated
USING (
  cuenta_cliente_id = (auth.jwt()->>'cuenta_cliente_id')::uuid OR 
  (auth.jwt()->>'puesto') IN ('ADMINISTRADOR', 'COORDINADOR')
);

-- Comentarios informativos de base de datos
COMMENT ON TABLE public.propuesta_mecanica_canje IS 'Tabla que consolida las propuestas de mecánicas comerciales de canjes redactadas por dermoconsejeras en campo.';
COMMENT ON COLUMN public.propuesta_mecanica_canje.condicion_productos IS 'Array en formato JSON que especifica los productos de catálogo de amarre con su respectivo ID, nombre y cantidad.';
