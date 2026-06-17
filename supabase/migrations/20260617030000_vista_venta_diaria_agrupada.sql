-- Drop view first to allow column list changes
DROP VIEW IF EXISTS vista_venta_diaria_agrupada CASCADE;

-- Create vista_venta_diaria_agrupada migration with periodo_mes
CREATE VIEW vista_venta_diaria_agrupada AS
SELECT
  v.cuenta_cliente_id,
  v.empleado_id,
  e.nombre_completo AS empleado_nombre,
  e.supervisor_empleado_id AS supervisor_id,
  sup.nombre_completo AS supervisor_nombre,
  v.pdv_id,
  p.clave_btl AS pdv_clave_btl,
  p.nombre AS pdv_nombre,
  p.zona AS pdv_zona,
  c.nombre AS cadena_nombre,
  (v.fecha_utc AT TIME ZONE 'America/Mexico_City')::date AS fecha_operacion,
  TO_CHAR(v.fecha_utc AT TIME ZONE 'America/Mexico_City', 'YYYY-MM') AS periodo_mes,
  v.confirmada,
  SUM(v.total_unidades)::integer AS total_unidades,
  SUM(v.total_monto)::numeric AS total_monto,
  COUNT(v.id)::integer AS total_transacciones
FROM venta v
LEFT JOIN empleado e ON v.empleado_id = e.id
LEFT JOIN empleado sup ON e.supervisor_empleado_id = sup.id
LEFT JOIN pdv p ON v.pdv_id = p.id
LEFT JOIN cadena c ON p.cadena_id = c.id
GROUP BY
  v.cuenta_cliente_id,
  v.empleado_id,
  e.nombre_completo,
  e.supervisor_empleado_id,
  sup.nombre_completo,
  v.pdv_id,
  p.clave_btl,
  p.nombre,
  p.zona,
  c.nombre,
  (v.fecha_utc AT TIME ZONE 'America/Mexico_City')::date,
  TO_CHAR(v.fecha_utc AT TIME ZONE 'America/Mexico_City', 'YYYY-MM'),
  v.confirmada;
