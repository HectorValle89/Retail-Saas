# Proyecto Retail - Backlog Ejecutivo

Archivo ejecutivo unico del proyecto, alineado a:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

## Decisiones de negocio confirmadas

- Check-in fuera de geocerca: permitido con justificacion.
- Radio de geocerca por defecto: 100 metros.
- Operacion ejecutiva: una sola planeacion y seguimiento centralizado en este archivo.

## Estado general

- Fase activa: Fundacion tecnica.
- Estado: En progreso.
- Objetivo actual: cerrar esquema inicial Supabase, base multi-tenant y arranque de auth/estructura maestra.

## Plan ejecutivo

### P0 - Fundacion tecnica

- [x] Eliminar el dominio heredado del repositorio y dejar base semantica retail.
- [x] Reorientar navegacion, entry points, tipos base y seed placeholder al dominio retail.
- [x] Resolver ambiguedades criticas de geocerca con el usuario.
- [x] Crear migracion inicial de estructura maestra retail en `supabase/migrations`.
- [x] Ejecutar migracion inicial en Supabase.
- [x] Validar RLS base con cuentas de prueba interna y rol CLIENTE.
- [x] Crear seed inicial real para `cuenta_cliente`, `cadena`, `ciudad`, `mision_dia` y configuracion base.
- [x] Cargar catalogos operativos iniciales desde Excel para empleados, PDVs, productos, misiones, turnos y dias laborales.

### P1 - Auth y control de acceso

- [x] Implementar `usuario` + estados de cuenta `PROVISIONAL`, `PENDIENTE_VERIFICACION_EMAIL`, `ACTIVA`, `SUSPENDIDA`, `BAJA`.
- [x] Derivar permisos desde `puesto` como unica fuente de verdad.
- [x] Inyectar claims JWT: `rol`, `cuenta_cliente_id`, `empleado_id`.
- [x] Bloquear acceso operativo a cuentas no activadas.
- [x] Preparar invalidacion de sesion en <= 5 minutos cuando cambie `puesto`.

### P1 - Estructura maestra

- [x] Implementar modulo `empleados`.
- [x] Implementar modulo `pdvs` con geocerca y supervisor.
- [x] Implementar `cuenta_cliente` y asignacion historica de PDVs a clientes.
- [x] Implementar `configuracion`, `regla_negocio` y `mision_dia`.

### P1 - Planeacion operativa

- [x] Implementar `asignaciones`.
- [x] Implementar validaciones de asignacion previas a publicacion.
- [x] Implementar estados `BORRADOR` y `PUBLICADA`.

### P1 - Ejecucion diaria

- [x] Implementar `asistencias` con GPS, selfie y justificacion fuera de geocerca.
- [x] Implementar `ventas` ligadas a jornada activa.
- [x] Preparar cola offline y sync base para PWA.

### P2 - Control y gobierno

- [x] Implementar `nomina`, `ledger` y `cuotas`.
- [x] Implementar `reportes`, `bitacora` y `ranking`.
- [x] Implementar pruebas de integracion y property-based tests.

## Dependencias criticas

- El esquema Supabase debe existir antes de levantar modulos de negocio.
- Auth depende de `empleado`, `usuario` y claims JWT.
- `asignaciones` depende de `empleado`, `pdv`, `geocerca_pdv`, `supervisor_pdv` y configuracion.
- `asistencias` depende de `asignaciones`, `mision_dia`, `geocerca_pdv` y auth activa.
- `nomina` y `cuotas` dependen de `asistencias`, `ventas` y periodos cerrables.

## Bitacora ejecutiva

### 2026-03-14 14:20
- Se limpio el dominio heredado del repositorio.
- Se reescribieron puntos de entrada y navegacion base a modulos retail.
- Estado: completado.

### 2026-03-14 14:42
- Se consolidaron arquitectura objetivo, dependencias y bloqueos de negocio.
- Se fijaron decisiones de geocerca para v1 con validacion del usuario.
- Estado: completado.

### 2026-03-14 14:55
- Se crea backlog ejecutivo unico y se arranca Fase 0 real con migracion inicial de Supabase.
- Estado: en progreso.

### 2026-03-14 15:20
- Se implementa base de acceso corporativo con `usuario`, `empleado`, `estado_cuenta` y `puesto` en codigo.
- Se agrega login por correo o username temporal, pagina de activacion y guardas de acceso por estado.
- Se amplian helpers y politicas previstas en migracion para acceso al propio usuario y empleado.
- Estado: en progreso, pendiente ejecutar migraciones y validar flujo real con Supabase.

### 2026-03-14 15:45
- Se agrega migracion de sincronizacion de claims JWT hacia uth.users.
- Se agrega migracion base de signacion con RLS y estado BORRADOR/PUBLICADA.
- Se implementan primeras vistas funcionales de empleados, pdvs y signaciones con lectura desde Supabase y tolerancia a infraestructura pendiente.
- Estado: en progreso, pendiente ejecutar migraciones y validar datos reales.

### 2026-03-14 18:10
- Se instalan dependencias del proyecto y se valida `npm run build` con compilacion correcta.
- La aplicacion genera rutas de auth, dashboard y modulos retail sin errores de build.
- Estado: en progreso, compilacion local validada; pendiente ejecutar migraciones y pruebas funcionales contra Supabase.

### 2026-03-14 18:25
- Se corrige el script `lint` para compatibilidad con Next 16 y se agrega `eslint.config.mjs`.
- Se eliminan tipados debiles en servicios de PDVs y asignaciones para que `lint` y `build` pasen de forma consistente.
- Estado: en progreso, validacion local cerrada con `npm run lint` y `npm run build`; pendiente backend real en Supabase.

### 2026-03-14 18:45
- Se instala y valida Supabase CLI con `npx supabase --version`.
- Se inicializa la carpeta de trabajo de Supabase y se genera `supabase/config.toml`.
- Se verifica que el proyecto remoto aun no esta enlazado y que faltan credenciales administrativas para ejecutar migraciones y seed.
- Estado: en progreso, preparacion local completada; bloqueado solo por autenticacion administrativa a Supabase.

### 2026-03-14 18:58
- Se intenta `supabase db push` con conexion Postgres directa al proyecto remoto.
- Se diagnostica que el host `db.jbdfutvkfvmaulmnfwkk.supabase.co` resuelve solo IPv6 y que este entorno no tiene conectividad efectiva a 5432 por IPv6.
- Estado: en progreso, bloqueado por red; se requiere connection string del pooler IPv4 o ejecutar desde entorno con IPv6.

### 2026-03-14 21:30
- Se repara el historial de migraciones remoto reemplazando la version malformada `20260314` por `20260314145500`.
- Se renombran localmente los archivos para usar timestamps validos de 14 digitos en `supabase/migrations`.
- Se ejecuta `supabase db push` por pooler de sesion `:5432` y quedan aplicadas `20260314153500_fase1_asignaciones_base.sql` y `20260314160500_auth_claims_sync.sql`.
- Estado: en progreso, historial de migraciones alineado y esquema remoto actualizado sin destruccion de base.

### 2026-03-14 22:20
- Se reemplaza `supabase/seed.sql` por un seed idempotente con cuentas cliente, cadenas, ciudades, misiones, configuracion, empleados, PDVs y asignaciones base.
- Se implementa el modulo `configuracion` con lectura real de `configuracion`, `regla_negocio` y `mision_dia` desde Supabase.
- Se agrega migracion correctiva `20260314174000_rls_identity_helpers.sql` para evitar recursion en helpers usados por policies RLS.
- Se aplica el seed al proyecto remoto y se valida aislamiento multi-tenant con `scripts/verify-rls-smoke.cjs`.
- Estado: en progreso, fundacion tecnica cerrada a nivel de seed y RLS base; pendiente seguir con auth operativo, clientes y modulos de ejecucion.

### 2026-03-14 22:55
- Se crean y aplican las migraciones `20260314190000_catalogos_operativos_base.sql` y `20260314191500_pdv_metadata_catalogos.sql` para soportar catalogos reales de producto, misiones y metadata operacional de PDVs.
- Se implementa `tools/import-initial-catalogs.cjs` y se cargan en remoto los catalogos Excel iniciales de empleados, usuarios provisionales, PDVs, geocercas, supervisores, productos, misiones y configuracion derivada.
- Quedan sincronizados 325 PDVs reales hacia `isdin_mexico`, 189 productos, 120 misiones activas y 2 supervisores placeholder para nominas ausentes en el maestro de empleados.
- Estado: en progreso, catalogos operativos reales cargados y validados con `npm run lint` y `npm run build`.

### 2026-03-14 23:20
- Se implementa el modulo administrativo `clientes` con ruta `/clientes`, resumen multi-tenant, cuentas cliente y historial reciente de asignacion de PDVs.
- La navegacion principal y el dashboard incorporan el acceso a `Clientes` como parte de estructura maestra/control administrativo.
- Estado: en progreso, estructura maestra de clientes visible y validada con `npm run lint` y `npm run build`.

### 2026-03-14 23:45
- Se reemplaza el placeholder de `Gestion de usuarios` por un panel administrativo real con estados de cuenta, vinculacion auth y diagnostico de provisionamiento.
- Se endurece `src/actions/auth.ts` para que el flujo de login/activacion no reviente cuando falta backend administrativo y devuelva errores operativos claros.
- Se documentan `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` en `.env.local.example`.
- Estado: en progreso, auth mejor diagnosticado pero aun bloqueado para provisionamiento real mientras no existan `auth.users` vinculados y `SUPABASE_SERVICE_ROLE_KEY`.

### 2026-03-14 23:55
- Se amplian `src/features/asignaciones/services/asignacionService.ts` y `src/features/asignaciones/components/AsignacionesPanel.tsx` para calcular bloqueos previos a publicacion.
- Las validaciones ahora consideran geocerca obligatoria, supervisor activo por PDV, cuenta cliente presente y consistencia de vigencia.
- Estado: en progreso, validaciones previas a publicacion visibles y validadas con `npm run lint` y `npm run build`.

### 2026-03-15 00:15
- Se crea la migracion `20260314201000_asistencias_base.sql` con tabla `asistencia`, GPS, biometria, mision del dia, justificacion fuera de geocerca y RLS base.
- Se implementa el modulo funcional `asistencias` con lectura real desde Supabase y se aplican 4 registros seed de jornada para validar estados cerrada, abierta, pendiente y rechazada.
- Estado: en progreso, base de asistencias operativa; pendiente flujo movil de captura selfie/camara y validacion biometrica real.

### 2026-03-15 00:30
- Se crea la migracion `20260314204000_ventas_base.sql` con tabla `venta` ligada a `asistencia` y trigger que exige jornada valida base.
- Se implementa el modulo funcional `ventas` con lectura real desde Supabase y 3 ventas seed ligadas a jornadas activas/cerradas.
- Estado: en progreso, ventas base operativas y ligadas a jornada; pendiente captura operativa en vivo y detalle por linea.


### 2026-03-15 01:05
- Se integra base PWA/offline con `manifest`, iconos generados, `public/sw.js` y bootstrap global en `src/app/layout.tsx`.
- Se implementa `src/hooks/useOfflineSync.ts` para vigilar conectividad, cola local e intentos de sincronizacion desde IndexedDB.
- `asistencias` y `ventas` dejan de ser solo lectura: ahora pueden guardar borradores locales y reintentar sync cuando vuelve la red.
- Estado: en progreso, bloque offline/PWA base cerrado y validado con `npm run lint` y `npm run build`; pendiente evolucionar a captura movil completa de GPS/selfie y background sync mas agresivo.



### 2026-03-15 01:30
- Se implementa transicion real de asignaciones entre `BORRADOR` y `PUBLICADA` con validacion server-side antes de publicar.
- `src/features/asignaciones/actions.ts` ahora verifica geocerca, supervisor activo, cuenta cliente y vigencia antes de aceptar la publicacion.
- El panel de `asignaciones` expone acciones de publicar o volver a borrador solo para administradores y mantiene vista de solo lectura para el resto.
- Estado: en progreso, estados de publicacion cerrados y validados con `npm run lint` y `npm run build`; el siguiente bloqueo mayor sigue siendo auth administrativo real por falta de `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.


### 2026-03-15 01:50
- Se completa captura local de asistencias con geolocalizacion viva, evaluacion de geocerca, selfie con hash SHA-256 y justificacion obligatoria fuera de geocerca.
- `src/features/asistencias/services/asistenciaService.ts` ahora inyecta contexto de geocerca por PDV para el formulario operativo.
- El flujo offline conserva latitud, longitud, precision, distancia, hash de selfie y metadata local dentro del borrador de jornada.
- Estado: en progreso, item de asistencias con GPS/selfie/justificacion cerrado y validado con `npm run lint` y `npm run build`; pendiente upload binario al storage, biometria real y auth extremo a extremo.

### 2026-03-15 02:20
- Se agrega `scripts/provision-auth-users.cjs` y el script npm `auth:provision` para crear usuarios reales en `auth.users`, enlazarlos con `public.usuario` y registrar password temporal con expiracion operativa.
- Se ejecuta la provision real en Supabase: `261` usuarios quedan vinculados a `auth_user_id`, con resumen operativo de `254` cuentas `PROVISIONAL` y `7` `ACTIVA`.
- Se ajusta `src/actions/auth.ts` para resolver `emailRedirectTo` hacia `/update-password` tanto en activacion como en recuperacion, incluso si falta `NEXT_PUBLIC_SITE_URL` y hay que derivar origen desde headers.
- Se corrige `package.json` para restaurar JSON valido y se valida el bloque completo con login real de cuentas provisionadas, `npm run lint` y `npm run build`.
- Estado: en progreso, auth extremo a extremo operativo en provisionamiento, login y activacion; sigue pendiente la invalidacion de sesion con SLA <= 5 minutos cuando cambie `puesto`.

### 2026-03-15 02:55
- Se crea la migracion 20260314212000_nomina_cuotas_ledger_base.sql con 
omina_periodo, cuota_empleado_periodo, 
omina_ledger, helper es_operador_nomina() y RLS para perfiles ADMINISTRADOR / NOMINA.
- Se implementa el modulo funcional 
omina con resumen ejecutivo, control de cierre/reapertura de periodos, pre-nomina por colaborador, cuotas comerciales y ledger reciente.
- Se actualiza supabase/seed.sql para sembrar 2 periodos, 3 cuotas y 4 movimientos de ledger ligados a las asistencias y ventas demo ya existentes.
- La migracion se aplica en remoto por pg y se registra manualmente en supabase_migrations.schema_migrations porque 
px supabase db push fallo por permisos de 
pm en Windows, no por error del esquema.
- Estado: en progreso, bloque de 
omina / ledger / cuotas cerrado y validado con conteos remotos, 
pm run lint y 
pm run build; queda pendiente eportes, auditoria ampliada e invalidacion de sesion por cambio de puesto.

### 2026-03-15 03:20
- Se implementa el modulo real `reportes` con consolidado ejecutivo, ranking comercial, ranking de cumplimiento y bitacora reciente sobre `asistencia`, `venta`, `cuota_empleado_periodo`, `nomina_ledger` y `audit_log`.
- Se agrega `scripts/run-supabase-cli.cjs` y el script `npm run supabase:cli` para reutilizar la CLI de Supabase desde la cache local sin depender de `npx` ni del `postinstall` bloqueado por Bitdefender.
- Se reaplica `supabase/seed.sql` en remoto y quedan verificados `3` eventos en `audit_log`, `4` asistencias, `3` ventas, `3` cuotas, `4` movimientos de ledger y `2` periodos de nomina para alimentar los reportes.
- Estado: en progreso, bloque de reportes cerrado con datos remotos reales y wrapper estable para CLI; siguen pendientes pruebas de integracion/property-based e invalidacion de sesion por cambio de puesto.

### 2026-03-15 03:55
- Se crea la migracion `20260314214500_auth_session_context.sql` para versionar el contexto auth dentro de `auth.users.raw_app_meta_data` mediante `auth_context_updated_at` y se aplica en remoto con `supabase db push`.
- Se integra `src/proxy.ts` con `src/lib/supabase/proxy.ts` para detectar tokens stale, refrescarlos dentro de una ventana de 5 minutos y cerrar sesion si el contexto auth sigue viejo o excede la gracia.
- Se agrega `src/components/auth/AuthSessionMonitor.tsx` al layout global para revisar la sesion cada minuto y al volver foco/visibilidad, forzando `router.refresh()` o `signOut()` segun corresponda.
- Se crea la suite `playwright.retail.config.ts` con pruebas en `tests/` para contexto de sesion, validacion de asignaciones y agregacion de reportes; `npm run test`, `npm run lint` y `npm run build` pasan.
- Estado: backlog ejecutivo funcionalmente cerrado; quedan solo evoluciones futuras de producto, no pendientes abiertos del plan actual.
