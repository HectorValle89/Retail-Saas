# Cierre Canónico e Informe de Funcionamiento

## Estado de cierre

Este informe resume el estado real de la aplicación contra la fuente de verdad canónica:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

Métrica usada para el avance: conteo de todos los checkboxes de `tasks.md`, incluyendo subitems.

- Avance global: `286 / 287` checkboxes cerrados = `99.7%`
- Único pendiente abierto: `0.1.1 Crear proyecto con create-next-app usando flags --typescript --tailwind --app`

Ese pendiente es una excepción histórica de bootstrap. El repositorio actual sí cumple la arquitectura y capacidades pedidas, pero no existe evidencia retrospectiva concluyente del comando exacto usado para crear el proyecto inicial.

### Avance por fase

| Fase | Cerradas | Total | Avance |
|---|---:|---:|---:|
| Fase 0 - Fundación | 37 | 38 | 97.4% |
| Fase 1 - Auth y Gestión de Usuarios | 28 | 28 | 100% |
| Fase 2 - Estructura Maestra | 26 | 26 | 100% |
| Fase 3 - Planeación Operativa | 26 | 26 | 100% |
| Fase 4 - Ejecución Diaria (PWA Móvil) | 44 | 44 | 100% |
| Fase 5 - Control y Validación | 37 | 37 | 100% |
| Fase 6 - Análisis y Gobierno | 34 | 34 | 100% |
| Fase 7 - Optimización y Calidad | 54 | 54 | 100% |

## Qué es la app

Field Force Platform es una plataforma de operación para fuerza de campo retail. Su objetivo es transformar la actividad diaria de dermoconsejeras, supervisoras y áreas administrativas en evidencia operativa confiable.

La app cubre tres superficies:

1. PWA móvil para operación en campo.
2. Dashboard web para supervisión, administración y gobierno.
3. API interna y servicios server-side para integraciones, sincronización y procesos de negocio.

## Cómo está organizada

La aplicación sigue una arquitectura feature-first sobre Next.js 16.

### Capa de presentación

- `src/app/`: rutas App Router, páginas públicas, auth, dashboard, API routes y vistas PWA.
- `src/features/`: módulos verticales del negocio, cada uno con componentes, acciones, servicios y lógica interna.
- `src/components/`: piezas compartidas de UI, shell, navegación y runtime global.

### Capa de aplicación

Cada módulo encapsula:

- `components/`: interfaz y formularios.
- `actions.ts`: server actions y mutaciones de negocio.
- `services/`: lectura/agregación desde Supabase.
- `lib/`: reglas puras, utilidades y validadores.

### Capa de infraestructura

- Supabase Auth para sesión, claims y recuperación de cuenta.
- PostgreSQL para datos operativos.
- RLS para aislamiento multi-tenant y permisos.
- Supabase Realtime para tableros en vivo.
- Supabase Storage para evidencias y documentos.
- Service Worker + IndexedDB para PWA offline-first.

## Columna vertebral del dominio

La lógica central de la app nace de esta cadena:

`cuenta_cliente -> usuario -> empleado -> PDV -> asignación -> operación diaria`

Sin esos eslabones no existe ni asistencia, ni venta, ni nómina, ni reporteo.

### Entidades base

- `cuenta_cliente`: delimita el tenant y el alcance de datos.
- `usuario`: identidad de acceso y estado de cuenta.
- `empleado`: identidad laboral y rol operativo.
- `pdv`: punto de venta con ubicación, cadena, horario y supervisor.
- `asignacion`: decide quién trabaja, dónde y en qué periodo.

## Cómo funciona la app en la práctica

## 1. Acceso y activación de cuenta

Cuando Reclutamiento crea una persona operativa:

1. Se crea el empleado.
2. Se crea un usuario en estado `PROVISIONAL`.
3. Se emiten credenciales temporales.
4. La persona entra al flujo de activación.
5. Verifica email.
6. Define contraseña final.
7. La cuenta pasa a `ACTIVA`.

### Lógica detrás

- El rol operativo no se asigna manualmente en cada pantalla; se deriva del `puesto`.
- Los claims JWT cargan `rol`, `empleado_id`, `cuenta_cliente_id` y `estado_cuenta`.
- Si cambia el contexto auth, la sesión puede invalidarse para que no sobrevivan permisos viejos.
- Una cuenta no activa no puede operar módulos de negocio.

## 2. Multi-tenancy y visibilidad

La app soporta varias cuentas cliente sin mezclar datos.

### Lógica detrás

- El aislamiento principal ocurre en base de datos con RLS.
- La mayoría de tablas operativas filtran por `cuenta_cliente_id`.
- El dashboard y los reportes respetan el alcance del tenant activo.
- ADMINISTRADOR puede cambiar de cuenta visible; CLIENTE no.

Resultado: una cuenta cliente solo ve sus PDVs, su operación y sus reportes.

## 3. Estructura maestra

Antes de operar, el sistema necesita datos maestros:

- empleados
- usuarios
- PDVs
- geocercas
- cadenas
- ciudades
- horarios
- productos
- configuración
- reglas de negocio

### Lógica detrás

- Configuración centraliza umbrales como radio geocerca, biometría, OCR, retención y parámetros de nómina.
- Reglas de negocio concentran herencias y prioridades, por ejemplo supervisor, horario y flujo de aprobación.
- Los PDVs arrastran contexto operativo hacia asistencias, ventas, rutas, campañas y reportes.

## 4. Planeación operativa

La operación diaria no nace espontáneamente; nace de la planeación.

### Asignaciones

Definen qué persona va a qué PDV y en qué rango.

Lógicas principales:

- validación previa con reglas bloqueantes, alertas y avisos;
- publicación controlada `BORRADOR -> PUBLICADA`;
- detección de conflictos, geocercas faltantes, cuotas inválidas o dobles asignaciones;
- trazabilidad en `audit_log`.

### Ruta semanal

Organiza visitas de supervisor por día y por PDV.

Lógicas principales:

- solo permite PDVs con asignación activa;
- ordena visitas;
- registra cierres de visita con selfie y checklist.

### Campañas

Permiten añadir operación temporal a PDVs específicos.

Lógicas principales:

- tareas por PDV;
- seguimiento por cumplimiento;
- impacto en reportes y supervisión.

### Formaciones

Gestionan eventos de capacitación.

Lógicas principales:

- participantes;
- asistencia;
- notificación;
- relación con gastos operativos.

## 5. Ejecución diaria en campo

Esta es la parte más crítica de la app.

### Asistencias

El check-in combina ubicación, misión del día, selfie y validación operativa.

Lógicas principales:

- la app muestra una misión del día para antifraude;
- captura selfie desde cámara;
- compara GPS contra geocerca del PDV;
- permite operación fuera de geocerca con justificación cuando aplica;
- registra timestamp, coordenadas, biometría y evidencia;
- durante la jornada habilita tareas de visita;
- en check-out exige consistencia operativa del cierre.

Además:

- se registran faltas, retardos y ausencias justificadas;
- existe disciplina operativa que alimenta dashboard y nómina;
- supervisor puede ver mapa en tiempo real de la operación activa.

### Ventas

Las ventas están ligadas a jornada activa.

Lógicas principales:

- no hay venta válida sin asistencia abierta;
- el sistema registra producto, cantidad, monto, PDV y fecha;
- muestra totales del día;
- calcula avance contra cuota diaria estimada;
- alimenta dashboard, reportes, cuotas y nómina.

### LOVE ISDIN

Es un flujo comercial y antifraude separado de ventas.

Lógicas principales:

- escaneo o captura de QR;
- evidencia comprimida;
- deduplicación;
- validación antifraude por periodo;
- contador diario por dermoconsejera;
- sincronización offline.

## 6. Operación offline y PWA

La app está pensada para trabajar con conectividad imperfecta.

### Qué pasa offline

1. La PWA cachea shell y recursos críticos.
2. El usuario puede capturar operaciones de campo.
3. Esas operaciones se guardan en IndexedDB.
4. Cada operación queda en `sync_queue`.
5. Al volver la red, la cola se procesa en orden cronológico.

### Lógica detrás

- `CacheFirst` para app shell y estáticos.
- `NetworkFirst` para datos operativos.
- `StaleWhileRevalidate` para catálogos.
- conflictos resueltos con `server_wins` o `client_wins` según tipo de dato.
- Background Sync y Service Worker coordinan reintentos.
- la UI muestra estado de conexión y pendientes.

## 7. Solicitudes e incidencias

El módulo de solicitudes administra vacaciones, permisos e incapacidades.

Lógicas principales:

- flujo jerárquico de aprobación;
- notificación al solicitante;
- impacto directo en asistencia;
- calendario de ausencias;
- filtros por tipo, estado, fecha y persona.

Regla crítica:

- una ausencia aprobada evita generar falta;
- las cuotas no se reducen por vacaciones o incapacidad.

## 8. Nómina, ledger y cuotas

El bloque económico de la app se apoya en operación validada, no en captura manual aislada.

### Nómina

La prenómina consolida:

- asistencias;
- ventas;
- cuotas;
- deducciones;
- ajustes de ledger.

Lógicas principales:

- periodos con ciclo `BORRADOR -> APROBADO -> DISPERSADO`;
- cálculo de percepciones y deducciones;
- recibo por empleado;
- exportación CSV/XLSX;
- historial de periodos;
- panel administrativo para cierres.

### Ledger

Resuelve correcciones post-cierre sin reescribir historia.

Lógicas principales:

- todo ajuste manual queda registrado;
- conserva motivo, autor y periodo;
- se integra a la nómina siguiente según corresponda.

### Cuotas

El motor de cuotas convierte metas comerciales en seguimiento operativo.

Lógicas principales:

- metas por empleado y periodo;
- ventas, LOVE y visitas como insumos;
- semáforo de cumplimiento;
- ranking por zona;
- alertas de bajo avance;
- invariantes para que la cuota del PDV se distribuya sin romper consistencia.

Regla crítica:

- vacaciones e incapacidades no reducen la cuota total; solo redistribuyen carga cuando aplica.

## 9. Materiales, gastos y mensajería

### Entrega de material

Controla entregas y recepción de insumos.

Lógicas principales:

- entrega por empleado;
- confirmación de recepción;
- inventario por zona o almacén;
- historial y alertas de stock bajo.

### Gastos

Registra gasto operativo con comprobante.

Lógicas principales:

- categorías de gasto;
- compresión de comprobantes;
- flujo de aprobación;
- consolidado por empleado, categoría y periodo;
- impacto en `nomina_ledger`.

### Mensajes internos

Gestionan comunicación operativa.

Lógicas principales:

- envío individual o por grupos/zonas/roles;
- bandeja de entrada y leídos;
- adjuntos comprimidos;
- historial de enviados y recibidos;
- push para mensaje nuevo.

## 10. Dashboard, reportes, bitácora y ranking

### Dashboard

No es fuente primaria; es un concentrador de operación.

Lógicas principales:

- KPIs globales;
- mapa en vivo;
- widgets por rol;
- alertas live;
- refresco periódico;
- vista móvil compacta.

### Reportes

Consumen la operación ya capturada.

Lógicas principales:

- exportación CSV/XLSX/PDF;
- reportes programados por email;
- agregación por empleado, PDV, producto, periodo y zona.

### Bitácora

Es la caja negra de auditoría.

Lógicas principales:

- `audit_log` append-only;
- hash SHA-256 de integridad;
- exportación firmada;
- alertas por discrepancia;
- retención configurable.

### Ranking

Hace visible el desempeño comercial sin alterar operación.

Lógicas principales:

- ranking por ventas;
- ranking por LOVE;
- ranking por PDV;
- filtros por zona, región y periodo;
- vista pública sin datos sensibles.

## Lógicas transversales importantes

## Antifraude

- misión del día para check-in;
- geocerca por PDV;
- biometría configurable;
- hash de evidencia;
- deduplicación por SHA-256;
- bitácora inmutable;
- antifraude de QR en LOVE.

## Evidencias y archivos

- compresión de imágenes y PDFs antes de subir;
- miniaturas para listados;
- deduplicación previa a upload;
- limpieza de huérfanos en storage;
- políticas de retención por tipo.

## Tiempo real

- Realtime para ventas y señales operativas;
- refresco incremental de KPIs;
- latencias objetivo diferentes para ventas y mapa.

## Calidad y resiliencia

- property-based testing en reglas sensibles;
- pruebas de integración críticas;
- pruebas del Service Worker;
- verificación de encoding;
- hook de pre-commit.

## Qué carpetas mirar para entender la app rápido

### Superficies principales

- `src/app/(auth)/`
- `src/app/(main)/`
- `src/app/api/`
- `src/app/offline/`

### Módulos de negocio

- `src/features/asignaciones`
- `src/features/asistencias`
- `src/features/ventas`
- `src/features/love-isdin`
- `src/features/solicitudes`
- `src/features/nomina`
- `src/features/reportes`
- `src/features/dashboard`
- `src/features/bitacora`
- `src/features/mensajes`

### Infraestructura

- `src/lib/offline`
- `src/lib/pwa`
- `src/lib/files`
- `src/lib/supabase`
- `supabase/migrations`
- `supabase/seed.sql`

## Resumen ejecutivo

La app ya está funcionalmente cerrada en casi todo su alcance:

- estructura maestra completa;
- planeación operativa completa;
- PWA móvil y offline completos;
- control, validación y gobierno completos;
- optimización y calidad completos;
- una sola excepción histórica de bootstrap abierta por falta de evidencia retrospectiva.

En términos prácticos, el sistema ya resuelve el ciclo completo:

1. alta y activación de personal;
2. asignación a PDVs;
3. check-in geolocalizado con evidencia;
4. operación diaria con ventas y LOVE;
5. solicitudes, cuotas, nómina y ledger;
6. reportes, auditoría, ranking y mensajería;
7. operación móvil con soporte offline-first.

## Excepción histórica abierta

El único punto no cerrado es `0.1.1` y no refleja una brecha funcional del producto. Refleja únicamente que hoy no existe una prueba histórica concluyente de que el repositorio original se haya inicializado exactamente con `create-next-app --typescript --tailwind --app`.

Si se desea declarar el canon al 100%, ese punto tendría que cerrarse por aceptación retrospectiva del proyecto, no por evidencia nueva de implementación.
