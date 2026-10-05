-- Actualización de restricción CHECK en supervisor_evidencia para soportar ULTIMA_MILLA y UNIFORMES

ALTER TABLE public.supervisor_evidencia 
DROP CONSTRAINT IF EXISTS supervisor_evidencia_tipo_evidencia_check;

ALTER TABLE public.supervisor_evidencia 
ADD CONSTRAINT supervisor_evidencia_tipo_evidencia_check 
CHECK (
  tipo_evidencia IN (
    'MATERIAL_POP',
    'CAMPANA_ESTACIONAL',
    'MALETA_VANITY',
    'EVENTO_ESPECIAL',
    'ADOPTADO_SAN_PABLO',
    'PRODUCTO_MES_LIVERPOOL',
    'ULTIMA_MILLA',
    'UNIFORMES',
    'ENTREGA_UNIFORMES'
  )
);
