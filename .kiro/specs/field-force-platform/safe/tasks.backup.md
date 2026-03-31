# Tasks: Field Force Platform

## Fase 0 — Fundación

- [x] Inicializar proyecto Next.js 16 con App Router, TypeScript strict, Tailwind CSS y shadcn/ui
  - [ ] 0.1.1 Crear proyecto con `create-next-app` usando flags `--typescript --tailwind --app`
  - [ ] 0.1.2 Configurar `tsconfig.json` con `strict: true` y path aliases `@/`
  - [ ] 0.1.3 Instalar y configurar shadcn/ui con tema personalizado be te ele (`#1A7FD4`, `#8A9BA8`, `#0A0A0A`)
  - [ ] 0.1.4 Configurar ESLint + Prettier con reglas de proyecto
  - [ ] 0.1.5 Configurar estructura Feature-First: `src/features/{feature}/`, `src/shared/`, `src/app/`

- [x] Configurar Supabase (proyecto, variables de entorno, cliente)
  - [ ] 0.2.1 Crear proyecto Supabase y obtener `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] 0.2.2 Instalar `@supabase/supabase-js` y `@supabase/ssr`
  - [ ] 0.2.3 Crear cliente Supabase para Server Components (`createServerClient`) y Client Components (`createBrowserClient`)
  - [ ] 0.2.4 Configurar middleware de sesión en `middleware.ts`

- [x] Crear esquema de base de datos completo (migración inicial)
  - [x] Tablas de estructura maestra: `cuenta_cliente`, `usuario`, `empleado`, `pdv`, `geocerca_pdv`
  - [x] Tablas de catálogos: `producto`, `cadena`, `ciudad`, `horario_pdv`, `supervisor_pdv`
  - [x] Tablas de planeación: `asignacion`, `ruta_semanal`, `campana`, `campana_pdv`, `formacion`
  - [x] Tablas de ejecución: `asistencia`, `venta`, `venta_detalle`, `love_isdin`, `solicitud`, `entrega_material`
  - [x] Tablas de control: `nomina_periodo`, `nomina_empleado`, `ledger`, `cuota`, `gasto`, `mensaje`, `mensaje_destinatario`
  - [x] Tablas de auditoría: `audit_log` (append-only), `archivo_hash`
  - [x] Tablas de configuración: `configuracion`, `regla_negocio`, `mision_dia`, `tarea_visita`
  - [x] Índices de rendimiento en columnas de filtro frecuente (`cuenta_cliente_id`, `empleado_id`, `pdv_id`, `fecha`)
  - [x] Vista materializada `dashboard_kpis` con función de refresco

- [x] Configurar Row-Level Security (RLS) base
  - [x] Habilitar RLS en todas las tablas
  - [x] Política de aislamiento multi-tenant: todas las tablas filtran por `cuenta_cliente_id = auth.jwt()->>'cuenta_cliente_id'`
  - [x] Políticas por rol derivadas de `puesto` en JWT claims
  - [x] Política restrictiva en `audit_log`: solo INSERT, sin UPDATE ni DELETE para ningún rol
  - [x] Política de `archivo_hash`: INSERT + SELECT, sin UPDATE ni DELETE

- [x] Trigger append-only + SHA-256 para `audit_log`
  - [x] Función PostgreSQL que calcula SHA-256 del payload JSON del evento
  - [x] Trigger `AFTER INSERT OR UPDATE OR DELETE` en tablas críticas que inserta en `audit_log`
  - [x] Verificar que UPDATE y DELETE en `audit_log` lanzan excepción

- [x] Seed data inicial
  - [ ] 0.6.1 Productos ISDIN (catálogo base)
  - [ ] 0.6.2 Cadenas de farmacias (San Pablo, Benavides, Guadalajara, etc.)
  - [ ] 0.6.3 Ciudades y zonas geográficas
  - [ ] 0.6.4 Horarios tipo (San Pablo: 9-18h, etc.)
  - [ ] 0.6.5 Catálogo de Misiones del Día (≥20 instrucciones físicas variadas)
  - [ ] 0.6.6 Cuenta cliente demo `be_te_ele_demo` para desarrollo

## Fase 1 — Auth y Gestión de Usuarios

- [x] Configurar Supabase Auth con derivación de rol desde `puesto`
  - [ ] 1.1.1 Configurar hook `auth.users` → `usuario` con trigger que copia `puesto` a JWT custom claims
  - [ ] 1.1.2 Función `get_my_role()` que lee `puesto` desde JWT claims
  - [ ] 1.1.3 Invalidación de sesión en ≤5 min al cambiar `puesto`: función que revoca tokens activos del usuario
  - [ ] 1.1.4 Configurar `SUPABASE_JWT_SECRET` y claims personalizados: `rol`, `cuenta_cliente_id`, `empleado_id`

- [x] Flujo de activación de cuenta (Req 10)
  - [ ] 1.2.1 Estado inicial `PROVISIONAL` al crear usuario desde Reclutamiento
  - [ ] 1.2.2 Envío de email de verificación con link firmado (Supabase Auth)
  - [ ] 1.2.3 Transición `PROVISIONAL → PENDIENTE_VERIFICACION_EMAIL` al enviar invitación
  - [ ] 1.2.4 Transición `PENDIENTE_VERIFICACION_EMAIL → ACTIVA` al confirmar email
  - [ ] 1.2.5 Bloqueo de acceso para estados `PROVISIONAL`, `SUSPENDIDA`, `BAJA`
  - [ ] 1.2.6 UI de activación: pantalla de bienvenida + creación de contraseña

- [x] Módulo 19 — Usuarios (ADMINISTRADOR)
  - [ ] 1.3.1 Listado de usuarios con filtros por estado, rol, cuenta cliente
  - [ ] 1.3.2 Crear usuario (vinculado a empleado existente)
  - [ ] 1.3.3 Cambiar `puesto` con confirmación + log en `audit_log`
  - [ ] 1.3.4 Suspender / reactivar cuenta
  - [ ] 1.3.5 Resetear contraseña (envía email de recuperación)
  - [ ] 1.3.6 Vista de sesiones activas del usuario

- [x] Módulo 3 — Empleados (RECLUTAMIENTO)
  - [ ] 1.4.1 Listado de empleados con búsqueda y filtros (estado, zona, supervisor)
  - [ ] 1.4.2 Formulario de alta de empleado con campos obligatorios (nombre, CURP, NSS, RFC, puesto, zona)
  - [ ] 1.4.3 OCR+IA para extracción de datos de documentos (proveedor configurable via `OCR_PROVIDER` env var)
  - [ ] 1.4.4 Carga de documentos del expediente con compresión automática (imágenes ≤100KB, PDFs optimizados)
  - [ ] 1.4.5 Deduplicación de archivos por SHA-256 antes de subir a Storage
  - [ ] 1.4.6 Flujo de alta IMSS (campos requeridos + estado de trámite)
  - [ ] 1.4.7 Baja de empleado con fecha efectiva y motivo
  - [ ] 1.4.8 Vista de expediente completo (solo RECLUTAMIENTO y ADMINISTRADOR)

## Fase 2 — Estructura Maestra

- [x] Módulo 2 — PDVs con geocercas
  - [ ] 2.1.1 Listado de PDVs con mapa (Leaflet/Mapbox) y filtros por cadena, ciudad, zona
  - [ ] 2.1.2 Crear/editar PDV: nombre, dirección, coordenadas GPS, cadena, horario, supervisor asignado
  - [ ] 2.1.3 Configurar geocerca por PDV: radio en metros (default 150m, configurable)
  - [ ] 2.1.4 Validación de coordenadas: latitud/longitud válidas, no duplicadas
  - [ ] 2.1.5 Asignación de horario al PDV (herencia desde cadena o personalizado)
  - [ ] 2.1.6 Vista de PDV con historial de asignaciones y asistencias

- [x] Módulo 16 — Configuración (catálogos y parámetros)
  - [ ] 2.2.1 CRUD de catálogos: productos, cadenas, ciudades, horarios
  - [ ] 2.2.2 Parámetros globales: radio geocerca default, umbral biometría, tiempo máximo check-in, etc.
  - [ ] 2.2.3 Gestión de Catálogo de Misiones del Día (ADMINISTRADOR)
  - [ ] 2.2.4 Configuración de proveedor OCR+IA (env var `OCR_PROVIDER`: `codex` | `gemini` | `antigravity`)
  - [ ] 2.2.5 Configuración de retención de archivos por tipo (días mínimos)
  - [ ] 2.2.6 Parámetros de nómina: días de pago, periodos, deducciones base

- [x] Módulo 17 — Reglas de negocio
  - [ ] 2.3.1 Motor de reglas: tabla `regla_negocio` con tipo, condición, acción, prioridad
  - [ ] 2.3.2 Reglas de herencia de supervisor (PDV → Empleado → Asignación)
  - [ ] 2.3.3 Reglas de prioridad de horarios (PDV > Cadena > Global)
  - [ ] 2.3.4 Reglas de flujo de aprobación por tipo de solicitud
  - [ ] 2.3.5 UI de gestión de reglas (solo ADMINISTRADOR): activar/desactivar, editar parámetros
  - [ ] 2.3.6 Log de cambios en reglas en `audit_log`

- [x] Multi-tenancy: aislamiento por `cuenta_cliente_id`
  - [ ] 2.4.1 Middleware que inyecta `cuenta_cliente_id` en todas las queries del servidor
  - [ ] 2.4.2 Verificar que RLS bloquea acceso cruzado entre cuentas cliente en tests de integración
  - [ ] 2.4.3 UI de selección de cuenta cliente para ADMINISTRADOR con acceso multi-cuenta
  - [ ] 2.4.4 Tabla `cliente_pdv` para asignación de PDVs visibles por rol CLIENTE

## Fase 3 — Planeación Operativa

- [x] Módulo 5 — Asignaciones + Assignment Validation Service (Req 14)
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

- [x] Módulo 10 — Ruta Semanal
  - [ ] 3.2.1 Crear ruta semanal para SUPERVISOR: lista ordenada de PDVs por día
  - [ ] 3.2.2 Validar que PDVs de la ruta tienen asignaciones activas
  - [ ] 3.2.3 Vista de ruta en mapa con orden de visitas
  - [ ] 3.2.4 Marcar visita como completada con evidencia opcional

- [x] Módulo 6 — Campañas
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

- [x] PWA móvil: configuración base
  - [ ] 4.1.1 Configurar `next-pwa` o manifest + Service Worker manual
  - [ ] 4.1.2 Manifest con íconos, colores be te ele, `display: standalone`
  - [ ] 4.1.3 Estrategias de caché por tipo: `CacheFirst` para assets estáticos, `NetworkFirst` para datos operativos, `StaleWhileRevalidate` para catálogos
  - [ ] 4.1.4 Vistas compactas móviles con Tailwind (breakpoints `sm:` como base)
  - [ ] 4.1.5 Instalación guiada (banner "Agregar a pantalla de inicio")

- [x] Offline-first con IndexedDB + sync queue
  - [ ] 4.2.1 Instalar y configurar `idb` o `Dexie.js` para IndexedDB
  - [ ] 4.2.2 Esquema local: tablas `asistencia_local`, `venta_local`, `love_local`, `sync_queue`
  - [ ] 4.2.3 Cola de sincronización: cada operación offline se encola con timestamp y tipo
  - [ ] 4.2.4 Worker de sync: al reconectar, procesa cola en orden cronológico con reintentos
  - [ ] 4.2.5 Resolución de conflictos: `server_wins` para datos de control, `client_wins` para capturas de campo
  - [ ] 4.2.6 Indicador visual de estado de conexión y pendientes de sync

- [x] Módulo 11 — Asistencias (check-in/out GPS + biometría + Misión del Día)
  - [x] Pantalla de check-in: mostrar Misión del Día aleatoria del catálogo
  - [x] Captura de selfie con cámara nativa (Web API `getUserMedia`)
  - [x] Compresión de imagen en cliente antes de subir: canvas resize + JPEG quality 0.7 → objetivo ≤100KB
  - [x] Validación GPS: obtener coordenadas, comparar con geocerca del PDV asignado
    - [x] Dentro de geocerca (50m–300m): check-in permitido
    - [x] <50m o >300m: ALERTA visible, check-in permitido con justificación
    - [x] Sin GPS: bloquear check-in con mensaje de error
  - [x] Validación biométrica: enviar selfie + foto de referencia a API configurable (AWS Rekognition / Azure Face)
  - [ ] 4.3.6 Registro de check-in: timestamp, coordenadas, foto comprimida, resultado biométrico, misión completada
  - [ ] 4.3.7 Pantalla de jornada activa: Tareas de Visita del día
  - [x] Tareas de Visita: foto de anaquel, conteo de inventario, encuesta, registro de precio
    - [x] Compresión de fotos de evidencia ≤100KB
    - [x] Miniatura generada para listados (≤20KB)
  - [x] Check-out: requiere confirmación de ventas registradas; captura coordenadas de salida
  - [ ] 4.3.10 Registro de faltas, retardos y ausencias justificadas
  - [ ] 4.3.11 Dashboard de asistencias para SUPERVISOR: mapa en tiempo real (latencia ≤120s)

- [x] Módulo 21 — Ventas
  - [ ] 4.4.1 Formulario de venta: producto, cantidad, precio, PDV, fecha
  - [ ] 4.4.2 Validación: solo durante jornada activa (check-in realizado, check-out no hecho)
  - [ ] 4.4.3 Listado de ventas del día con totales
  - [ ] 4.4.4 Sync offline: ventas capturadas sin conexión se sincronizan al reconectar
  - [ ] 4.4.5 Dashboard de ventas en tiempo real para SUPERVISOR/COORDINADOR (latencia ≤60s via Supabase Realtime)
  - [ ] 4.4.6 Validación de cuota diaria: indicador visual de avance vs. cuota

- [x] Módulo 22 — LOVE ISDIN
  - [ ] 4.5.1 Escaneo de QR personal del cliente en PDV
  - [ ] 4.5.2 Registro de afiliación: datos del cliente, PDV, DC, fecha, evidencia fotográfica
  - [ ] 4.5.3 Compresión de foto de evidencia ≤100KB
  - [ ] 4.5.4 Validación antifraude: un QR no puede registrarse dos veces en el mismo periodo
  - [ ] 4.5.5 Contador de afiliaciones del día para el DC
  - [ ] 4.5.6 Sync offline para afiliaciones capturadas sin conexión

## Fase 5 — Control y Validación

- [x] Módulo 12 — Solicitudes (vacaciones, permisos, incapacidades)
  - [ ] 5.1.1 Formulario de solicitud: tipo (vacaciones/permiso/incapacidad), fechas, motivo, documentos adjuntos
  - [ ] 5.1.2 Flujo de aprobación: DERMOCONSEJERO crea → SUPERVISOR valida o rechaza (sin editar)
  - [ ] 5.1.3 Notificación al solicitante del resultado (aprobado/rechazado con motivo)
  - [ ] 5.1.4 Impacto en asistencias: días aprobados no generan falta
  - [ ] 5.1.5 Las vacaciones e incapacidades NO eximen al DC de sus cuotas (cuotas se mantienen)
  - [ ] 5.1.6 Listado de solicitudes con filtros por tipo, estado, empleado, fecha
  - [ ] 5.1.7 Vista de calendario de ausencias para SUPERVISOR y COORDINADOR

- [x] Módulo 13 — Nómina + Ledger
  - [ ] 5.2.1 Generación de periodo de nómina: fechas, empleados incluidos, corte de asistencias
  - [ ] 5.2.2 Cálculo de percepciones: sueldo base, bonos, comisiones por ventas
  - [ ] 5.2.3 Cálculo de deducciones: faltas, retardos, IMSS, ISR
  - [ ] 5.2.4 Ledger de movimientos: cada ajuste manual genera entrada en `ledger` con motivo y autor
  - [ ] 5.2.5 Aprobación de nómina: ADMINISTRADOR revisa y aprueba antes de dispersión
  - [ ] 5.2.6 Exportación de nómina a CSV/XLSX para dispersión bancaria
  - [ ] 5.2.7 Historial de periodos de nómina con estado (borrador/aprobado/dispersado)
  - [ ] 5.2.8 Vista de recibo de nómina por empleado (solo lectura para el propio empleado)

- [x] Módulo 14 — Motor de Cuotas
  - [ ] 5.3.1 Definición de cuotas por empleado/periodo: ventas, afiliaciones LOVE, visitas
  - [ ] 5.3.2 Cálculo de avance en tiempo real: ventas registradas vs. cuota del periodo
  - [ ] 5.3.3 Indicador visual de cumplimiento: semáforo (rojo <70%, amarillo 70–99%, verde ≥100%)
  - [ ] 5.3.4 Cuotas no se reducen por vacaciones o incapacidades (regla de negocio irrompible)
  - [ ] 5.3.5 Ranking de cumplimiento de cuotas por zona/región (visible para SUPERVISOR y COORDINADOR)
  - [ ] 5.3.6 Alerta automática cuando DC lleva <70% de cuota a mitad del periodo

- [x] Módulo 15 — Entrega de Material
  - [ ] 5.4.1 Registro de entrega: empleado, material, cantidad, fecha, responsable de entrega
  - [ ] 5.4.2 Firma digital de recepción (canvas en móvil o checkbox de confirmación)
  - [ ] 5.4.3 Inventario de materiales disponibles por almacén/zona
  - [ ] 5.4.4 Historial de entregas por empleado
  - [ ] 5.4.5 Alerta de stock bajo (umbral configurable en Módulo 16)

- [x] Módulo 20 — Gastos (solo COORDINADOR y ADMINISTRADOR; DERMOCONSEJERO sin acceso)
  - [ ] 5.5.1 Registro de gasto: tipo, monto, fecha, comprobante fotográfico, empleado asociado
  - [ ] 5.5.2 Compresión de comprobante ≤100KB antes de subir
  - [ ] 5.5.3 Flujo de aprobación: COORDINADOR registra → ADMINISTRADOR aprueba
  - [ ] 5.5.4 Categorías de gasto: viáticos, transporte, materiales, formaciones, otros
  - [ ] 5.5.5 Reporte de gastos por periodo, categoría y empleado
  - [ ] 5.5.6 Integración con nómina: gastos aprobados se reflejan en ledger del empleado

## Fase 6 — Análisis y Gobierno

- [x] Módulo 1 — Dashboard principal (KPIs en tiempo real)
  - [ ] 6.1.1 Vista de KPIs globales: asistencias del día, ventas totales, afiliaciones LOVE, cumplimiento de cuotas
  - [ ] 6.1.2 Mapa en tiempo real de DCs activos con estado de geocerca (latencia ≤120s)
  - [ ] 6.1.3 Alertas live: geocerca fuera de rango, check-ins tardíos, ventas por debajo de cuota
  - [ ] 6.1.4 Widgets configurables por rol (SUPERVISOR ve su zona, COORDINADOR ve todo)
  - [ ] 6.1.5 Refresco automático de vista materializada `dashboard_kpis` cada 60s
  - [ ] 6.1.6 Vista compacta móvil del dashboard para SUPERVISOR en campo

- [x] Módulo 7 — Reportes
  - [ ] 6.2.1 Reporte de asistencias: por empleado, PDV, periodo, con exportación CSV/XLSX
  - [ ] 6.2.2 Reporte de ventas: por producto, PDV, empleado, periodo, con gráficas
  - [ ] 6.2.3 Reporte de cumplimiento de cuotas: avance vs. meta por empleado y zona
  - [ ] 6.2.4 Reporte de afiliaciones LOVE ISDIN: por DC, PDV, periodo
  - [ ] 6.2.5 Reporte de gastos: por categoría, empleado, periodo
  - [ ] 6.2.6 Reporte de campañas: cumplimiento de tareas por PDV
  - [ ] 6.2.7 Exportación de todos los reportes a PDF con logo be te ele
  - [ ] 6.2.8 Programación de reportes automáticos (semanal/mensual) por email

- [x] Módulo 8 — Bitácora de auditoría
  - [ ] 6.3.1 Vista de `audit_log` con filtros por tabla, acción, usuario, fecha
  - [ ] 6.3.2 Verificación de integridad SHA-256: comparar hash almacenado vs. recalculado
  - [ ] 6.3.3 Exportación de bitácora para auditoría externa (CSV con firma)
  - [ ] 6.3.4 Alerta si se detecta discrepancia de hash (posible manipulación)
  - [ ] 6.3.5 Retención mínima configurable por tipo de registro (default 2 años)

- [x] Módulo 18 — Ranking
  - [ ] 6.4.1 Ranking de DCs por cumplimiento de cuota de ventas (periodo actual y acumulado)
  - [ ] 6.4.2 Ranking de DCs por afiliaciones LOVE ISDIN
  - [ ] 6.4.3 Ranking de PDVs por volumen de ventas
  - [ ] 6.4.4 Filtros por zona, región, periodo
  - [ ] 6.4.5 Vista pública de ranking para motivación (sin datos sensibles)

- [ ] 6.5 Módulo 4 — Mensajes internos
  - [ ] 6.5.1 Envío de mensaje: remitente, destinatarios (individual o grupo por rol/zona), asunto, cuerpo
  - [ ] 6.5.2 Bandeja de entrada con estado leído/no leído
  - [ ] 6.5.3 Notificación push (Service Worker) al recibir mensaje nuevo
  - [ ] 6.5.4 Adjuntos en mensajes con compresión automática ≤100KB
  - [ ] 6.5.5 Historial de mensajes enviados y recibidos por empleado

## Fase 7 — Optimización y Calidad

- [x] Pipeline de compresión de imágenes y PDFs
  - [ ] 7.1.1 Utilidad `compressImage(file, maxKB)`: canvas resize + JPEG quality adaptativo hasta alcanzar target
  - [ ] 7.1.2 Utilidad `generateThumbnail(file, maxKB)`: miniatura ≤20KB para listados
  - [ ] 7.1.3 Utilidad `compressPDF(file)`: integración con `pdf-lib` o similar para reducir tamaño
  - [ ] 7.1.4 Aplicar compresión en todos los puntos de carga: selfies, evidencias, comprobantes, adjuntos
  - [ ] 7.1.5 Tests unitarios: verificar que output ≤ maxKB para inputs de distintos tamaños

- [x] Deduplicación SHA-256 de archivos
  - [ ] 7.2.1 Función `computeSHA256(file)`: calcular hash en cliente antes de subir
  - [ ] 7.2.2 Consulta a `archivo_hash` antes de upload: si hash existe, reusar URL existente
  - [ ] 7.2.3 Insertar en `archivo_hash` al subir archivo nuevo
  - [ ] 7.2.4 Tests: verificar que archivo duplicado no genera segundo upload a Storage

- [x] Estrategias de caché del Service Worker
  - [x] `CacheFirst` para assets estáticos (JS, CSS, fuentes, íconos)
  - [x] `NetworkFirst` con fallback a caché para datos operativos (asistencias, ventas del día)
  - [x] `StaleWhileRevalidate` para catálogos (productos, PDVs, empleados)
  - [ ] 7.3.4 Precaching de rutas críticas de la PWA en install del SW
  - [ ] 7.3.5 Estrategia de invalidación de caché al publicar nueva versión (versioned cache names)

- [ ] 7.4 Optimización de queries y vistas materializadas
  - [ ] 7.4.1 Revisar EXPLAIN ANALYZE en queries de dashboard y reportes más frecuentes
  - [ ] 7.4.2 Añadir índices compuestos donde se detecten seq scans en tablas grandes
  - [ ] 7.4.3 Función de refresco incremental de `dashboard_kpis` (evitar full refresh en cada llamada)
  - [ ] 7.4.4 Paginación cursor-based en listados con >1000 registros
  - [ ] 7.4.5 Memoización de queries costosas en servidor con `unstable_cache` de Next.js

- [ ] 7.5 Service Worker: sync en background y notificaciones push
  - [ ] 7.5.1 Background Sync API: registrar sync tag al encolar operación offline
  - [ ] 7.5.2 Handler `sync` en SW: procesar `sync_queue` al recuperar conexión
  - [ ] 7.5.3 Push Notifications: suscripción VAPID, envío desde Supabase Edge Function
  - [ ] 7.5.4 Notificaciones para: mensaje nuevo, solicitud aprobada/rechazada, alerta de geocerca
  - [ ] 7.5.5 Tests de SW con `@jest/fake-timers` o `workbox-testing`

- [ ] 7.6 Limpieza de huérfanos y mantenimiento de Storage
  - [ ] 7.6.1 Script/Edge Function que detecta archivos en Storage sin referencia en `archivo_hash`
  - [ ] 7.6.2 Política de retención: eliminar archivos huérfanos con antigüedad > umbral configurable
  - [ ] 7.6.3 Cron job semanal (Supabase pg_cron) para ejecutar limpieza
  - [ ] 7.6.4 Log de archivos eliminados en `audit_log`

- [ ] 7.7 Property-Based Testing con fast-check
  - [ ] 7.7.1 Instalar `fast-check` como dependencia de desarrollo
  - [ ] 7.7.2 Propiedades para Assignment Validation Service: ninguna combinación válida debe producir ERROR bloqueante inesperado
  - [ ] 7.7.3 Propiedades para motor de cuotas: avance nunca supera 100% con datos válidos; cuota no cambia por ausencias
  - [ ] 7.7.4 Propiedades para compresión: output siempre ≤ maxKB para cualquier input de imagen válida
  - [ ] 7.7.5 Propiedades para SHA-256: mismo contenido siempre produce mismo hash; contenidos distintos producen hashes distintos con probabilidad 1
  - [ ] 7.7.6 Propiedades para RLS multi-tenant: usuario de cuenta A nunca puede leer datos de cuenta B
  - [ ] 7.7.7 Integrar ejecución de PBT en CI (GitHub Actions o similar)

- [ ] 7.8 Tests de integración críticos
  - [ ] 7.8.1 Flujo completo de check-in offline → sync → verificación en Supabase
  - [ ] 7.8.2 Flujo de activación de cuenta: PROVISIONAL → ACTIVA con verificación de email
  - [ ] 7.8.3 Aislamiento multi-tenant: crear datos en cuenta A, verificar invisibilidad desde cuenta B
  - [ ] 7.8.4 Flujo de nómina: asistencias → cálculo → aprobación → exportación
  - [ ] 7.8.5 Integridad de audit_log: verificar que UPDATE/DELETE en tablas críticas generan entradas y que el log es inmutable

- [ ] 7.9 Checklist de cierre y documentación
  - [ ] 7.9.1 Ejecutar `npm run docs:check-encoding` y corregir cualquier hallazgo
  - [ ] 7.9.2 Instalar hook pre-commit con `npm run hooks:install`
  - [ ] 7.9.3 README actualizado con instrucciones de setup, variables de entorno y comandos principales
  - [ ] 7.9.4 AGENT_HISTORY.md con resumen de decisiones de arquitectura y desvíos documentados
  - [ ] 7.9.5 Lighthouse PWA score ≥90 en mobile (performance, accesibilidad, PWA checklist)
