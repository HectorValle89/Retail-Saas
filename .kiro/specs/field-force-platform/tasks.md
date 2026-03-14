# Tasks: Field Force Platform

## Fase 0 — Fundación

- [ ] 0.1 Inicializar proyecto Next.js 16 con App Router, TypeScript strict, Tailwind CSS y shadcn/ui
  - [ ] 0.1.1 Crear proyecto con `create-next-app` usando flags `--typescript --tailwind --app`
  - [ ] 0.1.2 Configurar `tsconfig.json` con `strict: true` y path aliases `@/`
  - [ ] 0.1.3 Instalar y configurar shadcn/ui con tema personalizado be te ele (`#1A7FD4`, `#8A9BA8`, `#0A0A0A`)
  - [ ] 0.1.4 Configurar ESLint + Prettier con reglas de proyecto
  - [ ] 0.1.5 Configurar estructura Feature-First: `src/features/{feature}/`, `src/shared/`, `src/app/`

- [ ] 0.2 Configurar Supabase (proyecto, variables de entorno, cliente)
  - [ ] 0.2.1 Crear proyecto Supabase y obtener `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] 0.2.2 Instalar `@supabase/supabase-js` y `@supabase/ssr`
  - [ ] 0.2.3 Crear cliente Supabase para Server Components (`createServerClient`) y Client Components (`createBrowserClient`)
  - [ ] 0.2.4 Configurar middleware de sesión en `middleware.ts`

- [ ] 0.3 Crear esquema de base de datos completo (migración inicial)
  - [ ] 0.3.1 Tablas de estructura maestra: `cuenta_cliente`, `usuario`, `empleado`, `pdv`, `geocerca_pdv`
  - [ ] 0.3.2 Tablas de catálogos: `producto`, `cadena`, `ciudad`, `horario_pdv`, `supervisor_pdv`
  - [ ] 0.3.3 Tablas de planeación: `asignacion`, `ruta_semanal`, `campana`, `campana_pdv`, `formacion`
  - [ ] 0.3.4 Tablas de ejecución: `asistencia`, `venta`, `venta_detalle`, `love_isdin`, `solicitud`, `entrega_material`
  - [ ] 0.3.5 Tablas de control: `nomina_periodo`, `nomina_empleado`, `ledger`, `cuota`, `gasto`, `mensaje`, `mensaje_destinatario`
  - [ ] 0.3.6 Tablas de auditoría: `audit_log` (append-only), `archivo_hash`
  - [ ] 0.3.7 Tablas de configuración: `configuracion`, `regla_negocio`, `mision_dia`, `tarea_visita`
  - [ ] 0.3.8 Índices de rendimiento en columnas de filtro frecuente (`cuenta_cliente_id`, `empleado_id`, `pdv_id`, `fecha`)
  - [ ] 0.3.9 Vista materializada `dashboard_kpis` con función de refresco

- [ ] 0.4 Configurar Row-Level Security (RLS) base
  - [ ] 0.4.1 Habilitar RLS en todas las tablas
  - [ ] 0.4.2 Política de aislamiento multi-tenant: todas las tablas filtran por `cuenta_cliente_id = auth.jwt()->>'cuenta_cliente_id'`
  - [ ] 0.4.3 Políticas por rol derivadas de `puesto` en JWT claims
  - [ ] 0.4.4 Política restrictiva en `audit_log`: solo INSERT, sin UPDATE ni DELETE para ningún rol
  - [ ] 0.4.5 Política de `archivo_hash`: INSERT + SELECT, sin UPDATE ni DELETE

- [ ] 0.5 Trigger append-only + SHA-256 para `audit_log`
  - [ ] 0.5.1 Función PostgreSQL que calcula SHA-256 del payload JSON del evento
  - [ ] 0.5.2 Trigger `AFTER INSERT OR UPDATE OR DELETE` en tablas críticas que inserta en `audit_log`
  - [ ] 0.5.3 Verificar que UPDATE y DELETE en `audit_log` lanzan excepción

- [ ] 0.6 Seed data inicial
  - [ ] 0.6.1 Productos ISDIN (catálogo base)
  - [ ] 0.6.2 Cadenas de farmacias (San Pablo, Benavides, Guadalajara, etc.)
  - [ ] 0.6.3 Ciudades y zonas geográficas
  - [ ] 0.6.4 Horarios tipo (San Pablo: 9-18h, etc.)
  - [ ] 0.6.5 Catálogo de Misiones del Día (≥20 instrucciones físicas variadas)
  - [ ] 0.6.6 Cuenta cliente demo `be_te_ele_demo` para desarrollo

## Fase 1 — Auth y Gestión de Usuarios

- [ ] 1.1 Configurar Supabase Auth con derivación de rol desde `puesto`
  - [ ] 1.1.1 Configurar hook `auth.users` → `usuario` con trigger que copia `puesto` a JWT custom claims
  - [ ] 1.1.2 Función `get_my_role()` que lee `puesto` desde JWT claims
  - [ ] 1.1.3 Invalidación de sesión en ≤5 min al cambiar `puesto`: función que revoca tokens activos del usuario
  - [ ] 1.1.4 Configurar `SUPABASE_JWT_SECRET` y claims personalizados: `rol`, `cuenta_cliente_id`, `empleado_id`

- [ ] 1.2 Flujo de activación de cuenta (Req 10)
  - [ ] 1.2.1 Estado inicial `PROVISIONAL` al crear usuario desde Reclutamiento
  - [ ] 1.2.2 Envío de email de verificación con link firmado (Supabase Auth)
  - [ ] 1.2.3 Transición `PROVISIONAL → PENDIENTE_VERIFICACION_EMAIL` al enviar invitación
  - [ ] 1.2.4 Transición `PENDIENTE_VERIFICACION_EMAIL → ACTIVA` al confirmar email
  - [ ] 1.2.5 Bloqueo de acceso para estados `PROVISIONAL`, `SUSPENDIDA`, `BAJA`
  - [ ] 1.2.6 UI de activación: pantalla de bienvenida + creación de contraseña

- [ ] 1.3 Módulo 19 — Usuarios (ADMINISTRADOR)
  - [ ] 1.3.1 Listado de usuarios con filtros por estado, rol, cuenta cliente
  - [ ] 1.3.2 Crear usuario (vinculado a empleado existente)
  - [ ] 1.3.3 Cambiar `puesto` con confirmación + log en `audit_log`
  - [ ] 1.3.4 Suspender / reactivar cuenta
  - [ ] 1.3.5 Resetear contraseña (envía email de recuperación)
  - [ ] 1.3.6 Vista de sesiones activas del usuario

- [ ] 1.4 Módulo 3 — Empleados (RECLUTAMIENTO)
  - [ ] 1.4.1 Listado de empleados con búsqueda y filtros (estado, zona, supervisor)
  - [ ] 1.4.2 Formulario de alta de empleado con campos obligatorios (nombre, CURP, NSS, RFC, puesto, zona)
  - [ ] 1.4.3 OCR+IA para extracción de datos de documentos (proveedor configurable via `OCR_PROVIDER` env var)
  - [ ] 1.4.4 Carga de documentos del expediente con compresión automática (imágenes ≤100KB, PDFs optimizados)
  - [ ] 1.4.5 Deduplicación de archivos por SHA-256 antes de subir a Storage
  - [ ] 1.4.6 Flujo de alta IMSS (campos requeridos + estado de trámite)
  - [ ] 1.4.7 Baja de empleado con fecha efectiva y motivo
  - [ ] 1.4.8 Vista de expediente completo (solo RECLUTAMIENTO y ADMINISTRADOR)

## Fase 2 — Estructura Maestra

- [ ] 2.1 Módulo 2 — PDVs con geocercas
  - [ ] 2.1.1 Listado de PDVs con mapa (Leaflet/Mapbox) y filtros por cadena, ciudad, zona
  - [ ] 2.1.2 Crear/editar PDV: nombre, dirección, coordenadas GPS, cadena, horario, supervisor asignado
  - [ ] 2.1.3 Configurar geocerca por PDV: radio en metros (default 150m, configurable)
  - [ ] 2.1.4 Validación de coordenadas: latitud/longitud válidas, no duplicadas
  - [ ] 2.1.5 Asignación de horario al PDV (herencia desde cadena o personalizado)
  - [ ] 2.1.6 Vista de PDV con historial de asignaciones y asistencias

- [ ] 2.2 Módulo 16 — Configuración (catálogos y parámetros)
  - [ ] 2.2.1 CRUD de catálogos: productos, cadenas, ciudades, horarios
  - [ ] 2.2.2 Parámetros globales: radio geocerca default, umbral biometría, tiempo máximo check-in, etc.
  - [ ] 2.2.3 Gestión de Catálogo de Misiones del Día (ADMINISTRADOR)
  - [ ] 2.2.4 Configuración de proveedor OCR+IA (env var `OCR_PROVIDER`: `codex` | `gemini` | `antigravity`)
  - [ ] 2.2.5 Configuración de retención de archivos por tipo (días mínimos)
  - [ ] 2.2.6 Parámetros de nómina: días de pago, periodos, deducciones base

- [ ] 2.3 Módulo 17 — Reglas de negocio
  - [ ] 2.3.1 Motor de reglas: tabla `regla_negocio` con tipo, condición, acción, prioridad
  - [ ] 2.3.2 Reglas de herencia de supervisor (PDV → Empleado → Asignación)
  - [ ] 2.3.3 Reglas de prioridad de horarios (PDV > Cadena > Global)
  - [ ] 2.3.4 Reglas de flujo de aprobación por tipo de solicitud
  - [ ] 2.3.5 UI de gestión de reglas (solo ADMINISTRADOR): activar/desactivar, editar parámetros
  - [ ] 2.3.6 Log de cambios en reglas en `audit_log`

- [ ] 2.4 Multi-tenancy: aislamiento por `cuenta_cliente_id`
  - [ ] 2.4.1 Middleware que inyecta `cuenta_cliente_id` en todas las queries del servidor
  - [ ] 2.4.2 Verificar que RLS bloquea acceso cruzado entre cuentas cliente en tests de integración
  - [ ] 2.4.3 UI de selección de cuenta cliente para ADMINISTRADOR con acceso multi-cuenta
  - [ ] 2.4.4 Tabla `cliente_pdv` para asignación de PDVs visibles por rol CLIENTE

## Fase 3 — Planeación Operativa

- [ ] 3.1 Módulo 5 — Asignaciones + Assignment Validation Service (Req 14)
  - [ ] 3.1.1 Formulario de asignación: empleado, PDV, fecha inicio, fecha fin, horario
  - [ ] 3.1.2 Assignment Validation Service: ejecutar las 19 reglas de validación antes de guardar
    - [ ] 3.1.2.1 ERRORes bloqueantes (ej. empleado sin geocerca, PDV sin coordenadas, solapamiento de horario)
    - [ ] 3.1.2.2 ALERTAs con confirmación requerida (ej. distancia >50km, cambio de zona)
    - [ ] 3.1.2.3 AVISOs informativos (ej. primera asignación en PDV, cambio de supervisor)
    - [ ] 3.1.2.4 Alertas live en dashboard (geocerca <50m o >300m durante jornada activa)
  - [ ] 3.1.3 Listado de asignaciones con filtros por empleado, PDV, fecha, estado
  - [ ] 3.1.4 Publicación de asignaciones (estado `BORRADOR → PUBLICADA`)
  - [ ] 3.1.5 Historial de cambios de asignación en `audit_log`
  - [ ] 3.1.6 Vista de asignaciones del día para SUPERVISOR y COORDINADOR

- [ ] 3.2 Módulo 10 — Ruta Semanal
  - [ ] 3.2.1 Crear ruta semanal para SUPERVISOR: lista ordenada de PDVs por día
  - [ ] 3.2.2 Validar que PDVs de la ruta tienen asignaciones activas
  - [ ] 3.2.3 Vista de ruta en mapa con orden de visitas
  - [ ] 3.2.4 Marcar visita como completada con evidencia opcional

- [ ] 3.3 Módulo 6 — Campañas
  - [ ] 3.3.1 Crear campaña: nombre, fechas, PDVs objetivo, tareas requeridas
  - [ ] 3.3.2 Asignar tareas de campaña a PDVs específicos
  - [ ] 3.3.3 Seguimiento de cumplimiento de tareas por DC y PDV
  - [ ] 3.3.4 Reporte de avance de campaña

- [ ] 3.4 Módulo 9 — Formaciones
  - [ ] 3.4.1 Crear evento de formación: fecha, lugar, participantes, tipo
  - [ ] 3.4.2 Registro de asistencia a formación
  - [ ] 3.4.3 Impacto en gastos operativos (viáticos, transporte)
  - [ ] 3.4.4 Notificación a participantes

## Fase 4 — Ejecución Diaria (PWA Móvil)

- [ ] 4.1 PWA móvil: configuración base
  - [ ] 4.1.1 Configurar `next-pwa` o manifest + Service Worker manual
  - [ ] 4.1.2 Manifest con íconos, colores be te ele, `display: standalone`
  - [ ] 4.1.3 Estrategias de caché por tipo: `CacheFirst` para assets estáticos, `NetworkFirst` para datos operativos, `StaleWhileRevalidate` para catálogos
  - [ ] 4.1.4 Vistas compactas móviles con Tailwind (breakpoints `sm:` como base)
  - [ ] 4.1.5 Instalación guiada (banner "Agregar a pantalla de inicio")

- [ ] 4.2 Offline-first con IndexedDB + sync queue
  - [ ] 4.2.1 Instalar y configurar `idb` o `Dexie.js` para IndexedDB
  - [ ] 4.2.2 Esquema local: tablas `asistencia_local`, `venta_local`, `love_local`, `sync_queue`
  - [ ] 4.2.3 Cola de sincronización: cada operación offline se encola con timestamp y tipo
  - [ ] 4.2.4 Worker de sync: al reconectar, procesa cola en orden cronológico con reintentos
  - [ ] 4.2.5 Resolución de conflictos: `server_wins` para datos de control, `client_wins` para capturas de campo
  - [ ] 4.2.6 Indicador visual de estado de conexión y pendientes de sync

- [ ] 4.3 Módulo 11 — Asistencias (check-in/out GPS + biometría + Misión del Día)
  - [ ] 4.3.1 Pantalla de check-in: mostrar Misión del Día aleatoria del catálogo
  - [ ] 4.3.2 Captura de selfie con cámara nativa (Web API `getUserMedia`)
  - [ ] 4.3.3 Compresión de imagen en cliente antes de subir: canvas resize + JPEG quality 0.7 → objetivo ≤100KB
  - [ ] 4.3.4 Validación GPS: obtener coordenadas, comparar con geocerca del PDV asignado
    - [ ] 4.3.4.1 Dentro de geocerca (50m–300m): check-in permitido
    - [ ] 4.3.4.2 <50m o >300m: ALERTA visible, check-in permitido con justificación
    - [ ] 4.3.4.3 Sin GPS: bloquear check-in con mensaje de error
  - [ ] 4.3.5 Validación biométrica: enviar selfie + foto de referencia a API configurable (AWS Rekognition / Azure Face)
  - [ ] 4.3.6 Registro de check-in: timestamp, coordenadas, foto comprimida, resultado biométrico, misión completada
  - [ ] 4.3.7 Pantalla de jornada activa: Tareas de Visita del día
  - [ ] 4.3.8 Tareas de Visita: foto de anaquel, conteo de inventario, encuesta, registro de precio
    - [ ] 4.3.8.1 Compresión de fotos de evidencia ≤100KB
    - [ ] 4.3.8.2 Miniatura generada para listados (≤20KB)
  - [ ] 4.3.9 Check-out: requiere confirmación de ventas registradas; captura coordenadas de salida
  - [ ] 4.3.10 Registro de faltas, retardos y ausencias justificadas
  - [ ] 4.3.11 Dashboard de asistencias para SUPERVISOR: mapa en tiempo real (latencia ≤120s)

- [ ] 4.4 Módulo 21 — Ventas
  - [ ] 4.4.1 Formulario de venta: producto, cantidad, precio, PDV, fecha
  - [ ] 4.4.2 Validación: solo durante jornada activa (check-in realizado, check-out no hecho)
  - [ ] 4.4.3 Listado de ventas del día con totales
  - [ ] 4.4.4 Sync offline: ventas capturadas sin conexión se sincronizan al reconectar
  - [ ] 4.4.5 Dashboard de ventas en tiempo real para SUPERVISOR/COORDINADOR (latencia ≤60s via Supabase Realtime)
  - [ ] 4.4.6 Validación de cuota diaria: indicador visual de avance vs. cuota

- [ ] 4.5 Módulo 22 — LOVE ISDIN
  - [ ] 4.5.1 Escaneo de QR personal del cliente en PDV
  - [ ] 4.5.2 Registro de afiliación: datos del cliente, PDV, DC, fecha, evidencia fotográfica
  - [ ] 4.5.3 Compresión de foto de evidencia ≤100KB
  - [ ] 4.5.4 Validación antifraude: un QR no puede registrarse dos veces en el mismo periodo
  - [ ] 4.5.5 Contador de afiliaciones del día para el DC
  - [ ] 4.5.6 Sync offline para afiliaciones capturadas sin conexión

## Fase 5 — Control y Validación

- [ ] 5.1 Módulo 12 — Solicitudes (incapacidades, vacaciones, permisos)
  - [ ] 5.1.1 Formulario de solicitud: tipo (incapacidad / vacaciones / permiso), fechas, justificante
  - [ ] 5.1.2 Carga de documento justificante con compresión automática (PDF optimizado, imagen ≤100KB)
  - [ ] 5.1.3 Deduplicación de justificantes por SHA-256
  - [ ] 5.1.4 Flujo de aprobación: SUPERVISOR (primer nivel) → COORDINADOR (segundo nivel)
  - [ ] 5.1.5 Estados: `PENDIENTE → APROBADA | RECHAZADA`
  - [ ] 5.1.6 Notificación al DC del resultado de su solicitud
  - [ ] 5.1.7 Impacto en asistencia: días justificados no generan falta, pero NO eximen cuotas
  - [ ] 5.1.8 Vista de solicitudes pendientes para SUPERVISOR y COORDINADOR

- [ ] 5.2 Módulo 4 — Nómina (Motor Nómina + Ledger + cierre de periodos)
  - [ ] 5.2.1 Configuración de periodos de nómina (quincenal / mensual)
  - [ ] 5.2.2 Motor de Nómina: calcular salario base + deducciones + bonos por periodo
    - [ ] 5.2.2.1 Consumir asistencias validadas del periodo
    - [ ] 5.2.2.2 Aplicar deducciones por faltas no justificadas
    - [ ] 5.2.2.3 Aplicar bonos de ventas y LOVE ISDIN según cuotas alcanzadas
    - [ ] 5.2.2.4 Calcular IMSS, ISR y otras deducciones legales
  - [ ] 5.2.3 Pre-nómina: vista de revisión antes de cierre (NÓMINA)
  - [ ] 5.2.4 Ledger: registro inmutable de cada movimiento de nómina con timestamp y autor
  - [ ] 5.2.5 Cierre de periodo: estado `ABIERTO → CERRADO`; bloquea modificaciones retroactivas
  - [ ] 5.2.6 Exportación de nómina en CSV/XLSX para dispersión bancaria
  - [ ] 5.2.7 Historial de periodos cerrados con totales por empleado

- [ ] 5.3 Motor de Cuotas (Req 8)
  - [ ] 5.3.1 Asignación de cuota mensual por DC: ventas + LOVE ISDIN
  - [ ] 5.3.2 Distribución proporcional por días hábiles del periodo
  - [ ] 5.3.3 Invariante de cuota: suma de cuotas individuales = cuota total del equipo
  - [ ] 5.3.4 Cuota NO se redistribuye por incapacidades ni vacaciones (Req 8 confirmado)
  - [ ] 5.3.5 Indicador de avance de cuota en tiempo real para DC y SUPERVISOR
  - [ ] 5.3.6 Alerta cuando DC alcanza 80% y 100% de cuota

- [ ] 5.4 Módulo 7 — Entrega de Material
  - [ ] 5.4.1 Registro de entrega: empleado, PDV, material, cantidad, fecha, supervisor que entrega
  - [ ] 5.4.2 Firma de recepción (foto o firma digital)
  - [ ] 5.4.3 Compresión de evidencia ≤100KB
  - [ ] 5.4.4 Historial de entregas por empleado y por PDV
  - [ ] 5.4.5 Reporte de inventario entregado vs. pendiente

- [ ] 5.5 Módulo 8 — Gastos (solo roles con acceso: no DERMOCONSEJERO)
  - [ ] 5.5.1 Formulario de gasto: tipo, monto, fecha, comprobante, PDV/formación relacionada
  - [ ] 5.5.2 Carga de comprobante con compresión automática
  - [ ] 5.5.3 Flujo de aprobación: SUPERVISOR → COORDINADOR
  - [ ] 5.5.4 Reporte de gastos por periodo, zona y tipo
  - [ ] 5.5.5 Integración con Nómina para reembolsos aprobados

## Fase 6 — Análisis y Gobierno

- [ ] 6.1 Módulo 1 — Dashboard (KPIs agregados, mapa, Realtime)
  - [ ] 6.1.1 KPIs principales: DCs activos hoy, ventas del día, afiliaciones LOVE, asistencia %
  - [ ] 6.1.2 Consumir vista materializada `dashboard_kpis` (no recalcular en cada render)
  - [ ] 6.1.3 Mapa de promotores activos con posición en tiempo real (Supabase Realtime, latencia ≤120s)
  - [ ] 6.1.4 Gráficas de tendencia: ventas semana/mes, asistencia semana/mes
  - [ ] 6.1.5 Caché de KPIs: TTL 5 minutos para datos agregados no sensibles
  - [ ] 6.1.6 Carga diferida: KPIs primero, mapa y gráficas después (skeleton loaders)
  - [ ] 6.1.7 Filtros por zona, supervisor, periodo (ejecutar query solo al aplicar filtro)

- [ ] 6.2 Módulo 13 — Reportes
  - [ ] 6.2.1 Reporte de asistencias: por empleado, PDV, periodo, con exportación CSV
  - [ ] 6.2.2 Reporte de ventas: por producto, PDV, DC, periodo, con exportación CSV
  - [ ] 6.2.3 Reporte de LOVE ISDIN: afiliaciones por DC, PDV, periodo
  - [ ] 6.2.4 Reporte de nómina: resumen por empleado y periodo
  - [ ] 6.2.5 Reporte de gastos: por tipo, zona, periodo
  - [ ] 6.2.6 Reporte de cumplimiento de campañas
  - [ ] 6.2.7 Paginación en todos los reportes (máx. 100 filas por página)
  - [ ] 6.2.8 Filtros obligatorios antes de ejecutar queries pesadas (periodo mínimo requerido)
  - [ ] 6.2.9 Exportación a CSV/XLSX sin cargar todo en memoria (streaming)

- [ ] 6.3 Módulo 18 — Bitácora / Caja Negra (ADMINISTRADOR)
  - [ ] 6.3.1 Vista de `audit_log` con filtros: usuario, módulo, acción, fecha
  - [ ] 6.3.2 Verificación de integridad: recalcular SHA-256 y comparar con hash almacenado
  - [ ] 6.3.3 Exportación de bitácora para auditoría externa
  - [ ] 6.3.4 Paginación (máx. 50 registros por página, carga incremental)
  - [ ] 6.3.5 Sin caché: datos de auditoría siempre frescos desde BD

- [ ] 6.4 Módulo 20 — Ranking
  - [ ] 6.4.1 Ranking de ventas: top DCs por periodo (semana/mes/acumulado)
  - [ ] 6.4.2 Ranking de LOVE ISDIN: top DCs por afiliaciones
  - [ ] 6.4.3 Ranking por zona y supervisor
  - [ ] 6.4.4 Caché de ranking: TTL 15 minutos (datos agregados no sensibles)
  - [ ] 6.4.5 Vista compacta para móvil

- [ ] 6.5 Módulo 14 — Mensajes
  - [ ] 6.5.1 Mensajes internos por grupos: zona, supervisor, todos los DCs
  - [ ] 6.5.2 Notificaciones push via Supabase Edge Functions
  - [ ] 6.5.3 Encuestas operativas con opciones de respuesta
  - [ ] 6.5.4 Historial de mensajes paginado (no cargar todo el histórico)
  - [ ] 6.5.5 Indicador de mensajes no leídos en tiempo real (Supabase Realtime)

## Fase 7 — Optimización y Calidad

- [ ] 7.1 Pipeline de compresión de imágenes (cliente)
  - [ ] 7.1.1 Utilidad `compressImage(file, maxKB = 100)`: canvas resize + JPEG quality adaptativo
  - [ ] 7.1.2 Generación de miniatura `generateThumbnail(file, maxKB = 20)` para listados
  - [ ] 7.1.3 Eliminar metadatos EXIF antes de subir (privacidad + peso)
  - [ ] 7.1.4 Aplicar en: check-in selfie, tareas de visita, LOVE ISDIN, entrega de material, gastos, solicitudes
  - [ ] 7.1.5 No guardar original si la versión comprimida es suficiente para auditoría

- [ ] 7.2 Pipeline de compresión de PDFs (servidor)
  - [ ] 7.2.1 Función serverless que recibe PDF y devuelve versión optimizada (ghostscript o similar)
  - [ ] 7.2.2 Optimizar imágenes internas del PDF
  - [ ] 7.2.3 Aplicar en: justificantes de incapacidad, documentos de expediente, comprobantes de gasto
  - [ ] 7.2.4 Mantener legibilidad de texto y documentos oficiales

- [ ] 7.3 Deduplicación de archivos por SHA-256
  - [ ] 7.3.1 Antes de subir a Storage: calcular SHA-256 del archivo
  - [ ] 7.3.2 Consultar tabla `archivo_hash`: si existe, reutilizar URL existente sin subir
  - [ ] 7.3.3 Si no existe: subir, guardar hash + URL en `archivo_hash`
  - [ ] 7.3.4 Aplicar en todos los módulos que suben archivos

- [ ] 7.4 Estrategia de caché por tipo de dato
  - [ ] 7.4.1 Caché de catálogos (productos, cadenas, ciudades): TTL 1 hora, `stale-while-revalidate`
  - [ ] 7.4.2 Caché de KPIs del dashboard: TTL 5 minutos
  - [ ] 7.4.3 Caché de ranking: TTL 15 minutos
  - [ ] 7.4.4 Caché de asignaciones publicadas: TTL 30 minutos
  - [ ] 7.4.5 Sin caché persistente para: expedientes, nómina, datos personales sensibles, bitácora
  - [ ] 7.4.6 Implementar con `unstable_cache` de Next.js o React Query con `staleTime` configurado

- [ ] 7.5 Optimización de consultas
  - [ ] 7.5.1 Auditar todas las queries: seleccionar solo columnas necesarias (no `SELECT *`)
  - [ ] 7.5.2 Paginación en todos los listados (cursor-based o offset, máx. 50 filas por defecto)
  - [ ] 7.5.3 Lazy loading de imágenes en tablas (mostrar miniatura, cargar original al abrir detalle)
  - [ ] 7.5.4 Prefetch solo en rutas de alta probabilidad de navegación
  - [ ] 7.5.5 Evitar N+1: usar joins o batch queries en lugar de queries en bucle
  - [ ] 7.5.6 Refresco de vista materializada `dashboard_kpis` solo al cerrar asistencias o ventas

- [ ] 7.6 Service Worker y estrategias de red
  - [ ] 7.6.1 `CacheFirst` para assets estáticos (JS, CSS, fuentes, íconos)
  - [ ] 7.6.2 `NetworkFirst` con fallback offline para datos operativos críticos
  - [ ] 7.6.3 `StaleWhileRevalidate` para catálogos y configuración
  - [ ] 7.6.4 No polling automático en pantallas pesadas; usar Supabase Realtime solo donde se necesita
  - [ ] 7.6.5 No descargar documentos pesados automáticamente; preview ligero primero

- [ ] 7.7 Job de limpieza de archivos huérfanos
  - [ ] 7.7.1 Supabase Edge Function programada (cron diario)
  - [ ] 7.7.2 Detectar archivos en Storage sin referencia válida en ninguna tabla
  - [ ] 7.7.3 Mover a carpeta `_orphans/` con TTL de 30 días antes de eliminar definitivamente
  - [ ] 7.7.4 Log de archivos eliminados en `audit_log`

- [ ] 7.8 Property-based tests con fast-check (63 propiedades de corrección)
  - [ ] 7.8.1 Instalar `fast-check` y configurar con Vitest
  - [ ] 7.8.2 Propiedades del Motor de Nómina (Req 4): invariantes de cálculo, no negatividad, idempotencia
  - [ ] 7.8.3 Propiedades del Motor de Cuotas (Req 8): suma = total equipo, distribución proporcional
  - [ ] 7.8.4 Propiedades de Asistencias (Req 1–2): check-in antes de check-out, no solapamiento
  - [ ] 7.8.5 Propiedades de Validación de Asignaciones (Req 14): 19 reglas como propiedades ejecutables
  - [ ] 7.8.6 Propiedades de Auditoría (Req 7): append-only, hash consistente, no tampering
  - [ ] 7.8.7 Propiedades de Multi-tenancy (Req 15): aislamiento total entre cuentas cliente
  - [ ] 7.8.8 Propiedades de Offline Sync (Req 9): orden cronológico, idempotencia, sin pérdida de datos

- [ ] 7.9 Tests de integración de flujos críticos
  - [ ] 7.9.1 Flujo completo check-in → jornada → ventas → check-out
  - [ ] 7.9.2 Flujo de activación de cuenta (PROVISIONAL → ACTIVA)
  - [ ] 7.9.3 Flujo de solicitud de incapacidad con aprobación en dos niveles
  - [ ] 7.9.4 Flujo de cierre de nómina con Ledger
  - [ ] 7.9.5 Flujo de asignación con Assignment Validation Service (ERRORes + ALERTAs)
  - [ ] 7.9.6 Verificar aislamiento RLS entre dos cuentas cliente distintas
