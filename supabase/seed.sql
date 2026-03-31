-- =====================================================
-- SEED INICIAL REAL - FIELD FORCE PLATFORM
-- =====================================================
-- Fuente de verdad:
--   1. .kiro/specs/field-force-platform/design.md
--   2. .kiro/specs/field-force-platform/requirements.md
--   3. .kiro/specs/field-force-platform/tasks.md
--
-- Objetivo:
-- - Sembrar estructura minima util para desarrollo y demos controladas.
-- - Mantener inserts idempotentes para reejecucion segura.
-- - Cubrir cuenta_cliente, cadena, ciudad, mision_dia, configuracion base,
--   estructura minima de empleados, PDVs y asignaciones.
--
-- Nota:
-- `auth_user_id` se mantiene en NULL para no simular cuentas reales de
-- Supabase Auth dentro del seed. La vinculacion definitiva ocurre al
-- provisionar usuarios reales desde el flujo de autenticacion.
-- =====================================================

begin;

insert into public.cuenta_cliente (identificador, nombre, activa, configuracion)
values
  (
    'be_te_ele_demo',
    'be te ele demo',
    true,
    '{"modo":"demo","portal_cliente":true,"timezone":"America/Mexico_City"}'::jsonb
  ),
  (
    'isdin_mexico',
    'ISDIN Mexico',
    true,
    '{"modo":"productivo_controlado","portal_cliente":true,"timezone":"America/Mexico_City"}'::jsonb
  )
on conflict (identificador) do update
set
  nombre = excluded.nombre,
  activa = excluded.activa,
  configuracion = excluded.configuracion,
  updated_at = now();

insert into public.cadena (codigo, nombre, factor_cuota_default, activa)
values
  ('SAN', 'SAN PABLO', 1.25, true),
  ('FAH', 'F AHORRO/DERMA', 1.25, true),
  ('BEN', 'BENAVIDES', 1.20, true),
  ('HEB', 'HEB', 1.25, true),
  ('LAC', 'LA COMER', 1.25, true),
  ('LIV', 'LIVERPOOL', 1.50, true),
  ('CHE', 'CHEDRAUI', 1.20, true),
  ('CIT', 'CITY MARKET', 1.25, true),
  ('SEP', 'SEPHORA', 1.30, true),
  ('FRA', 'FRAGUA', 1.10, true),
  ('TEST', 'TEST', 1.00, true)
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  factor_cuota_default = excluded.factor_cuota_default,
  activa = excluded.activa,
  updated_at = now();

insert into public.ciudad (nombre, zona, estado, activa)
values
  ('AGUASCALIENTES', 'Centro-Norte', 'AGUASCALIENTES', true),
  ('ATIZAPAN DE ZARAGOZA', 'TEST', 'ESTADO DE MEXICO', true),
  ('AZCAPOTZALCO', 'TEST', 'CIUDAD DE MEXICO', true),
  ('CANCUN', 'Sureste', 'QUINTANA ROO', true),
  ('CDMX', 'Centro', 'CIUDAD DE MEXICO', true),
  ('CIUDAD DE MEXICO', 'Centro', 'CIUDAD DE MEXICO', true),
  ('COAHUILA', 'Noreste', 'COAHUILA', true),
  ('COYOACAN', 'TEST', 'CIUDAD DE MEXICO', true),
  ('CUAJIMALPA DE MORELOS', 'TEST', 'CIUDAD DE MEXICO', true),
  ('MONTERREY', 'Noreste', 'NUEVO LEON', true),
  ('GUADALAJARA', 'Occidente', 'JALISCO', true),
  ('CUERNAVACA', 'Centro-Sur', 'MORELOS', true),
  ('GUANAJUATO', 'Centro-Norte', 'GUANAJUATO', true),
  ('IRAPUATO', 'Centro-Norte', 'GUANAJUATO', true),
  ('NICOLAS ROMERO', 'TEST', 'ESTADO DE MEXICO', true),
  ('PUEBLA', 'Centro-Sur', 'PUEBLA', true),
  ('MERIDA', 'Sureste', 'YUCATAN', true),
  ('MOCHIS', 'Noroeste', 'SINALOA', true),
  ('LOS MOCHIS', 'Noroeste', 'SINALOA', true),
  ('OAXACA', 'Sur', 'OAXACA', true),
  ('QUERETARO', 'Centro-Norte', 'QUERETARO', true),
  ('LEON', 'Centro-Norte', 'GUANAJUATO', true),
  ('REYNOSA', 'Noreste', 'TAMAULIPAS', true),
  ('SAN FRANCISCO DEL RINCON', 'Centro-Norte', 'GUANAJUATO', true),
  ('TAMPICO', 'Noreste', 'TAMAULIPAS', true),
  ('TIJUANA', 'Noroeste', 'BAJA CALIFORNIA', true),
  ('TLALNEPANTLA DE BAZ', 'TEST', 'ESTADO DE MEXICO', true),
  ('TOLUCA', 'Centro', 'ESTADO DE MEXICO', true),
  ('HERMOSILLO', 'Noroeste', 'SONORA', true),
  ('CULIACAN', 'Noroeste', 'SINALOA', true),
  ('MAZATLAN', 'Noroeste', 'SINALOA', true)
on conflict (nombre) do update
set
  zona = excluded.zona,
  estado = excluded.estado,
  activa = excluded.activa,
  updated_at = now();

insert into public.configuracion (clave, valor, descripcion, modulo)
values
  (
    'geocerca.radio_default_metros',
    '150'::jsonb,
    'Radio de geocerca por defecto confirmado por negocio para v1.',
    'asistencias'
  ),
  (
    'geocerca.fuera_permitida_con_justificacion',
    'true'::jsonb,
    'Check-in fuera de geocerca permitido con justificacion segun decision validada.',
    'asistencias'
  ),
  (
    'auth.activacion.password_temporal_horas',
    '72'::jsonb,
    'Horas de vigencia para password temporal en estado PROVISIONAL.',
    'auth'
  ),
  (
    'auth.activacion.verificacion_email_horas',
    '24'::jsonb,
    'Horas de vigencia para el enlace de verificacion de correo.',
    'auth'
  ),
  (
    'auth.invalidacion_sesion_rol_minutos',
    '5'::jsonb,
    'Tiempo maximo para invalidar sesiones cuando cambia el puesto o una cuenta cliente es desactivada.',
    'auth'
  ),
  (
    'asignaciones.publicacion.requiere_validacion_previa',
    'true'::jsonb,
    'Ninguna asignacion pasa a PUBLICADA sin ejecutar las validaciones del servicio de asignaciones.',
    'asignaciones'
  ),
  (
    'dashboard.kpi_cache_segundos',
    '300'::jsonb,
    'TTL maximo para KPIs agregados del dashboard web.',
    'dashboard'
  ),
  (
    'ventas.captura.requiere_jornada_activa',
    'true'::jsonb,
    'Las ventas solo pueden registrarse con un check-in valido y check-out pendiente.',
    'ventas'
  )
on conflict (clave) do update
set
  valor = excluded.valor,
  descripcion = excluded.descripcion,
  modulo = excluded.modulo,
  updated_at = now();

insert into public.regla_negocio (codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa)
values
  (
    'ASISTENCIA_GEO_001',
    'asistencias',
    'Check-in fuera de geocerca permitido con justificacion cuando exista desviacion frente al radio configurado.',
    'ALERTA',
    10,
    jsonb_build_object(
      'radio_default_metros', 150,
      'evalua_desviacion', true
    ),
    jsonb_build_object(
      'permitir', true,
      'requiere_justificacion', true
    ),
    true
  ),
  (
    'ASIGNACION_PDV_SIN_GEOCERCA',
    'asignaciones',
    'Bloquea la publicacion de asignaciones hacia PDVs que no tienen geocerca completa.',
    'ERROR',
    20,
    jsonb_build_object('requiere_geocerca', true),
    jsonb_build_object('bloquear_publicacion', true, 'codigo', 'PDV_SIN_GEOCERCA'),
    true
  ),
  (
    'ASIGNACION_PDV_SIN_SUPERVISOR',
    'asignaciones',
    'Bloquea la publicacion de asignaciones hacia PDVs sin supervisor activo.',
    'ERROR',
    30,
    jsonb_build_object('requiere_supervisor_activo', true),
    jsonb_build_object('bloquear_publicacion', true, 'codigo', 'PDV_SIN_SUPERVISOR'),
    true
  ),
  (
    'HORARIO_SAN_PABLO_SEMANAL',
    'asistencias',
    'Genera alerta cuando un PDV de la cadena SAN PABLO no tiene horario semanal cargado para el periodo activo.',
    'ALERTA',
    40,
    jsonb_build_object('cadena_codigo', 'SAN', 'requiere_horario_semanal', true),
    jsonb_build_object('alerta', 'PDV_SIN_HORARIOS_SAN_PABLO'),
    true
  )
on conflict (codigo) do update
set
  modulo = excluded.modulo,
  descripcion = excluded.descripcion,
  severidad = excluded.severidad,
  prioridad = excluded.prioridad,
  condicion = excluded.condicion,
  accion = excluded.accion,
  activa = excluded.activa,
  updated_at = now();

insert into public.mision_dia (id, instruccion, activa, orden)
values
  ('a0000000-0000-4000-8000-000000000001', 'Haz una V con los dedos frente al rostro.', true, 1),
  ('a0000000-0000-4000-8000-000000000002', 'Toca tu frente con la mano derecha.', true, 2),
  ('a0000000-0000-4000-8000-000000000003', 'Sonrie mostrando los dientes.', true, 3),
  ('a0000000-0000-4000-8000-000000000004', 'Levanta el pulgar izquierdo a la altura del hombro.', true, 4),
  ('a0000000-0000-4000-8000-000000000005', 'Coloca la mano abierta sobre el pecho.', true, 5),
  ('a0000000-0000-4000-8000-000000000006', 'Mira ligeramente hacia arriba sin cerrar los ojos.', true, 6),
  ('a0000000-0000-4000-8000-000000000007', 'Haz un gesto de saludo con la mano derecha.', true, 7),
  ('a0000000-0000-4000-8000-000000000008', 'Coloca el indice izquierdo sobre la mejilla.', true, 8),
  ('a0000000-0000-4000-8000-000000000009', 'Junta ambas manos a la altura del menton.', true, 9),
  ('a0000000-0000-4000-8000-000000000010', 'Inclina ligeramente la cabeza hacia la izquierda.', true, 10),
  ('a0000000-0000-4000-8000-000000000011', 'Haz circulo con pulgar e indice.', true, 11),
  ('a0000000-0000-4000-8000-000000000012', 'Muestra cuatro dedos extendidos con la mano derecha.', true, 12),
  ('a0000000-0000-4000-8000-000000000013', 'Apoya la punta de los dedos en la barbilla.', true, 13),
  ('a0000000-0000-4000-8000-000000000014', 'Cruza los brazos al frente sin tapar el rostro.', true, 14),
  ('a0000000-0000-4000-8000-000000000015', 'Separa ambas manos a la altura de los hombros.', true, 15),
  ('a0000000-0000-4000-8000-000000000016', 'Haz una senal de paz con la mano izquierda.', true, 16),
  ('a0000000-0000-4000-8000-000000000017', 'Toca la sien derecha con dos dedos.', true, 17),
  ('a0000000-0000-4000-8000-000000000018', 'Coloca la mano izquierda detras de la oreja.', true, 18),
  ('a0000000-0000-4000-8000-000000000019', 'Muestra ambas palmas mirando a la camara.', true, 19),
  ('a0000000-0000-4000-8000-000000000020', 'Levanta el punio derecho sin cubrir la cara.', true, 20)
on conflict (id) do update
set
  instruccion = excluded.instruccion,
  activa = excluded.activa,
  orden = excluded.orden,
  updated_at = now();

insert into public.empleado (
  id_nomina,
  nombre_completo,
  curp,
  nss,
  rfc,
  puesto,
  zona,
  telefono,
  correo_electronico,
  estatus_laboral,
  fecha_alta,
  supervisor_empleado_id,
  metadata
)
values
  (
    'ADM-001',
    'CARLA MENDOZA ORTIZ',
    'MEOC850101MDFRRL01',
    '55018501011',
    'MEOC850101AB1',
    'ADMINISTRADOR',
    'Corporativo',
    '5510000001',
    'carla.mendoza@beteele.demo',
    'ACTIVO',
    '2026-01-01',
    null,
    '{"origen":"seed","perfil":"administracion"}'::jsonb
  ),
  (
    'COO-001',
    'DIEGO RAMIREZ LOPEZ',
    'RALD860215HDFMRG02',
    '55028602152',
    'RALD860215C31',
    'COORDINADOR',
    'Centro',
    '5510000002',
    'diego.ramirez@beteele.demo',
    'ACTIVO',
    '2026-01-01',
    null,
    '{"origen":"seed","perfil":"coordinacion"}'::jsonb
  ),
  (
    'SUP-001',
    'MARIO ORTEGA CRUZ',
    'OECM880320HDFRZR09',
    '55038803203',
    'OECM880320KT4',
    'SUPERVISOR',
    'Centro',
    '5510000003',
    'mario.ortega@beteele.demo',
    'ACTIVO',
    '2026-01-10',
    (select id from public.empleado where id_nomina = 'COO-001'),
    '{"origen":"seed","perfil":"supervision"}'::jsonb
  ),
  (
    'SUP-002',
    'PATRICIA SALGADO VEGA',
    'SAVP890406MNLLGT04',
    '55048904064',
    'SAVP890406NM6',
    'SUPERVISOR',
    'Noreste',
    '5510000004',
    'patricia.salgado@beteele.demo',
    'ACTIVO',
    '2026-01-10',
    (select id from public.empleado where id_nomina = 'COO-001'),
    '{"origen":"seed","perfil":"supervision"}'::jsonb
  ),
  (
    'DC-001',
    'ANA TORRES SOLIS',
    'TOSA930711MDFRNN08',
    '55059307118',
    'TOSA930711QE1',
    'DERMOCONSEJERO',
    'Centro',
    '5510000005',
    'ana.torres@beteele.demo',
    'ACTIVO',
    '2026-02-01',
    (select id from public.empleado where id_nomina = 'SUP-001'),
    '{"origen":"seed","perfil":"campo"}'::jsonb
  ),
  (
    'DC-002',
    'LUCIA REYES MARTINEZ',
    'REML950908MNLYRC05',
    '55069509085',
    'REML950908KQ2',
    'DERMOCONSEJERO',
    'Noreste',
    '5510000006',
    'lucia.reyes@beteele.demo',
    'ACTIVO',
    '2026-02-03',
    (select id from public.empleado where id_nomina = 'SUP-002'),
    '{"origen":"seed","perfil":"campo"}'::jsonb
  ),
  (
    'DC-003',
    'SOFIA VIDAL HERRERA',
    'VIHS960224MJCDRF03',
    '55079602243',
    'VIHS960224PA9',
    'DERMOCONSEJERO',
    'Occidente',
    '5510000007',
    'sofia.vidal@beteele.demo',
    'ACTIVO',
    '2026-02-05',
    (select id from public.empleado where id_nomina = 'SUP-001'),
    '{"origen":"seed","perfil":"campo"}'::jsonb
  ),
  (
    'CLI-001',
    'MONICA IBARRA RUIZ',
    'IARM900101MDFBRN07',
    '55089001017',
    'IARM900101QX8',
    'CLIENTE',
    'Cliente Demo',
    '5510000008',
    'monica.ibarra@cliente-demo.com',
    'ACTIVO',
    '2026-02-10',
    null,
    '{"origen":"seed","perfil":"cliente"}'::jsonb
  ),
  (
    'CLI-002',
    'RODRIGO SOLIS VEGA',
    'SOVR910515HPLLGD02',
    '55099105152',
    'SOVR910515LM4',
    'CLIENTE',
    'Cliente ISDIN',
    '5510000009',
    'rodrigo.solis@isdin-demo.com',
    'ACTIVO',
    '2026-02-10',
    null,
    '{"origen":"seed","perfil":"cliente"}'::jsonb
  )
on conflict (id_nomina) do update
set
  nombre_completo = excluded.nombre_completo,
  curp = excluded.curp,
  nss = excluded.nss,
  rfc = excluded.rfc,
  puesto = excluded.puesto,
  zona = excluded.zona,
  telefono = excluded.telefono,
  correo_electronico = excluded.correo_electronico,
  estatus_laboral = excluded.estatus_laboral,
  fecha_alta = excluded.fecha_alta,
  supervisor_empleado_id = excluded.supervisor_empleado_id,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.usuario (
  empleado_id,
  cuenta_cliente_id,
  username,
  estado_cuenta,
  correo_electronico,
  correo_verificado,
  password_temporal_generada_en,
  password_temporal_expira_en
)
values
  (
    (select id from public.empleado where id_nomina = 'ADM-001'),
    null,
    'admin.carla',
    'ACTIVA',
    'carla.mendoza@beteele.demo',
    true,
    null,
    null
  ),
  (
    (select id from public.empleado where id_nomina = 'COO-001'),
    null,
    'coord.diego',
    'ACTIVA',
    'diego.ramirez@beteele.demo',
    true,
    null,
    null
  ),
  (
    (select id from public.empleado where id_nomina = 'SUP-001'),
    null,
    'sup.mario',
    'ACTIVA',
    'mario.ortega@beteele.demo',
    true,
    null,
    null
  ),
  (
    (select id from public.empleado where id_nomina = 'SUP-002'),
    null,
    'sup.patricia',
    'ACTIVA',
    'patricia.salgado@beteele.demo',
    true,
    null,
    null
  ),
  (
    (select id from public.empleado where id_nomina = 'DC-001'),
    null,
    'dc.ana',
    'ACTIVA',
    'ana.torres@beteele.demo',
    true,
    null,
    null
  ),
  (
    (select id from public.empleado where id_nomina = 'DC-002'),
    null,
    'dc.lucia',
    'PENDIENTE_VERIFICACION_EMAIL',
    'lucia.reyes@beteele.demo',
    false,
    now(),
    now() + interval '72 hours'
  ),
  (
    (select id from public.empleado where id_nomina = 'DC-003'),
    null,
    'dc.sofia',
    'PROVISIONAL',
    null,
    false,
    now(),
    now() + interval '72 hours'
  ),
  (
    (select id from public.empleado where id_nomina = 'CLI-001'),
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    'cliente.demo',
    'ACTIVA',
    'monica.ibarra@cliente-demo.com',
    true,
    null,
    null
  ),
  (
    (select id from public.empleado where id_nomina = 'CLI-002'),
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    'cliente.isdin',
    'ACTIVA',
    'rodrigo.solis@isdin-demo.com',
    true,
    null,
    null
  )
on conflict (username) do update
set
  empleado_id = excluded.empleado_id,
  cuenta_cliente_id = excluded.cuenta_cliente_id,
  estado_cuenta = excluded.estado_cuenta,
  correo_electronico = excluded.correo_electronico,
  correo_verificado = excluded.correo_verificado,
  password_temporal_generada_en = excluded.password_temporal_generada_en,
  password_temporal_expira_en = excluded.password_temporal_expira_en,
  updated_at = now();

insert into public.pdv (
  clave_btl,
  cadena_id,
  ciudad_id,
  id_cadena,
  nombre,
  direccion,
  zona,
  formato,
  horario_entrada,
  horario_salida,
  estatus
)
values
  (
    'BTL-SAN-1001',
    (select id from public.cadena where codigo = 'SAN'),
    (select id from public.ciudad where nombre = 'CIUDAD DE MEXICO'),
    '1001',
    'SAN PABLO DEL VALLE',
    'Av. Universidad 740, Del Valle, Ciudad de Mexico',
    'Centro',
    '400',
    '09:00',
    '18:00',
    'ACTIVO'
  ),
  (
    'BTL-BEN-2001',
    (select id from public.cadena where codigo = 'BEN'),
    (select id from public.ciudad where nombre = 'MONTERREY'),
    '2001',
    'BENAVIDES CUMBRES',
    'Paseo de los Leones 1201, Monterrey',
    'Noreste',
    '270',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-LIV-3001',
    (select id from public.cadena where codigo = 'LIV'),
    (select id from public.ciudad where nombre = 'PUEBLA'),
    '3001',
    'LIVERPOOL ANGELOPOLIS',
    'Blvd. del Nino Poblano 2510, Puebla',
    'Centro-Sur',
    'departamental',
    '11:00',
    '20:00',
    'ACTIVO'
  ),
  (
    'BTL-SEP-4001',
    (select id from public.cadena where codigo = 'SEP'),
    (select id from public.ciudad where nombre = 'GUADALAJARA'),
    '4001',
    'SEPHORA ANDARES',
    'Blvd. Puerta de Hierro 4965, Guadalajara',
    'Occidente',
    'especializada',
    '11:00',
    '20:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-GUS-01',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'ATIZAPAN DE ZARAGOZA'),
    'TST-001',
    'GUS TEST 1',
    'Av. Xochimanga 43, San Miguel Xochimanga, 52927 Cdad. Lopez Mateos, Mex.',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-GUS-02',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'NICOLAS ROMERO'),
    'TST-002',
    'GUS TEST 2',
    'Bodega Aurrera Nicolas Romero Cto. Gral. Anaya Manzana 018, Zaragoza, 54457 Cdad. Nicolas Romero, Mex.',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-JAVI-01',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'CUAJIMALPA DE MORELOS'),
    'TST-003',
    'JAVI TES 1',
    'Fuente de la Luna 100, Col Fuentes del Pedregal, CP 14140',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-JAVI-02',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'COYOACAN'),
    'TST-004',
    'JAVI TES 2',
    'Calle museo 81 casa 5 San Pablo Tepetlapa 04620 Coyoacan CDMX',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-HECT-01',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'CUAJIMALPA DE MORELOS'),
    'TST-005',
    'HECT TES 1',
    'Av. Secretaria de Marina 458-B, Lomas de Vista Hermosa, Cuajimalpa de Morelos, 05129 Ciudad de Mexico, CDMX',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-HECT-02',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'TLALNEPANTLA DE BAZ'),
    'TST-006',
    'HECT TES 2',
    'Penins. de Indochina 19, U.H. Rosario II Sector III, 54090 Tlalnepantla, Mex.',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-HECT-03',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'AZCAPOTZALCO'),
    'TST-007',
    'HECT TES 3',
    'Eje 5 Nte 990, Santa Barbara, Azcapotzalco, 02230 Ciudad de Mexico, CDMX',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  ),
  (
    'BTL-TST-HECT-04',
    (select id from public.cadena where codigo = 'TEST'),
    (select id from public.ciudad where nombre = 'AZCAPOTZALCO'),
    'TST-008',
    'HECT TES 4',
    'Nueva Rosario, 02128 Ciudad de Mexico, CDMX',
    'TEST',
    'test',
    '10:00',
    '19:00',
    'ACTIVO'
  )
on conflict (clave_btl) do update
set
  cadena_id = excluded.cadena_id,
  ciudad_id = excluded.ciudad_id,
  id_cadena = excluded.id_cadena,
  nombre = excluded.nombre,
  direccion = excluded.direccion,
  zona = excluded.zona,
  formato = excluded.formato,
  horario_entrada = excluded.horario_entrada,
  horario_salida = excluded.horario_salida,
  estatus = excluded.estatus,
  updated_at = now();

insert into public.geocerca_pdv (
  pdv_id,
  latitud,
  longitud,
  radio_tolerancia_metros,
  permite_checkin_con_justificacion
)
values
  (
    (select id from public.pdv where clave_btl = 'BTL-SAN-1001'),
    19.3894990,
    -99.1687700,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-BEN-2001'),
    25.7078430,
    -100.3811460,
    120,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    19.0171810,
    -98.2428940,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-SEP-4001'),
    20.7098780,
    -103.4121930,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-GUS-01'),
    19.5796636,
    -99.2194452,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-GUS-02'),
    19.6279306,
    -99.3219257,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-JAVI-01'),
    19.3073231,
    -99.2221518,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-JAVI-02'),
    19.3221044,
    -99.1443169,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-01'),
    19.3849231,
    -99.2659694,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-02'),
    19.5129231,
    -99.1857827,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-03'),
    19.5041963,
    -99.1781070,
    100,
    true
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-04'),
    19.5031591,
    -99.1895185,
    100,
    true
  )
on conflict (pdv_id) do update
set
  latitud = excluded.latitud,
  longitud = excluded.longitud,
  radio_tolerancia_metros = excluded.radio_tolerancia_metros,
  permite_checkin_con_justificacion = excluded.permite_checkin_con_justificacion,
  updated_at = now();

insert into public.horario_pdv (
  id,
  pdv_id,
  nivel_prioridad,
  dia_semana,
  codigo_turno,
  hora_entrada,
  hora_salida,
  activo,
  observaciones
)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    (select id from public.pdv where clave_btl = 'BTL-SAN-1001'),
    2,
    1,
    'TC',
    '09:00',
    '18:00',
    true,
    'Horario base semanal para SAN PABLO.'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    (select id from public.pdv where clave_btl = 'BTL-BEN-2001'),
    2,
    1,
    'TC',
    '10:00',
    '19:00',
    true,
    'Horario base semanal para BENAVIDES.'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    2,
    1,
    'TC',
    '11:00',
    '20:00',
    true,
    'Horario base semanal para LIVERPOOL.'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    (select id from public.pdv where clave_btl = 'BTL-SEP-4001'),
    2,
    1,
    'TC',
    '11:00',
    '20:00',
    true,
    'Horario base semanal para SEPHORA.'
  )
on conflict (id) do update
set
  pdv_id = excluded.pdv_id,
  nivel_prioridad = excluded.nivel_prioridad,
  dia_semana = excluded.dia_semana,
  codigo_turno = excluded.codigo_turno,
  hora_entrada = excluded.hora_entrada,
  hora_salida = excluded.hora_salida,
  activo = excluded.activo,
  observaciones = excluded.observaciones,
  updated_at = now();

insert into public.supervisor_pdv (pdv_id, empleado_id, activo, fecha_inicio, fecha_fin)
values
  (
    (select id from public.pdv where clave_btl = 'BTL-SAN-1001'),
    (select id from public.empleado where id_nomina = 'SUP-001'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-BEN-2001'),
    (select id from public.empleado where id_nomina = 'SUP-002'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    (select id from public.empleado where id_nomina = 'SUP-001'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-SEP-4001'),
    (select id from public.empleado where id_nomina = 'SUP-002'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-GUS-01'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_01@fieldforce.test'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-GUS-02'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_01@fieldforce.test'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-JAVI-01'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_02@fieldforce.test'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-JAVI-02'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_02@fieldforce.test'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-01'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_03@fieldforce.test'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-02'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_03@fieldforce.test'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-03'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_03@fieldforce.test'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-04'),
    (select id from public.empleado where correo_electronico = 'test_supervisor_03@fieldforce.test'),
    true,
    '2026-03-01',
    null
  )
on conflict (pdv_id, empleado_id, fecha_inicio) do update
set
  activo = excluded.activo,
  fecha_fin = excluded.fecha_fin,
  updated_at = now();

insert into public.cuenta_cliente_pdv (cuenta_cliente_id, pdv_id, activo, fecha_inicio, fecha_fin)
values
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-SAN-1001'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-BEN-2001'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    (select id from public.pdv where clave_btl = 'BTL-SEP-4001'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-GUS-01'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-GUS-02'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-JAVI-01'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-JAVI-02'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-01'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-02'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-03'),
    true,
    '2026-03-01',
    null
  ),
  (
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.pdv where clave_btl = 'BTL-TST-HECT-04'),
    true,
    '2026-03-01',
    null
  )
on conflict (cuenta_cliente_id, pdv_id, fecha_inicio) do update
set
  activo = excluded.activo,
  fecha_fin = excluded.fecha_fin,
  updated_at = now();

insert into public.asignacion (
  id,
  cuenta_cliente_id,
  empleado_id,
  pdv_id,
  supervisor_empleado_id,
  clave_btl,
  tipo,
  factor_tiempo,
  dias_laborales,
  dia_descanso,
  fecha_inicio,
  fecha_fin,
  observaciones,
  estado_publicacion
)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.empleado where id_nomina = 'DC-001'),
    (select id from public.pdv where clave_btl = 'BTL-SAN-1001'),
    (select id from public.empleado where id_nomina = 'SUP-001'),
    'BTL-SAN-1001',
    'FIJA',
    1.000,
    'L,M,MI,J,V,S',
    'DOMINGO',
    '2026-03-01',
    null,
    'Asignacion fija base para cuenta demo.',
    'PUBLICADA'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.empleado where id_nomina = 'DC-002'),
    (select id from public.pdv where clave_btl = 'BTL-BEN-2001'),
    (select id from public.empleado where id_nomina = 'SUP-002'),
    'BTL-BEN-2001',
    'ROTATIVA',
    1.000,
    'L,M,MI,J,V',
    'SABADO',
    '2026-03-01',
    null,
    'Asignacion de referencia para zona noreste.',
    'BORRADOR'
  ),
  (
    'c0000000-0000-4000-8000-000000000003',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    (select id from public.empleado where id_nomina = 'DC-003'),
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    (select id from public.empleado where id_nomina = 'SUP-001'),
    'BTL-LIV-3001',
    'FIJA',
    1.000,
    'L,M,MI,J,V,S',
    'DOMINGO',
    '2026-03-01',
    null,
    'Asignacion visible para cliente ISDIN.',
    'PUBLICADA'
  )
on conflict (id) do update
set
  cuenta_cliente_id = excluded.cuenta_cliente_id,
  empleado_id = excluded.empleado_id,
  pdv_id = excluded.pdv_id,
  supervisor_empleado_id = excluded.supervisor_empleado_id,
  clave_btl = excluded.clave_btl,
  tipo = excluded.tipo,
  factor_tiempo = excluded.factor_tiempo,
  dias_laborales = excluded.dias_laborales,
  dia_descanso = excluded.dia_descanso,
  fecha_inicio = excluded.fecha_inicio,
  fecha_fin = excluded.fecha_fin,
  observaciones = excluded.observaciones,
  estado_publicacion = excluded.estado_publicacion,
  updated_at = now();

insert into public.asistencia (
  id,
  cuenta_cliente_id,
  asignacion_id,
  empleado_id,
  supervisor_empleado_id,
  pdv_id,
  fecha_operacion,
  empleado_nombre,
  pdv_clave_btl,
  pdv_nombre,
  pdv_zona,
  cadena_nombre,
  check_in_utc,
  check_out_utc,
  latitud_check_in,
  longitud_check_in,
  latitud_check_out,
  longitud_check_out,
  distancia_check_in_metros,
  distancia_check_out_metros,
  estado_gps,
  justificacion_fuera_geocerca,
  mision_dia_id,
  mision_codigo,
  mision_instruccion,
  biometria_estado,
  biometria_score,
  selfie_check_in_hash,
  selfie_check_in_url,
  selfie_check_out_hash,
  selfie_check_out_url,
  estatus,
  origen,
  metadata
)
values
  (
    'd0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    'c0000000-0000-4000-8000-000000000001',
    (select id from public.empleado where id_nomina = 'DC-001'),
    (select id from public.empleado where id_nomina = 'SUP-001'),
    (select id from public.pdv where clave_btl = 'BTL-SAN-1001'),
    '2026-03-14',
    'ANA TORRES SOLIS',
    'BTL-SAN-1001',
    'SAN PABLO DEL VALLE',
    'Centro',
    'SAN PABLO',
    '2026-03-14T15:02:00Z',
    '2026-03-14T23:10:00Z',
    19.3895100,
    -99.1687700,
    19.3895000,
    -99.1687600,
    18,
    21,
    'DENTRO_GEOCERCA',
    null,
    coalesce(
      (select id from public.mision_dia where codigo = 'M0001' limit 1),
      (select id from public.mision_dia order by orden asc limit 1)
    ),
    'M0001',
    coalesce(
      (select instruccion from public.mision_dia where codigo = 'M0001' limit 1),
      'Mision operativa inicial'
    ),
    'VALIDA',
    98.40,
    'sha256_demo_checkin_001',
    'checkins/demo-001-in.jpg',
    'sha256_demo_checkout_001',
    'checkins/demo-001-out.jpg',
    'CERRADA',
    'ONLINE',
    '{"fuente":"seed","escenario":"checkin_valido_cerrado"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    'c0000000-0000-4000-8000-000000000002',
    (select id from public.empleado where id_nomina = 'DC-002'),
    (select id from public.empleado where id_nomina = 'SUP-002'),
    (select id from public.pdv where clave_btl = 'BTL-BEN-2001'),
    '2026-03-14',
    'LUCIA REYES MARTINEZ',
    'BTL-BEN-2001',
    'BENAVIDES CUMBRES',
    'Noreste',
    'BENAVIDES',
    '2026-03-14T16:30:00Z',
    null,
    25.7086000,
    -100.3825000,
    null,
    null,
    148,
    null,
    'FUERA_GEOCERCA',
    'Trafico y bloqueo temporal del acceso principal; se registra con evidencia y validacion pendiente.',
    coalesce(
      (select id from public.mision_dia where codigo = 'M0002' limit 1),
      (select id from public.mision_dia order by orden asc offset 1 limit 1)
    ),
    'M0002',
    coalesce(
      (select instruccion from public.mision_dia where codigo = 'M0002' limit 1),
      'Mision operativa fuera de geocerca'
    ),
    'VALIDA',
    94.10,
    'sha256_demo_checkin_002',
    'checkins/demo-002-in.jpg',
    null,
    null,
    'PENDIENTE_VALIDACION',
    'ONLINE',
    '{"fuente":"seed","escenario":"fuera_geocerca_con_justificacion"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000003',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    'c0000000-0000-4000-8000-000000000003',
    (select id from public.empleado where id_nomina = 'DC-003'),
    (select id from public.empleado where id_nomina = 'SUP-001'),
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    '2026-03-14',
    'SOFIA VIDAL HERRERA',
    'BTL-LIV-3001',
    'LIVERPOOL ANGELOPOLIS',
    'Centro-Sur',
    'LIVERPOOL',
    '2026-03-14T17:05:00Z',
    null,
    19.0171800,
    -98.2428900,
    null,
    null,
    12,
    null,
    'DENTRO_GEOCERCA',
    null,
    coalesce(
      (select id from public.mision_dia where codigo = 'M0003' limit 1),
      (select id from public.mision_dia order by orden asc offset 2 limit 1)
    ),
    'M0003',
    coalesce(
      (select instruccion from public.mision_dia where codigo = 'M0003' limit 1),
      'Mision operativa abierta'
    ),
    'VALIDA',
    96.80,
    'sha256_demo_checkin_003',
    'checkins/demo-003-in.jpg',
    null,
    null,
    'VALIDA',
    'ONLINE',
    '{"fuente":"seed","escenario":"jornada_abierta"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000004',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    'c0000000-0000-4000-8000-000000000003',
    (select id from public.empleado where id_nomina = 'DC-003'),
    (select id from public.empleado where id_nomina = 'SUP-001'),
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    '2026-03-13',
    'SOFIA VIDAL HERRERA',
    'BTL-LIV-3001',
    'LIVERPOOL ANGELOPOLIS',
    'Centro-Sur',
    'LIVERPOOL',
    '2026-03-13T17:00:00Z',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'SIN_GPS',
    'Sin señal en el dispositivo durante el intento inicial.',
    coalesce(
      (select id from public.mision_dia where codigo = 'M0004' limit 1),
      (select id from public.mision_dia order by orden asc offset 3 limit 1)
    ),
    'M0004',
    coalesce(
      (select instruccion from public.mision_dia where codigo = 'M0004' limit 1),
      'Mision operativa rechazada'
    ),
    'NO_EVALUADA',
    null,
    'sha256_demo_checkin_004',
    'checkins/demo-004-in.jpg',
    null,
    null,
    'RECHAZADA',
    'ONLINE',
    '{"fuente":"seed","escenario":"rechazada_sin_gps"}'::jsonb
  )
on conflict (id) do update
set
  cuenta_cliente_id = excluded.cuenta_cliente_id,
  asignacion_id = excluded.asignacion_id,
  empleado_id = excluded.empleado_id,
  supervisor_empleado_id = excluded.supervisor_empleado_id,
  pdv_id = excluded.pdv_id,
  fecha_operacion = excluded.fecha_operacion,
  empleado_nombre = excluded.empleado_nombre,
  pdv_clave_btl = excluded.pdv_clave_btl,
  pdv_nombre = excluded.pdv_nombre,
  pdv_zona = excluded.pdv_zona,
  cadena_nombre = excluded.cadena_nombre,
  check_in_utc = excluded.check_in_utc,
  check_out_utc = excluded.check_out_utc,
  latitud_check_in = excluded.latitud_check_in,
  longitud_check_in = excluded.longitud_check_in,
  latitud_check_out = excluded.latitud_check_out,
  longitud_check_out = excluded.longitud_check_out,
  distancia_check_in_metros = excluded.distancia_check_in_metros,
  distancia_check_out_metros = excluded.distancia_check_out_metros,
  estado_gps = excluded.estado_gps,
  justificacion_fuera_geocerca = excluded.justificacion_fuera_geocerca,
  mision_dia_id = excluded.mision_dia_id,
  mision_codigo = excluded.mision_codigo,
  mision_instruccion = excluded.mision_instruccion,
  biometria_estado = excluded.biometria_estado,
  biometria_score = excluded.biometria_score,
  selfie_check_in_hash = excluded.selfie_check_in_hash,
  selfie_check_in_url = excluded.selfie_check_in_url,
  selfie_check_out_hash = excluded.selfie_check_out_hash,
  selfie_check_out_url = excluded.selfie_check_out_url,
  estatus = excluded.estatus,
  origen = excluded.origen,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.venta (
  id,
  cuenta_cliente_id,
  asistencia_id,
  empleado_id,
  pdv_id,
  producto_id,
  producto_sku,
  producto_nombre,
  producto_nombre_corto,
  fecha_utc,
  total_unidades,
  total_monto,
  confirmada,
  validada_por_empleado_id,
  validada_en,
  observaciones,
  origen,
  metadata
)
values
  (
    'e0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    'd0000000-0000-4000-8000-000000000001',
    (select id from public.empleado where id_nomina = 'DC-001'),
    (select id from public.pdv where clave_btl = 'BTL-SAN-1001'),
    (select id from public.producto where sku = '8429420107502'),
    '8429420107502',
    'FOTOPROTECTOR ISDIN 50+ FUSION WATER MAGIC 50ML',
    'FP FW MAGIC 50ML',
    '2026-03-14T22:45:00Z',
    6,
    1794.00,
    true,
    (select id from public.empleado where id_nomina = 'SUP-001'),
    '2026-03-14T23:05:00Z',
    'Venta confirmada al cierre de la visita demo.',
    'ONLINE',
    '{"fuente":"seed","escenario":"venta_confirmada_cierre"}'::jsonb
  ),
  (
    'e0000000-0000-4000-8000-000000000002',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    'd0000000-0000-4000-8000-000000000003',
    (select id from public.empleado where id_nomina = 'DC-003'),
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    (select id from public.producto where sku = '8429420226265'),
    '8429420226265',
    'FOTOPROTECTOR ISDIN FUSION WATER MAGIC LIGHT',
    'FP FW MAGIC LIGHT',
    '2026-03-14T21:20:00Z',
    4,
    1296.00,
    false,
    null,
    null,
    'Venta capturada durante jornada abierta; pendiente de confirmacion en check-out.',
    'ONLINE',
    '{"fuente":"seed","escenario":"venta_pendiente_jornada_abierta"}'::jsonb
  ),
  (
    'e0000000-0000-4000-8000-000000000003',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    'd0000000-0000-4000-8000-000000000003',
    (select id from public.empleado where id_nomina = 'DC-003'),
    (select id from public.pdv where clave_btl = 'BTL-LIV-3001'),
    (select id from public.producto where sku = '8429420201361'),
    '8429420201361',
    'FOTOPROTECTOR ISDIN FUSION WATER URBAN',
    'FP FW URBAN',
    '2026-03-14T21:40:00Z',
    2,
    598.00,
    true,
    (select id from public.empleado where id_nomina = 'SUP-001'),
    '2026-03-14T22:00:00Z',
    'Venta validada durante seguimiento de jornada activa.',
    'ONLINE',
    '{"fuente":"seed","escenario":"venta_validada_jornada_activa"}'::jsonb
  )
on conflict (id) do update
set
  cuenta_cliente_id = excluded.cuenta_cliente_id,
  asistencia_id = excluded.asistencia_id,
  empleado_id = excluded.empleado_id,
  pdv_id = excluded.pdv_id,
  producto_id = excluded.producto_id,
  producto_sku = excluded.producto_sku,
  producto_nombre = excluded.producto_nombre,
  producto_nombre_corto = excluded.producto_nombre_corto,
  fecha_utc = excluded.fecha_utc,
  total_unidades = excluded.total_unidades,
  total_monto = excluded.total_monto,
  confirmada = excluded.confirmada,
  validada_por_empleado_id = excluded.validada_por_empleado_id,
  validada_en = excluded.validada_en,
  observaciones = excluded.observaciones,
  origen = excluded.origen,
  metadata = excluded.metadata,
  updated_at = now();


insert into public.nomina_periodo (
  id,
  clave,
  fecha_inicio,
  fecha_fin,
  estado,
  fecha_cierre,
  observaciones,
  metadata
)
values
  (
    'f0000000-0000-4000-8000-000000000001',
    'NOM-2026-03-B',
    '2026-03-10',
    '2026-03-23',
    'ABIERTO',
    null,
    'Periodo operativo actual para pre-nomina, cuotas y ledger de campo.',
    '{"fuente":"seed","escenario":"periodo_abierto_nomina"}'::jsonb
  ),
  (
    'f0000000-0000-4000-8000-000000000002',
    'NOM-2026-02-B',
    '2026-02-24',
    '2026-03-09',
    'CERRADO',
    '2026-03-10T02:00:00Z',
    'Periodo historico de referencia para control interno.',
    '{"fuente":"seed","escenario":"periodo_cerrado_nomina"}'::jsonb
  )
on conflict (id) do update
set
  clave = excluded.clave,
  fecha_inicio = excluded.fecha_inicio,
  fecha_fin = excluded.fecha_fin,
  estado = excluded.estado,
  fecha_cierre = excluded.fecha_cierre,
  observaciones = excluded.observaciones,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.cuota_empleado_periodo (
  id,
  periodo_id,
  cuenta_cliente_id,
  empleado_id,
  cadena_id,
  objetivo_monto,
  objetivo_unidades,
  avance_monto,
  avance_unidades,
  factor_cuota,
  cumplimiento_porcentaje,
  bono_estimado,
  estado,
  metadata
)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.empleado where id_nomina = 'DC-001'),
    (select id from public.cadena where nombre = 'SAN PABLO'),
    1500.00,
    5,
    1794.00,
    6,
    1.15,
    119.60,
    125.00,
    'CUMPLIDA',
    '{"fuente":"seed","escenario":"cuota_cumplida_demo"}'::jsonb
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.empleado where id_nomina = 'DC-002'),
    (select id from public.cadena where nombre = 'BENAVIDES'),
    1200.00,
    4,
    0.00,
    0,
    1.00,
    0.00,
    0.00,
    'EN_CURSO',
    '{"fuente":"seed","escenario":"cuota_en_curso_pendiente"}'::jsonb
  ),
  (
    'f1000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    (select id from public.empleado where id_nomina = 'DC-003'),
    (select id from public.cadena where nombre = 'LIVERPOOL'),
    1800.00,
    5,
    598.00,
    2,
    1.20,
    33.22,
    0.00,
    'RIESGO',
    '{"fuente":"seed","escenario":"cuota_en_riesgo_isdin"}'::jsonb
  )
on conflict (id) do update
set
  periodo_id = excluded.periodo_id,
  cuenta_cliente_id = excluded.cuenta_cliente_id,
  empleado_id = excluded.empleado_id,
  cadena_id = excluded.cadena_id,
  objetivo_monto = excluded.objetivo_monto,
  objetivo_unidades = excluded.objetivo_unidades,
  avance_monto = excluded.avance_monto,
  avance_unidades = excluded.avance_unidades,
  factor_cuota = excluded.factor_cuota,
  cumplimiento_porcentaje = excluded.cumplimiento_porcentaje,
  bono_estimado = excluded.bono_estimado,
  estado = excluded.estado,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.nomina_ledger (
  id,
  periodo_id,
  cuenta_cliente_id,
  empleado_id,
  tipo_movimiento,
  concepto,
  referencia_tabla,
  referencia_id,
  monto,
  moneda,
  notas,
  metadata
)
values
  (
    'f2000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.empleado where id_nomina = 'DC-001'),
    'PERCEPCION',
    'ASISTENCIA_BASE',
    'asistencia',
    'd0000000-0000-4000-8000-000000000001',
    450.00,
    'MXN',
    'Jornada cerrada y validada para pre-nomina.',
    '{"fuente":"seed","escenario":"ledger_asistencia_base"}'::jsonb
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo'),
    (select id from public.empleado where id_nomina = 'DC-002'),
    'DEDUCCION',
    'RETENCION_VALIDACION',
    'asistencia',
    'd0000000-0000-4000-8000-000000000002',
    120.00,
    'MXN',
    'Retencion temporal por jornada fuera de geocerca pendiente de cierre.',
    '{"fuente":"seed","escenario":"ledger_retencion_validacion"}'::jsonb
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    (select id from public.empleado where id_nomina = 'DC-003'),
    'PERCEPCION',
    'ASISTENCIA_BASE',
    'asistencia',
    'd0000000-0000-4000-8000-000000000003',
    450.00,
    'MXN',
    'Jornada activa con check-in valido considerada para pre-nomina.',
    '{"fuente":"seed","escenario":"ledger_asistencia_activa"}'::jsonb
  ),
  (
    'f2000000-0000-4000-8000-000000000004',
    'f0000000-0000-4000-8000-000000000001',
    (select id from public.cuenta_cliente where identificador = 'isdin_mexico'),
    (select id from public.empleado where id_nomina = 'DC-003'),
    'AJUSTE',
    'APOYO_TRANSPORTE',
    'asistencia',
    'd0000000-0000-4000-8000-000000000003',
    80.00,
    'MXN',
    'Ajuste manual de movilidad asociado al periodo operativo.',
    '{"fuente":"seed","escenario":"ledger_ajuste_transporte"}'::jsonb
  )
on conflict (id) do update
set
  periodo_id = excluded.periodo_id,
  cuenta_cliente_id = excluded.cuenta_cliente_id,
  empleado_id = excluded.empleado_id,
  tipo_movimiento = excluded.tipo_movimiento,
  concepto = excluded.concepto,
  referencia_tabla = excluded.referencia_tabla,
  referencia_id = excluded.referencia_id,
  monto = excluded.monto,
  moneda = excluded.moneda,
  notas = excluded.notas,
  metadata = excluded.metadata,
  updated_at = now();


insert into public.audit_log (
  tabla,
  registro_id,
  accion,
  payload,
  usuario_id,
  cuenta_cliente_id
)
select
  'asistencia',
  'd0000000-0000-4000-8000-000000000001',
  'EVENTO',
  '{"evento":"seed_asistencia_validada","resumen":"Se consolida jornada valida para control operativo y pre-nomina."}'::jsonb,
  (select id from public.usuario where empleado_id = (select id from public.empleado where id_nomina = 'ADM-001')),
  (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo')
where not exists (
  select 1
  from public.audit_log
  where tabla = 'asistencia'
    and registro_id = 'd0000000-0000-4000-8000-000000000001'
    and accion = 'EVENTO'
    and payload ->> 'evento' = 'seed_asistencia_validada'
);

insert into public.audit_log (
  tabla,
  registro_id,
  accion,
  payload,
  usuario_id,
  cuenta_cliente_id
)
select
  'venta',
  'e0000000-0000-4000-8000-000000000001',
  'EVENTO',
  '{"evento":"seed_venta_confirmada","resumen":"Venta confirmada incorporada al consolidado comercial del dia."}'::jsonb,
  (select id from public.usuario where empleado_id = (select id from public.empleado where id_nomina = 'ADM-001')),
  (select id from public.cuenta_cliente where identificador = 'be_te_ele_demo')
where not exists (
  select 1
  from public.audit_log
  where tabla = 'venta'
    and registro_id = 'e0000000-0000-4000-8000-000000000001'
    and accion = 'EVENTO'
    and payload ->> 'evento' = 'seed_venta_confirmada'
);

insert into public.audit_log (
  tabla,
  registro_id,
  accion,
  payload,
  usuario_id,
  cuenta_cliente_id
)
select
  'nomina_periodo',
  'f0000000-0000-4000-8000-000000000001',
  'EVENTO',
  '{"evento":"seed_periodo_nomina_abierto","resumen":"Periodo de nomina abierto para consolidar cuotas, ledger y pre-nomina."}'::jsonb,
  (select id from public.usuario where empleado_id = (select id from public.empleado where id_nomina = 'ADM-001')),
  null
where not exists (
  select 1
  from public.audit_log
  where tabla = 'nomina_periodo'
    and registro_id = 'f0000000-0000-4000-8000-000000000001'
    and accion = 'EVENTO'
    and payload ->> 'evento' = 'seed_periodo_nomina_abierto'
);
commit;
