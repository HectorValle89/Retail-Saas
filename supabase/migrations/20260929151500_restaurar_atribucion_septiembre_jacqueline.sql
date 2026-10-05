-- ==============================================================================
-- Migración: 20260929151500_restaurar_atribucion_septiembre_jacqueline.sql
-- Propósito: Restaurar las 19 tiendas oficiales de Jacqueline López Ruiz para
--            septiembre de 2026 conforme al ROL SEP 2026.xlsx, reasignando las
--            tiendas de octubre (Interlomas, Bosque Real, Stim, etc.) a sus
--            supervisores correspondientes en septiembre (Zenaida Monroy y
--            Xóchitl Carrillo).
-- ==============================================================================

-- 1. Restaurar supervisor_empleado_id en asignaciones vigentes de septiembre para Zenaida Monroy
update public.asignacion
set supervisor_empleado_id = 'd70024f8-7f51-4085-a3c6-cf2ab77e5b16' -- Maria Zenaida Monroy Gonzalez
where supervisor_empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810' -- Jacqueline Lopez Ruiz
  and fecha_inicio <= '2026-09-30'
  and (fecha_fin is null or fecha_fin >= '2026-09-01')
  and pdv_id in (
    select id from public.pdv where clave_btl in (
      'BTL-SAN-PRAD-Q0', 'BTL-FRE-PABE-BO', 'BTL-LAC-LOMA-AN',
      'BTL-SAN-STIM-27', 'BTL-SAN-INTE-AY', 'BTL-BEN-SUC.-KW',
      'BTL-CIT-INTE-YB', 'BTL-PAL-TDA-INTE', 'BTL-FAH-INTE-K2',
      'BTL-CHE-INTE-DL', 'BTL-LAC-BOSQ-Z5', 'BTL-FRE-LAHE-OY',
      'BTL-CIT-LILA-1U', 'BTL-SAN-CAST-H9', 'BTL-ESP-PRAD-0N'
    )
  );

-- 2. Restaurar supervisor_empleado_id en asignaciones vigentes de septiembre para Xochitl Carrillo
update public.asignacion
set supervisor_empleado_id = 'b7af5083-9fa6-4bcd-9344-c557024ad609' -- Xochitl Carrillo Xochihua
where supervisor_empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810'
  and fecha_inicio <= '2026-09-30'
  and (fecha_fin is null or fecha_fin >= '2026-09-01')
  and pdv_id in (
    select id from public.pdv where clave_btl in (
      'BTL-SAN-JESU-BC', 'BTL-SAN-BOSQ-5X', 'BTL-FAH-JESU-ZA', 'BTL-SAN-TECA-LK'
    )
  );

-- 3. Restaurar supervisor_empleado_id en asignacion_diaria_resuelta para septiembre 2026
update public.asignacion_diaria_resuelta
set supervisor_empleado_id = 'd70024f8-7f51-4085-a3c6-cf2ab77e5b16'
where supervisor_empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810'
  and fecha >= '2026-09-01' and fecha <= '2026-09-30'
  and pdv_id in (
    select id from public.pdv where clave_btl in (
      'BTL-SAN-PRAD-Q0', 'BTL-FRE-PABE-BO', 'BTL-LAC-LOMA-AN',
      'BTL-SAN-STIM-27', 'BTL-SAN-INTE-AY', 'BTL-BEN-SUC.-KW',
      'BTL-CIT-INTE-YB', 'BTL-PAL-TDA-INTE', 'BTL-FAH-INTE-K2',
      'BTL-CHE-INTE-DL', 'BTL-LAC-BOSQ-Z5', 'BTL-FRE-LAHE-OY',
      'BTL-CIT-LILA-1U', 'BTL-SAN-CAST-H9', 'BTL-ESP-PRAD-0N'
    )
  );

update public.asignacion_diaria_resuelta
set supervisor_empleado_id = 'b7af5083-9fa6-4bcd-9344-c557024ad609'
where supervisor_empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810'
  and fecha >= '2026-09-01' and fecha <= '2026-09-30'
  and pdv_id in (
    select id from public.pdv where clave_btl in (
      'BTL-SAN-JESU-BC', 'BTL-SAN-BOSQ-5X', 'BTL-FAH-JESU-ZA', 'BTL-SAN-TECA-LK'
    )
  );

-- 4. Asegurar que en supervisor_pdv los registros de septiembre pertenezcan a Zenaida Monroy
update public.supervisor_pdv
set activo = true, fecha_fin = '2026-09-30'
where empleado_id = 'd70024f8-7f51-4085-a3c6-cf2ab77e5b16'
  and pdv_id in (
    select id from public.pdv where clave_btl in (
      'BTL-SAN-PRAD-Q0', 'BTL-FRE-PABE-BO', 'BTL-LAC-LOMA-AN',
      'BTL-SAN-STIM-27', 'BTL-SAN-INTE-AY', 'BTL-BEN-SUC.-KW',
      'BTL-CIT-INTE-YB', 'BTL-PAL-TDA-INTE', 'BTL-FAH-INTE-K2',
      'BTL-CHE-INTE-DL', 'BTL-LAC-BOSQ-Z5', 'BTL-FRE-LAHE-OY',
      'BTL-CIT-LILA-1U', 'BTL-SAN-CAST-H9', 'BTL-ESP-PRAD-0N'
    )
  )
  and fecha_inicio <= '2026-09-01';

-- 5. Eliminar registros duplicados/prematuros de septiembre para Jacqueline en tiendas que arrancan en octubre
delete from public.supervisor_pdv
where empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810'
  and fecha_inicio >= '2026-09-01' and fecha_inicio < '2026-10-01'
  and pdv_id in (
    select id from public.pdv where clave_btl in (
      'BTL-SAN-PRAD-Q0', 'BTL-FRE-PABE-BO', 'BTL-LAC-LOMA-AN',
      'BTL-SAN-STIM-27', 'BTL-SAN-INTE-AY', 'BTL-BEN-SUC.-KW',
      'BTL-CIT-INTE-YB', 'BTL-PAL-TDA-INTE', 'BTL-FAH-INTE-K2',
      'BTL-CHE-INTE-DL', 'BTL-LAC-BOSQ-Z5', 'BTL-FRE-LAHE-OY',
      'BTL-CIT-LILA-1U', 'BTL-SAN-CAST-H9', 'BTL-ESP-PRAD-0N',
      'BTL-SAN-JESU-BC', 'BTL-SAN-BOSQ-5X', 'BTL-FAH-JESU-ZA', 'BTL-SAN-TECA-LK',
      'BTL-SAN-BPIS-20'
    )
  );

-- 6. Cerrar al 2026-08-31 cualquier registro previo de Jacqueline que venía de agosto y cubría septiembre en estas tiendas
update public.supervisor_pdv
set fecha_fin = '2026-08-31', activo = false
where empleado_id = '6a95ae3b-2266-49b1-b67f-52f6e3e6b810'
  and fecha_inicio < '2026-09-01' and (fecha_fin is null or fecha_fin >= '2026-09-01')
  and pdv_id in (
    select id from public.pdv where clave_btl in (
      'BTL-SAN-PRAD-Q0', 'BTL-FRE-PABE-BO', 'BTL-LAC-LOMA-AN',
      'BTL-SAN-STIM-27', 'BTL-SAN-INTE-AY', 'BTL-BEN-SUC.-KW',
      'BTL-CIT-INTE-YB', 'BTL-PAL-TDA-INTE', 'BTL-FAH-INTE-K2',
      'BTL-CHE-INTE-DL', 'BTL-LAC-BOSQ-Z5', 'BTL-FRE-LAHE-OY',
      'BTL-CIT-LILA-1U', 'BTL-SAN-CAST-H9', 'BTL-ESP-PRAD-0N',
      'BTL-SAN-JESU-BC', 'BTL-SAN-BOSQ-5X', 'BTL-FAH-JESU-ZA', 'BTL-SAN-TECA-LK',
      'BTL-SAN-BPIS-20'
    )
  );
