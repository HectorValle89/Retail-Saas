-- Migración: Creación de la tabla de levantamiento de uniformes para supervisores con Ciudad y Destinatario
-- Ruta: supabase/migrations/20260617000000_levantamiento_uniforme.sql

CREATE TABLE IF NOT EXISTS public.levantamiento_uniforme (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_cliente_id UUID NOT NULL REFERENCES public.cuenta_cliente(id) ON DELETE CASCADE,
    supervisor_nombre TEXT NOT NULL,
    ciudad_envio TEXT NOT NULL,
    recibe_nombre TEXT NOT NULL,
    prendas JSONB NOT NULL, -- Array de {prenda: 'Filipina'|'Pantalón', genero: 'Dama'|'Caballero', talla: 'CH'|'M'|'G'|'XL'|'2XL'|'3XL', cantidad: number}
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    metadata JSONB NULL,
    UNIQUE (supervisor_nombre, ciudad_envio) -- Permite registrar pedidos en ciudades distintas pero evita duplicados en la misma ciudad
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.levantamiento_uniforme ENABLE ROW LEVEL SECURITY;

-- Crear índices de rendimiento optimizados
CREATE INDEX IF NOT EXISTS idx_levantamiento_uniforme_cuenta ON public.levantamiento_uniforme(cuenta_cliente_id);
CREATE INDEX IF NOT EXISTS idx_levantamiento_uniforme_supervisor ON public.levantamiento_uniforme(supervisor_nombre);
CREATE INDEX IF NOT EXISTS idx_levantamiento_uniforme_ciudad ON public.levantamiento_uniforme(ciudad_envio);
CREATE INDEX IF NOT EXISTS idx_levantamiento_uniforme_fecha ON public.levantamiento_uniforme(fecha_creacion);

-- Políticas RLS de Seguridad Multi-tenant
DROP POLICY IF EXISTS "Permitir insercion publica anonima de uniformes" ON public.levantamiento_uniforme;
CREATE POLICY "Permitir insercion publica anonima de uniformes" 
ON public.levantamiento_uniforme
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir select administrativo de uniformes" ON public.levantamiento_uniforme;
CREATE POLICY "Permitir select administrativo de uniformes" 
ON public.levantamiento_uniforme
FOR SELECT
TO authenticated
USING (
  cuenta_cliente_id = (auth.jwt()->>'cuenta_cliente_id')::uuid OR 
  (auth.jwt()->>'puesto') IN ('ADMINISTRADOR', 'COORDINADOR')
);

-- Comentarios informativos de base de datos en español latino
COMMENT ON TABLE public.levantamiento_uniforme IS 'Tabla que almacena el levantamiento de tallas de uniformes para el equipo de supervisores.';
COMMENT ON COLUMN public.levantamiento_uniforme.supervisor_nombre IS 'Nombre del supervisor (obligatorio) que realiza el registro.';
COMMENT ON COLUMN public.levantamiento_uniforme.ciudad_envio IS 'Nombre de la ciudad de destino a donde se enviará el paquete de uniformes.';
COMMENT ON COLUMN public.levantamiento_uniforme.recibe_nombre IS 'Nombre de la persona responsable que recibirá el paquete en el destino.';
COMMENT ON COLUMN public.levantamiento_uniforme.prendas IS 'Arreglo JSONB que detalla las prendas (prenda, género, talla, cantidad) seleccionadas por el supervisor.';
