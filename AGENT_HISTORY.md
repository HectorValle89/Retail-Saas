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
- **Contexto**: El usuario solicito eliminar todo rastro del dominio anterior y tomar como fuente de verdad exclusiva design.md, equirements.md y 	asks.md.
- **Accion**:
    - Eliminadas rutas, features, acciones, SQL y componentes ligados a citas, abogados, booking, proyectos, landing publica y correos del dominio previo.
    - Reescritos entry points (src/app, src/components/layout, src/types/database.ts, src/config/siteConfig.ts, supabase/seed.sql) para orientar la base a modulos retail.
    - Creadas pantallas base para empleados, pdvs, signaciones, sistencias, entas, 
omina, eportes y configuracion.
- **Estado**: Repositorio depurado del dominio legado a nivel de estructura y semantica visible. Pendiente siguiente fase de implementacion funcional sobre esquema retail real.

## [2026-03-14 14:42] - Sintesis arquitectonica y bloqueos de negocio (Codex)
- **Contexto**: Consolidacion de arquitectura objetivo y orden de implementacion tomando como verdad design.md, equirements.md y 	asks.md.
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
    - Creada migracion supabase/migrations/20260314_1605_auth_claims_sync.sql para sincronizar ol, empleado_id, cuenta_cliente_id y estado_cuenta hacia uth.users.
    - Creada migracion supabase/migrations/20260314_1535_fase1_asignaciones_base.sql para la tabla signacion con RLS base.
    - Implementadas vistas funcionales de empleados, pdvs y signaciones con lectura desde Supabase y manejo de infraestructura no migrada.
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

