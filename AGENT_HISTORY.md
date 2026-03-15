# 📜 AGENT_HISTORY.md - Registro Maestro de la Fábrica

Este archivo es el registro obligatorio de todas las intervenciones realizadas por agentes de IA en el proyecto Retail.

---

## [2026-03-14 09:41:52] - Regla de Oro para Tablas en Español Latino (Codex)
- **Contexto**: El usuario solicitó convertir en política irrompible que toda tabla creada por agentes use español latino.
- **Acción**:
    - Añadida la regla de oro en `CLAUDE.md`.
    - Añadida la regla de oro en `GEMINI.md`.
    - Alineada la política para tablas, columnas de negocio y excepciones documentadas.
- **Estado**: Norma central activa para futuras migraciones, esquemas y creación de tablas.

## [2026-03-14 09:41:52] - Checklist y Plantilla SQL para Tablas en Español Latino (Codex)
- **Contexto**: Se requirió volver operativa la regla de oro para que ningún agente la omita al crear tablas.
- **Acción**:
    - Creada la guía `supabase/NORMA_TABLAS_ESPANOL_LATINO.md`.
    - Creada la plantilla `supabase/PLANTILLA_TABLA_ESPANOL_LATINO.sql`.
    - Enlazadas ambas piezas desde `CLAUDE.md` y `GEMINI.md`.
- **Estado**: Regla reforzada con checklist y base reutilizable para futuras migraciones.

## [2026-03-14 08:58] - Inicialización y Alineación V3 (Antigravity)
- **Contexto**: El usuario solicitó revisar e implementar las reglas y skills del repositorio.
- **Acción**: 
    - Realizada exploración inicial del repositorio.
    - Identificada la ausencia de archivos de protocolo obligatorios (`AGENT_HISTORY.md`, `architectural_audit_alignment.md`, `task.md`).
    - Validado el stack: Next.js 16, React 19, Supabase, Zustand, Tailwind CSS 3.4 (Alineado con el Golden Path).
- **Cambios**:
    - Creación de `AGENT_HISTORY.md`.
    - Creación de `architectural_audit_alignment.md`.
    - Creación de `task.md` (Raíz) para seguimiento de tareas del proyecto.
- **Estado**: Fábrica alineada con protocolos V3.

## [2026-03-14 15:15] - Saneamiento Crítico de Mojibake (Antigravity)
- **Contexto**: El usuario reportó corrupción de caracteres (mojibake) en archivos de documentación y reglas.
- **Acción**: 
    - Saneamiento manual de todos los archivos de la raíz (`GEMINI.md`, `README.md`, `CLAUDE.md`, `AGENT_HISTORY.md` y `architectural_audit_alignment.md`) a UTF-8 puro.
    - Eliminación de patrones de corrupción como `Ã±` y `Ã¡`.
    - **Nota**: Se descartaron archivos externos (`ANALISIS_LEXAGENDA.md` y `BUSINESS_LOGIC.md`) por no pertenecer a este proyecto.
- **Estado**: Documentación legítima de Retail reparada y estandarizada a UTF-8 sin BOM.

## [2026-03-14 12:45] - Conexión de Supabase (Antigravity)
- **Contexto**: El usuario creó un nuevo proyecto en Supabase para el entorno Retail.
- **Acción**: 
    - Configuración del archivo `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
    - Registro del password de la base de datos para futuras migraciones.
- **Estado**: Aplicación conectada al backend de Supabase.

### 💡 Lecciones Aprendidas (Auto-Blindaje)
- **Error**: Se introdujo mojibake al guardar archivos con codificación inconsistente (ANSI/UTF-16 en un entorno UTF-8).
- **Causa Raíz**: Uso de herramientas de edición de archivos que no forzaban UTF-8 sin BOM de forma predeterminada.
- **Fix**: Configuración estricta de las herramientas de edición para usar únicamente UTF-8. Implementación de una validación visual obligatoria de caracteres especiales antes de cada commit.
- **Prevención**: La regla de UTF-8 ahora es una directriz crítica en `GEMINI.md` que debe ser consultada por todo agente antes de su primera intervención.

## [2026-03-14 14:20] - Limpieza de dominio legado y rebase semantico a retail (Codex)
- **Contexto**: El usuario solicito eliminar todo rastro del dominio anterior y tomar como fuente de verdad exclusiva design.md, requirements.md y tasks.md.
- **Accion**:
    - Eliminadas rutas, features, acciones, SQL y componentes ligados a citas, abogados, booking, proyectos, landing publica y correos del dominio previo.
    - Reescritos entry points (src/app, src/components/layout, src/types/database.ts, src/config/siteConfig.ts, supabase/seed.sql) para orientar la base a modulos retail.
    - Creadas pantallas base para empleados, pdvs, asignaciones, asistencias, ventas, nomina, reportes y configuracion.
- **Estado**: Repositorio depurado del dominio legado a nivel de estructura y semantica visible. Pendiente siguiente fase de implementacion funcional sobre esquema retail real.

## [2026-03-14 14:42] - Sintesis arquitectonica y bloqueos de negocio (Codex)
- **Contexto**: Consolidacion de arquitectura objetivo y orden de implementacion tomando como verdad design.md, requirements.md y tasks.md.
- **Accion**:
    - Confirmado que la arquitectura recomendada es monolito modular con Next.js 16, PWA para campo, dashboard web y Supabase con RLS.
    - Definido orden tecnico prioritario: esquema + RLS, auth derivado de puesto, estructura maestra, asignaciones, asistencias, ventas, nomina y reportes.
    - Detectadas inconsistencias criticas en documentos sobre geocerca y reglas de check-in que requieren validacion del usuario antes de seguir backend.
- **Estado**: Analisis completado. Implementacion funcional siguiente en espera de respuesta del usuario sobre reglas ambiguas.


## [2026-03-14 15:20] - Base de auth corporativa retail (Codex)
- **Contexto**: Continuacion de la fase de fundacion tras confirmar reglas de geocerca y backlog ejecutivo unico.
- **Accion**:
    - Implementado flujo de acceso con usuario, empleado, estado_cuenta y puesto en src/actions/auth.ts y src/lib/auth/session.ts.
    - Agregado login por correo o username temporal, pagina de activacion y redireccion por estados en src/app/(auth)/activacion/page.tsx y src/lib/supabase/proxy.ts.
    - Ajustada la migracion inicial para soportar acceso al propio usuario y empleado, helpers get_my_role() y politicas RLS base para el flujo de activacion.
- **Impacto**:
    - El frontend ya deja preparada la logica de cuentas PROVISIONAL, PENDIENTE_VERIFICACION_EMAIL y ACTIVA.
    - La activacion real depende de ejecutar primero las migraciones en Supabase.
- **Estado**: Implementacion base completada a nivel de codigo. Pendiente ejecucion de migraciones y validacion funcional extremo a extremo.


## [2026-03-14 15:45] - Claims JWT y primeras vistas funcionales (Codex)
- **Contexto**: Continuacion de Fase 1 tras preparar auth corporativa y estructura maestra.
- **Accion**:
    - Creada migracion supabase/migrations/20260314_1605_auth_claims_sync.sql para sincronizar rol, empleado_id, cuenta_cliente_id y estado_cuenta hacia auth.users.
    - Creada migracion supabase/migrations/20260314_1535_fase1_asignaciones_base.sql para la tabla asignacion con RLS base.
    - Implementadas vistas funcionales de empleados, pdvs y asignaciones con lectura desde Supabase y manejo de infraestructura no migrada.
- **Impacto**:
    - El dashboard ya no solo muestra placeholders: empieza a consumir las tablas objetivo del dominio retail.
    - La validacion funcional depende de ejecutar migraciones y poblar datos reales en Supabase.
- **Estado**: Avance completado a nivel de codigo. Pendiente ejecucion en Supabase y verificacion de extremo a extremo.

## [2026-03-14 18:10] - Dependencias instaladas y build validado (Codex)
- **Contexto**: Ejecucion operativa del proyecto para dejar una verificacion local real del frontend enterprise.
- **Accion**:
    - Instaladas dependencias con npm install en la raiz del repositorio.
    - Ejecutado npm run build sobre la aplicacion Next.js.
    - Confirmada compilacion exitosa con generacion de rutas de dashboard, auth y modulos retail.
- **Impacto**:
    - La base web ya compila localmente y el siguiente cuello de botella pasa a ser integracion con Supabase.
    - Se reduce riesgo de errores estructurales inmediatos en App Router, tipos y componentes principales.
- **Estado**: Build completado correctamente. Pendiente ejecutar migraciones y validar flujo funcional con backend real.

## [2026-03-14 18:25] - Lint compatible con Next 16 y tipado de paneles (Codex)
- **Contexto**: Cierre de validaciones locales tras detectar que el script lint heredado no era compatible con Next 16.
- **Accion**:
    - Corregido el script `lint` en package.json para usar eslint directamente.
    - Agregado eslint.config.mjs con configuracion flat compatible con Next 16.
    - Ajustados proxy.ts, src/features/pdvs/services/pdvService.ts y src/features/asignaciones/services/asignacionService.ts para eliminar any y normalizar relaciones tipadas de Supabase.
    - Reejecutados npm run lint y npm run build con resultado exitoso.
- **Impacto**:
    - El proyecto ya cuenta con validacion estatica funcional ademas del build.
    - Queda reducida la probabilidad de regresiones inmediatas en servicios de dashboard y estructura de App Router.
- **Estado**: Lint y build completados correctamente. Pendiente integracion real con Supabase, migraciones y pruebas funcionales.

## [2026-03-14 18:45] - Inicializacion de Supabase CLI y verificacion de enlace remoto (Codex)
- **Contexto**: Inicio de integracion real con Supabase para ejecutar migraciones, seed y validaciones contra backend.
- **Accion**:
    - Instalado y validado Supabase CLI mediante npx.
    - Inicializado el proyecto local de Supabase, generando supabase/config.toml y estructura base del CLI.
    - Verificado que el proyecto remoto no esta enlazado y que la maquina no tiene SUPABASE_ACCESS_TOKEN ni credenciales administrativas configuradas.
- **Impacto**:
    - El repositorio ya esta preparado para enlazarse al proyecto remoto y ejecutar migraciones desde CLI.
    - La ejecucion real sobre Supabase queda bloqueada unicamente por falta de autenticacion administrativa al proyecto.
- **Estado**: Preparacion local completada. Pendiente recibir acceso administrativo para enlazar el proyecto remoto y aplicar migraciones/seed.

## [2026-03-14 18:58] - Diagnostico de conectividad a Postgres remoto (Codex)
- **Contexto**: Intento de aplicar migraciones remotas usando conexion Postgres directa provista por el usuario.
- **Accion**:
    - Ejecutado supabase db push contra el host db.jbdfutvkfvmaulmnfwkk.supabase.co con password de Postgres.
    - Verificada resolucion DNS del proyecto y del host de base.
    - Confirmado que el host de Postgres expone solo IPv6 y que este entorno no logra conectividad TCP hacia 5432 por esa via.
- **Impacto**:
    - Las migraciones no pueden aplicarse desde este entorno usando la conexion directa actual.
    - El siguiente paso correcto es usar la cadena de conexion del pooler IPv4 desde el dashboard de Supabase, o bien ejecutar el push desde una red con soporte IPv6.
- **Estado**: Bloqueado por conectividad de red hacia Postgres remoto. Pendiente recibir connection string del pooler IPv4 o acceso alterno.

## [2026-03-14 21:30] - Reparacion de historial y push remoto de migraciones (Codex)
- **Contexto**: Continuacion de la integracion real con Supabase tras recibir el connection string del pooler IPv4.
- **Accion**:
    - Verificado el desfase entre historial remoto y archivos locales con `supabase migration list`.
    - Renombrada la migracion inicial a `supabase/migrations/20260314145500_fase0_estructura_maestra_retail.sql` para usar un timestamp valido de 14 digitos.
    - Ejecutado `supabase migration repair` para sustituir la version remota malformada `20260314` por `20260314145500`.
    - Ejecutado `supabase db push` sobre el pooler de sesion `aws-1-us-east-1.pooler.supabase.com:5432` para aplicar `20260314153500_fase1_asignaciones_base.sql` y `20260314160500_auth_claims_sync.sql`.
- **Impacto**:
    - El historial remoto de migraciones ya coincide con el estado local.
    - El esquema remoto incorpora la tabla `public.asignacion`, sus politicas base y la sincronizacion de claims JWT hacia `auth.users`.
- **Estado**: Migraciones remotas aplicadas y verificadas correctamente sin destruccion de base.

## [2026-03-14 22:20] - Seed real, modulo de configuracion y validacion RLS (Codex)
- **Contexto**: Continuacion de la fundacion tecnica tras alinear historial y migraciones remotas.
- **Accion**:
    - Reemplazado `supabase/seed.sql` por un seed idempotente con cuentas cliente, cadenas, ciudades, configuracion, reglas, misiones, empleados, usuarios base, PDVs, geocercas, horarios y asignaciones de arranque.
    - Implementado el modulo `configuracion` en `src/app/(main)/configuracion/page.tsx` y `src/features/configuracion/` para leer `configuracion`, `regla_negocio` y `mision_dia` desde Supabase.
    - Agregados `scripts/apply-sql-file.cjs` y `scripts/verify-rls-smoke.cjs` para operar seed y smoke tests sobre la base remota.
    - Creada y aplicada la migracion `supabase/migrations/20260314174000_rls_identity_helpers.sql` para volver `security definer` los helpers `get_my_role()`, `get_my_cuenta_cliente_id()` y `get_my_empleado_id()`.
    - Ejecutado el seed remoto y validado el aislamiento multi-tenant con `supabase/verification/rls_smoke_test.sql`.
- **Impacto**:
    - El proyecto remoto ya tiene datos base suficientes para que `empleados`, `pdvs`, `asignaciones` y `configuracion` muestren informacion real.
    - La validacion RLS ya no recursa y el smoke test por cuenta cliente pasa correctamente.
- **Estado**: Implementacion completada y validada con seed remoto y smoke test.

## [2026-03-14 22:55] - Importacion de catalogos iniciales desde Excel (Codex)
- **Contexto**: El usuario entrego los catalogos operativos reales para dejar atras los datos demo.
- **Accion**:
    - Creadas las migraciones `20260314190000_catalogos_operativos_base.sql` y `20260314191500_pdv_metadata_catalogos.sql`.
    - Implementado `tools/import-initial-catalogs.cjs` para leer Excel y hacer `upsert` idempotente sobre empleados, usuarios, PDVs, geocercas, supervisores, productos, misiones y configuracion.
    - Aplicadas ambas migraciones en Supabase remoto y ejecutada la importacion contra el pooler de sesion `:5432`.
- **Impacto**:
    - La base remota queda con 325 PDVs reales para `isdin_mexico`, 189 productos, 120 misiones activas y 252 usuarios provisionales.
    - Se incorporan 2 supervisores placeholder para nominas ausentes en el maestro de empleados.
- **Estado**: Importacion completada y validada con conteos remotos, `npm run lint` y `npm run build`.

## [2026-03-14 23:20] - Modulo administrativo de clientes y trazabilidad PDV (Codex)
- **Contexto**: El siguiente frente prioritario del backlog era exponer `cuenta_cliente` y el historial de asignacion de PDVs.
- **Accion**:
    - Implementados `src/features/clientes/services/clienteService.ts`, `src/features/clientes/components/ClientesPanel.tsx` y `src/app/(main)/clientes/page.tsx`.
    - Actualizada la navegacion en `src/components/layout/sidebar.tsx` y el dashboard en `src/app/(main)/dashboard/page.tsx` para incluir `Clientes`.
- **Impacto**:
    - La aplicacion ya expone estado de cartera multi-tenant y trazabilidad basica de cambios de PDV por cliente.
- **Estado**: Implementacion completada y validada con `npm run lint` y `npm run build`.

## [2026-03-14 23:45] - Panel real de usuarios y endurecimiento de auth (Codex)
- **Contexto**: El backlog de auth seguia ambiguo: habia flujo base, pero el modulo de usuarios era placeholder y el sistema fallaba de forma brusca cuando faltaba backend administrativo.
- **Accion**:
    - Reemplazado `src/app/(main)/admin/users/page.tsx` por una vista administrativa real apoyada en `src/features/usuarios/services/usuarioService.ts` y `src/features/usuarios/components/UsuariosPanel.tsx`.
    - Endurecido `src/actions/auth.ts` para manejar ausencia de `SUPABASE_SERVICE_ROLE_KEY` con errores controlados en login, activacion y actualizacion de password.
    - Extendida `.env.local.example` para documentar `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL`.
- **Impacto**:
    - El producto ya hace visible el bloqueo real de auth y deja de depender de excepciones no manejadas.
- **Estado**: Implementacion completada y validada con `npm run lint` y `npm run build`.

## [2026-03-14 23:55] - Validaciones previas a publicacion en asignaciones (Codex)
- **Contexto**: El modulo de `asignaciones` ya existia, pero todavia no exponia los bloqueos previos a publicacion definidos por negocio.
- **Accion**:
    - Reescritos `src/features/asignaciones/services/asignacionService.ts` y `src/features/asignaciones/components/AsignacionesPanel.tsx` para enriquecer cada asignacion con validaciones operativas calculadas en lectura.
    - Las validaciones incorporadas son: cuenta cliente obligatoria, geocerca obligatoria, supervisor activo por PDV y vigencia consistente.
- **Impacto**:
    - El modulo ya no solo lista asignaciones: tambien identifica si una asignacion esta lista para publicar o bloqueada por condiciones operativas basicas.
- **Estado**: Implementacion completada y validada con `npm run lint` y `npm run build`.

## [2026-03-15 00:15] - Base funcional de asistencias en Supabase y UI (Codex)
- **Contexto**: `asistencias` seguia como placeholder y la base remota aun no tenia tabla operativa de jornada diaria.
- **Accion**:
    - Creada y aplicada la migracion `supabase/migrations/20260314201000_asistencias_base.sql`.
    - Implementados `src/features/asistencias/services/asistenciaService.ts`, `src/features/asistencias/components/AsistenciasPanel.tsx` y `src/app/(main)/asistencias/page.tsx`.
    - Actualizado `supabase/seed.sql` y reejecutado el seed remoto para sembrar 4 jornadas de ejemplo.
- **Impacto**:
    - `asistencias` ya consume datos reales y muestra GPS, biometria, mision del dia y estatus operativo.
- **Estado**: Implementacion base completada y validada con conteos remotos, `npm run lint` y `npm run build`.

## [2026-03-15 00:30] - Base funcional de ventas ligada a jornada activa (Codex)
- **Contexto**: Tras cerrar la base de asistencias, el siguiente paso natural era ligar `ventas` a una jornada valida.
- **Accion**:
    - Creada y aplicada la migracion `supabase/migrations/20260314204000_ventas_base.sql`.
    - Implementados `src/features/ventas/services/ventaService.ts`, `src/features/ventas/components/VentasPanel.tsx` y `src/app/(main)/ventas/page.tsx`.
    - Actualizado `supabase/seed.sql` y reejecutado el seed remoto para sembrar 3 ventas de ejemplo.
- **Impacto**:
    - `ventas` deja de ser placeholder y ya refleja una base comercial diaria ligada a jornada.
- **Estado**: Implementacion base completada y validada con conteos remotos, `npm run lint` y `npm run build`.

## [2026-03-15 01:05] - Base PWA/offline integrada en app shell y modulos diarios (Codex)
- **Contexto**: Tras dejar `asistencias` y `ventas` funcionales, el siguiente frente no bloqueado era habilitar trabajo de campo sin conectividad continua.
- **Accion**:
    - Integrado bootstrap PWA con `src/app/manifest.ts`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `public/sw.js` y montaje global en `src/app/layout.tsx`.
    - Implementado `src/hooks/useOfflineSync.ts` para observar conectividad, cola local de IndexedDB y reintentos de sincronizacion usando `src/lib/offline/`.
    - Agregada vista `src/app/offline/page.tsx` y acceso desde la navegacion para fallback offline.
- **Impacto**:
    - La aplicacion ya tiene base PWA real y una cola offline visible para trabajo de campo.
    - `asistencias` y `ventas` pasan de lectura pura a captura operativa minima incluso sin red.
- **Estado**: Implementacion completada y validada con `npm run lint` y `npm run build`.

## [2026-03-15 01:30] - Estados reales de publicacion en asignaciones (Codex)
- **Contexto**: El backlog seguia marcando pendiente `BORRADOR` y `PUBLICADA`, aunque el esquema ya soportaba ambos estados.
- **Accion**:
    - Creado `src/features/asignaciones/lib/assignmentValidation.ts`.
    - Creadas `src/features/asignaciones/actions.ts` y `src/features/asignaciones/components/AsignacionEstadoControls.tsx`.
    - Ajustada `src/app/(main)/asignaciones/page.tsx` para distinguir entre administradores con capacidad de gestion y actores en solo lectura.
- **Impacto**:
    - `asignaciones` ya permite publicar o regresar a borrador con bloqueo previo cuando faltan condiciones operativas.
- **Estado**: Implementacion completada y validada con `npm run lint` y `npm run build`.

## [2026-03-15 01:50] - Captura viva de GPS y selfie en asistencias (Codex)
- **Contexto**: Tras dejar la cola offline lista, el formulario de `asistencias` seguia dependiendo de captura manual.
- **Accion**:
    - Extendida `src/features/asistencias/services/asistenciaService.ts` para adjuntar contexto de geocerca por PDV.
    - Reescrito `src/features/asistencias/components/AsistenciasPanel.tsx` para capturar posicion via `navigator.geolocation`, calcular distancia a geocerca y exigir justificacion cuando queda fuera.
    - Integrada captura de selfie local con `input capture`, hashing SHA-256 y persistencia de metadata en el borrador offline.
- **Impacto**:
    - El item de backlog sobre asistencias con GPS, selfie y justificacion fuera de geocerca queda cubierto en la capa actual de producto.
- **Estado**: Implementacion completada y validada con `npm run lint` y `npm run build`.

## [2026-03-15 02:20] - Provisionamiento real de usuarios en Supabase Auth (Codex)
- **Contexto**: El backlog de auth seguia bloqueado en el ultimo tramo: existian flujo, estados y panel administrativo, pero `public.usuario` aun no estaba enlazada con `auth.users`.
- **Accion**:
    - Creado `scripts/provision-auth-users.cjs` y agregado `auth:provision` en `package.json`.
    - Ejecutada la provision real contra Supabase con resultado de `261` usuarios vinculados y `0` usuarios operativos restantes sin `auth_user_id`.
    - Ajustado `src/actions/auth.ts` para usar `emailRedirectTo` hacia `/update-password` tanto en activacion como en recuperacion, con fallback a headers.
- **Impacto**:
    - `auth` deja de estar en estado teorico y pasa a estar operativo de punta a punta para login, activacion y sincronizacion de identidad.
- **Estado**: Implementacion completada y validada con login real, `npm run lint` y `npm run build`.

## [2026-03-15 02:55] - Modulo real de nomina, cuotas y ledger (Codex)
- **Contexto**: Tras cerrar auth extremo a extremo, el siguiente frente del backlog era abandonar el placeholder de `nomina` y conectar pre-nomina con `asistencia` y `venta`.
- **Accion**:
    - Creada la migracion `supabase/migrations/20260314212000_nomina_cuotas_ledger_base.sql` con `public.nomina_periodo`, `public.cuota_empleado_periodo`, `public.nomina_ledger`, triggers de `updated_at`, control de un solo periodo abierto y helper `public.es_operador_nomina()`.
    - Implementados `src/features/nomina/services/nominaService.ts`, `src/features/nomina/actions.ts`, `src/features/nomina/components/NominaPanel.tsx`, `src/features/nomina/components/PeriodoNominaControls.tsx` y `src/app/(main)/nomina/page.tsx`.
    - Extendido `src/lib/auth/session.ts` con `requerirPuestosActivos()` y `requerirOperadorNomina()`.
    - Actualizado `supabase/seed.sql` para sembrar 2 periodos, 3 cuotas y 4 movimientos de ledger.
- **Impacto**:
    - `/nomina` deja de ser placeholder y pasa a mostrar periodos, control operativo de cierre, pre-nomina, cuotas y ledger.
- **Estado**: Implementacion completada y validada con conteos remotos, `npm run lint` y `npm run build`.

## [2026-03-15 03:20] - Modulo real de reportes y wrapper local de Supabase CLI (Codex)
- **Contexto**: Tras cerrar `nomina`, `cuotas` y `ledger`, el siguiente frente del backlog era reemplazar el placeholder de `reportes` y estabilizar el uso de Supabase CLI en Windows.
- **Accion**:
    - Implementados `src/features/reportes/services/reporteService.ts`, `src/features/reportes/components/ReportesPanel.tsx` y `src/app/(main)/reportes/page.tsx`.
    - Creado `scripts/run-supabase-cli.cjs` y agregado `npm run supabase:cli` en `package.json` para reutilizar la CLI desde `.npm-cache/_npx`.
    - Reaplicado `supabase/seed.sql` en remoto para insertar eventos idempotentes en `public.audit_log`.
    - Verificada la base remota con conteos reales: `audit_log=3`, `asistencia=4`, `venta=3`, `cuota_empleado_periodo=3`, `nomina_ledger=4`, `nomina_periodo=2`.
- **Impacto**:
    - `/reportes` deja de ser placeholder y ya consolida informacion real de asistencia, ventas, cuotas, nomina y auditoria.
    - La operacion local con Supabase CLI queda estabilizada dentro del repo incluso si Bitdefender vuelve a bloquear `npx`.
- **Estado**: Implementacion completada y validada con datos remotos reales, `npm run supabase:cli -- migration list`, `npm run lint` y `npm run build`.

## [2026-03-15 03:55] - Invalidez de sesion por cambio de puesto y suite de pruebas retail (Codex)
- **Contexto**: Tras cerrar `reportes`, el backlog aun tenia dos pendientes transversales: evitar sesiones stale cuando cambia el `puesto` y crear una base de pruebas automatizadas del dominio retail.
- **Accion**:
    - Creada la migracion `supabase/migrations/20260314214500_auth_session_context.sql` para insertar `auth_context_updated_at` en `auth.users.raw_app_meta_data` cada vez que se refrescan claims por cambios de `puesto`, `estado_cuenta`, `empleado_id` o `cuenta_cliente_id`.
    - Integrado `src/proxy.ts` con `src/lib/supabase/proxy.ts` para revisar el contexto auth en cada request, refrescar la sesion si el cambio es reciente y cerrar sesion si el token sigue stale o supera la ventana de 5 minutos.
    - Agregado `src/components/auth/AuthSessionMonitor.tsx` al layout global para repetir la comprobacion cada minuto y al recuperar foco o visibilidad.
    - Creada `playwright.retail.config.ts` con pruebas en `tests/session-context.spec.ts`, `tests/assignment-validation.spec.ts` y `tests/reportes-aggregation.spec.ts`.
    - Aplicada la migracion en remoto con la CLI local y verificado que `261` usuarios en `auth.users` ya contienen `auth_context_updated_at`.
- **Impacto**:
    - La sesion deja de depender solo del vencimiento natural del JWT y ahora responde al cambio de `puesto` o claims en una ventana operativa menor o igual a 5 minutos.
    - El proyecto suma cobertura automatizada para reglas puras de asignacion, agregacion de reportes y coherencia del contexto de sesion.
- **Estado**: Implementacion completada y validada con `npm run test`, `npm run lint`, `npm run build`, `npm run supabase:cli -- migration list` y verificacion remota de metadata auth.
