-- ==============================================================================
-- Migración: 20260929152000_restaurar_dias_descanso_septiembre_supervisores.sql
-- Propósito: Restaurar el supervisor_empleado_id en asignacion_diaria_resuelta
--            para los días de descanso (SIN_ASIGNACION) de septiembre 2026
--            a Zenaida Monroy y Xóchitl Carrillo en lugar de Jacqueline López,
--            evitando que dermoconsejeras de otras rutas se filtren indebidamente.
-- ==============================================================================

-- 1. Actualizar registros de descanso de septiembre para dermoconsejeras de Zenaida Monroy
update public.asignacion_diaria_resuelta
set supervisor_empleado_id = 'd70024f8-7f51-4085-a3c6-cf2ab77e5b16' -- Maria Zenaida Monroy Gonzalez
where supervisor_empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810' -- Jacqueline Lopez Ruiz
  and fecha >= '2026-09-01' and fecha <= '2026-09-30'
  and empleado_id in (
    select id from public.empleado where nombre_completo in (
      'GEORGINA IBARRA RODRIGUEZ',
      'MARIA GABRIELA MORALES REYES',
      'MARIA DEL CARMEN PIÑA RODRIGUEZ',
      'MARIBEL RAMIREZ CONTRERAS',
      'LAURA VIVIANA LOPEZ CRUZ',
      'SARAHI VERA DORADO',
      'HEIDI FELIX CRUZ',
      'EDITH TERESA CONTRERAS CALDERON',
      'JAQUELIN DE JESUS HERNANDEZ',
      'DEYARIDA FLORES UREÑA'
    )
  );

-- 2. Actualizar registros de descanso de septiembre para dermoconsejeras de Xóchitl Carrillo
update public.asignacion_diaria_resuelta
set supervisor_empleado_id = 'b7af5083-9fa6-4bcd-9344-c557024ad609' -- Xochitl Carrillo Xochihua
where supervisor_empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810'
  and fecha >= '2026-09-01' and fecha <= '2026-09-30'
  and empleado_id in (
    select id from public.empleado where nombre_completo in (
      'MARTHA PATRICIA GONZALEZ MEJIA',
      'CLAUDIA ISELA PEREZ LUGO'
    )
  );
