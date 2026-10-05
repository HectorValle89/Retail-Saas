# Proyecto Retail - Bitacora Ejecutiva Derivada

## Auditoría de limpieza — 2026-09-14

Reconciliación de mantenimiento sobre Fases 0 y 7: se eliminaron 99 declaraciones privadas sin referencias, 93 imports sin uso, un wrapper mensual redundante, el ejemplo temporal de tipado y una página duplicada en carpeta privada. Se simplificaron middleware y arranque PWA conservando contratos, límites de sesión, rutas y sincronización. Dos verificaciones operativas históricas que cargaban credenciales locales se conservaron como texto en cuarentena y salieron de la suite automática.

Validación: TypeScript sin errores, 481 pruebas unitarias, 13 pruebas de servicios con Playwright, `npm run build` y `npm run cf:build` correctos. Sin nuevas consultas, migraciones, suscripciones ni refreshes. Se mantienen 351/352 checkboxes; no se cierran funcionalidades adicionales.

Pendientes: lint general con 349 errores y 143 advertencias; la optimización documental del servidor continúa en passthrough y requiere reconciliación funcional respecto de 7.1. Retirar su código inalcanzable no la restaura. Detalle en `docs/auditoria-refactor-2026-09-14.md`.

Documento derivado para seguimiento ejecutivo. La fuente de verdad del producto es:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

## Decisiones de negocio confirmadas

- Check-in fuera de geocerca: permitido con justificacion.
- Radio de geocerca por defecto: 100 metros.
- La planeacion canonica vive en `.kiro/specs/field-force-platform/tasks.md`.

## Estado general

- Estado del backlog canonico: `351 / 352` checkboxes cerrados (`99.7%`) al contar todos los checkboxes de `.kiro/specs/field-force-platform/tasks.md`.
- Estado de esta bitacora: derivada y secundaria.
- Regla: si hay conflicto con .kiro/specs/field-force-platform/{design,requirements,tasks}.md, prevalece .kiro.

## Cierre actual (2026-10-04)

- **Desvinculación de DC Promovido a Supervisor, Corrección de DC_INVALIDA en Liberación Masiva y Cascada Automática de Puesto**:
  - **Corrección de Validador Transaccional**: Se modificó `previsualizar_planeacion_mensual_asignaciones_v1` para permitir operaciones `LIBERAR_DC` sobre colaboradores que fueron promovidos a supervisor o reasignados a otro puesto, eliminando el bloqueo `DC_INVALIDA`.
  - **Corrección de Columna version_publicada**: Se agregó la columna faltante `version_publicada` en `public.planeacion_cambio_lote`, eliminando el error `column version_publicada of relation planeacion_cambio_lote does not exist` al confirmar operaciones de planeación.
  - **Corrección de Restricción NOT NULL en ui_change_version.last_event_type**: Se asignó valor por defecto `'updated'` a `ui_change_version.last_event_type` y se actualizó `aplicar_planeacion_mensual` para incluir explícitamente `last_event_type = 'planeacion_mensual_publicada'` y `cuenta_cliente_id`, eliminando el fallo al confirmar operaciones masivas para meses nuevos.
  - **Cascada Automática de Puesto (`trg_empleado_cambio_puesto_liberar_dc`)**: Trigger en `public.empleado` que al detectar cambio de puesto desde `DERMOCONSEJERO` a otro rol, desvincula automáticamente las tiendas como DC a partir de la fecha efectiva, limpia el calendario resuelto y refresca los snapshots de planeación mensual.
  - **Liberación Inmediata de S Pablo Aragón**: La tienda asignada previamente a Ángel Uriel Alanís Alarcón fue desvinculada para octubre 2026 y figura limpia como `POR CUBRIR` (vacante) en el calendario mensual.

## Cierre anterior (2026-10-01)

- **Módulo de Asistencia de Supervisores: Registro de Vacaciones, Eliminación de Aprobaciones Obsoletas y Estabilidad de Navegación**:
  - **Tipo de Registro "Vacaciones" (`🌴 Vacaciones`)**: Integración en `SupervisorAsistenciaManualSheet` con diseño simétrico de 6 botones (2x3 en móvil, 3x2 en escritorio), tarjeta informativa y creación directa de solicitud aprobada y registro de asistencia con subtipo `VACACIONES`.
  - **Retiro Total de Aprobaciones Obsoletas**: Se eliminó `SupervisorAttendanceReviewSheet` y el botón `[Revisar salida]`. Todas las tiendas se atienden directamente con el flujo de captura manual de entrada/salida/incapacidad/vacaciones. Se limpiaron registros huérfanos de prueba en base de datos.
  - **Persistencia de Navegación en Lista de Tiendas**: Se removió `router.refresh()` en `refreshAttendanceDate` para actualizar los datos en memoria local sin reiniciar el componente padre, y se configuró `backLabel="Volver a la lista"` en submodales de captura para que el usuario no regrese accidentalmente al dashboard principal.

## Cierre anterior (2026-09-29)

- **Unificación del Dashboard de Supervisores, Métricas Compactas y Módulo "Formularios Enviados por DC"**:
  - **Retiro de "Reportes de campo"**: Se eliminó el botón de acceso `/reportes` en el panel de supervisores.
  - **Métricas Compactas en Dashboard (`SupervisorKpiStrip.tsx`)**: Se integró una rejilla moderna 2x2/4x1 con avance de Canjes (%), Total Ventas (unidades), Love ISDIN (fidelizaciones) y Desabastos (reportes).
  - **Módulo "Formularios Enviados por DC" (`FormulariosEnviadosPorDcView.tsx`)**: Nuevo botón en el menú de operaciones que abre modal a pantalla completa con navegación día por día (`◀ [Fecha] ▶`), barra de progreso, botón Copiar WhatsApp estructurado y filtros por estado (`Pendientes`, `Al día`, `Todos`).
  - **Eliminación de Elementos Obsoletos**: Se eliminó la sección de "Bitácora de Registros de Campo" y los filtros complejos de tiendas/cadenas para los supervisores. Redirección automática a `/dashboard` en `/reportes`.
- **Optimización de Espaciado Superior y Tarjeta Unificada "Un Solo Cuadrito" en Reporte de Ventas**:
  - **Eliminación de Espacio Muerto Superior**: Se sobreescribió el padding de `.page-shell` (`!pt-3 sm:!pt-6 !px-2.5 sm:!px-6`), reduciendo el margen superior muerto en teléfonos de 112px a 12px.
  - **Tarjeta Superior Unificada ("Un Solo Cuadrito")**: Se integró el botón de regreso (`[ ← Volver ]` en móvil / `[ ← Regresar al dashboard ]` en escritorio) en una sola fila compacta junto al selector de pestañas (`[ 📊 Ventas ] [ ❤️ LOVE ISDIN ]`). La fila inferior del recuadro contiene el resumen compacto de filtros, botón de limpiar y botón de desplegar/ocultar configuración. Se eliminó el duplicado de filtros de LOVE ISDIN.
  - **Optimización de Barra de Herramientas**: Se ajustaron los selectores de agrupación (`Dermo + Tienda`, `Por Dermo`, `Por Tienda`) y el botón `[ ⛶ Pantalla Completa ]` para mantenerse en una sola línea horizontal sin saltos ni cortes.
- **Corrección de Atribución Histórica de Tiendas en Septiembre y Tablas Semanales Responsivas en Móvil con Pantalla Completa**:
  - **Aislamiento de Rutas por Supervisor (Septiembre 2026)**:
    - Se resolvió la fuga en la cual tiendas de octubre (como *City Market Interlomas*, *La Comer Bosque Real*, *Fresko La Herradura*) se mostraban en el reporte de septiembre de la supervisora Jacqueline López Ruiz.
    - Se identificó la causa raíz doble: registros anticipados de octubre en tablas maestras y fuga en días de descanso (`SIN_ASIGNACION`) donde el fallback estático le asignaba a Jacqueline a colaboradoras de Zenaida y Xóchitl.
    - Se aplicaron dos migraciones (`20260929151500_restaurar_atribucion_septiembre_jacqueline.sql` y `20260929152000_restaurar_dias_descanso_septiembre_supervisores.sql`) y se blindaron `supervisorAttribution.ts` y `ventaService.ts` (`ventas-panel-v6`).
  - **Rediseño Responsivo Mobile First de Tablas Semanales de Ventas y LOVE ISDIN**:
    - Se extrajeron los selectores de agrupación (`Dermo + Tienda`, `Por Dermo`, `Por Tienda`) fuera de la tabla en botones pequeños tipo pill.
    - Se implementó `TablaSemanalReporte.tsx` con columna fija a la izquierda (`sticky left-0`), nombres compactos de sucursales (`getSucursalCorta`), nombres limpios en Title Case de colaboradoras (`formatNombreDcCorto`) y tooltip con nombre completo.
    - Se implementó `ModalTablaSemanalFullscreen.tsx` con botón dedicado `[ ⛶ Ver Pantalla Completa ]`, permitiendo desplegar en celulares la tabla completa con todas las semanas (S1, S2, S3, S4, S5), totales, buscador interactivo y sugerencia de giro de pantalla.
  - **Validación Integral**: 549/549 pruebas unitarias, 0 errores de tipado, UTF-8 verificado en 1,365 archivos, `build` y `cf:build` satisfactorios.

## Cierre anterior (2026-09-17)

- **Corrección de Zoom y Re-Encuadre al Seleccionar Puntos en el Mapa**:
  - Se diagnosticó y resolvió de raíz el problema donde el mapa se alejaba y comprimía mostrando toda la República Mexicana al dar clic sobre cualquier tienda para seleccionarla.
  - **Detección Determinista de Firma Geográfica (`mapSanitization.ts`)**: Se implementó `getMapPointsSignature` para detectar si el conjunto geográfico de puntos o sus coordenadas realmente cambiaron. Si el conjunto de tiendas es el mismo y solo se seleccionó un punto, el efecto de re-encuadre no se dispara.
  - **Preservación de Zoom en Leaflet (`LeafletMexicoMap.tsx`)**: En `FitMapToPoints` se agregó memoria de firma (`lastSignatureRef`) que evita ejecutar `map.fitBounds` cuando la selección cambia, conservando el zoom y la posición exacta que el usuario configuró.
  - **Desacoplamiento de Estado en Componente (`PdvsOperationalMapTab.tsx`)**: Se retiró `selectedPdvId` de las dependencias de `mapPoints`, delegando la selección visual al prop nativo `selectedPointId`.
  - **Despliegue a Producción**: Compilado y desplegado exitosamente a Cloudflare Workers con versión `0baf89f9-c07e-48e8-bf98-f7dc585c7a49` en `beteele-one.com`.

- **Paleta de Alto Contraste para los 8 Supervisores de CDMX en Mapa Operacional**:
  - Se identificaron y auditaron las 145 tiendas y zonas de los 8 supervisores que operan en la Ciudad de México y Área Metropolitana:
    1. **Xóchitl Carrillo Xochihua** (Norte / Satélite): Naranja Fuego (`#ea580c`)
    2. **Liliana Reyes Aybar** (Nororiente / Lindavista): Azul Rey Zafiro (`#2563eb`)
    3. **Jacqueline López Ruiz** (Polanco / Reforma): Verde Esmeralda (`#059669`)
    4. **María Zenaida Monroy González** (Santa Fe / Interlomas): Púrpura / Morado Intenso (`#9333ea`)
    5. **Miguel Ángel Montagner Olivares** (Centro / Del Valle): Rojo Carmesí (`#dc2626`)
    6. **Atzin Susana Aguirre Camacho** (Sur / Coyoacán): Cian Océano / Turquesa (`#0891b2`)
    7. **Jonatan Raymundo Chávez Ramos** (Sur Poniente / Pedregal): Amarillo Ámbar Dorado (`#d97706`)
    8. **Miriam Rocío Estrada Nava** (Oriente / Iztapalapa): Rosa Mexicano / Fucsia (`#db2777`)
  - **Diferenciación Angular de Alto Contraste**: Los supervisores con zonas colindantes (ej. Jacqueline vs Zenaida vs Montagner vs Atzin) tienen separación angular de ~45° o triádica complementaria en el círculo cromático, eliminando confusiones de color entre tiendas vecinas.
  - **Filtro Territorial Directo `[ Todos | 🏙️ CDMX (8) | Foráneos ]`**: Selector de pestaña rápida que al seleccionar CDMX auto-ajusta el mapa Leaflet exclusivamente al polígono de la Ciudad de México, mostrando las 145 tiendas y la leyenda de color y zona por supervisor.
  - **Despliegue a Producción**: Compilado y desplegado exitosamente a Cloudflare Workers con versión `7da9f1ba-cdc9-4128-af7f-107e873c90c4` en `beteele-one.com`.

- **Optimización Minimalista de Catálogo de PDVs y Mapa Operacional de Supervisores**:
  - Se rediseñó el módulo de PDVs (`/pdvs`) bajo una arquitectura ejecutiva de dos pestañas:
    1. **📋 Catálogo de Tiendas**: Vista minimalista y ligera con paginación integrada (25, 50 o 100 tiendas por página, 25 por defecto), controles de navegación `< Anterior`, páginas numeradas con salto y `Siguiente >`, reduciendo la carga del DOM en más del 90% y eliminando la saturación de 278 filas simultáneas. Incluye barra de filtros compacta y acciones directas ("+ Alta de PDV" y "Descargar base de PDVs").
    2. **🗺️ Mapa Operacional de Supervisión**: Lienzo cartográfico panorámico de pantalla completa (altura de 620px) con controles táctiles de modo neutro/calles.
  - **Paleta de Colores por Supervisor**: Se implementó una paleta de 20 colores distintivos y contrastantes (`SUPERVISOR_PALETTE`) mapeados a cada supervisor activo y `#64748b` para tiendas sin supervisor, permitiendo auditar visualmente territorios y detectar de inmediato tiendas fuera de ruta o desfasadas.
  - **Panel Lateral de Supervisores con Filtro de Aislamiento**: Lista de supervisores con buscador en vivo, conteo de tiendas asignadas, botón "Ver todos" y filtro individual por supervisor para enfocar su territorio, además de tarjeta flotante de previsualización rápida con botón para abrir la ficha completa.
  - **Soporte de Colores Personalizados en Cartografía**: Se extendió `MexicoMapPoint` para admitir `customColor?: string` en `LeafletMexicoMap.tsx`, aplicando el color sobre `CircleMarker` y `Circle` con halo blanco perimetral.
  - **Despliegue a Producción**: Compilado y desplegado exitosamente a Cloudflare Workers con versión `c1afbb5a-4e0f-4c46-af33-359107ba9ac6` activa en `beteele-one.com`.

- **Reconciliación Integral de Supervisores en Catálogo, Asignación y Rutas**:
  - Se diagnosticó y corrigió la discrepancia en la tienda **F Ahorro Luis Barragán** (`BTL-FAH-LUIS-9S`), la cual figuraba en el Catálogo de PDVs asignada a **María Zenaida Monroy González**, pero en las rutas de planeación y mapa diario aparecía asignada a **Jacqueline López Ruiz**.
  - **Causa Raíz Diagnosticada**: Cuando Luis Barragán fue reasignada a Zenaida en el catálogo administrativo, se actualizaron `supervisor_pdv` y `asignacion`, pero la tabla `ruta_cuota_supervisor_pdv` conservó la cuota huérfana de Jacqueline abierta y la de Zenaida cerrada al 31 de agosto. De forma inversa, en **S Pablo Prado Norte** (`BTL-SAN-PRAD-Q0`), `supervisor_pdv` tenía a Jacqueline como supervisora activa pero las cuotas apuntaban a Zenaida.
  - **Migración de Sincronización en Cascada (`20260918120000_sincronizar_supervisor_cuota_cascada.sql`)**:
    1. Se cerraron y corrigieron las cuotas en `ruta_cuota_supervisor_pdv` para Luis Barragán y Prado Norte, asignando 6 visitas mensuales a sus supervisoras legítimas y removiendo duplicados históricos.
    2. Se generaron las cuotas mensuales activas para 7 PDVs activos adicionales que carecían de cuota para su supervisor en funciones.
    3. Se actualizó la función RPC `sincronizar_supervisor_pdv_operativo` en PostgreSQL para que cualquier reasignación futura de supervisor en el catálogo cierre automáticamente la cuota anterior y reactive/cree la del nuevo supervisor desde el primer día del mes.
  - **Acotación Temporal de Territorio en Rutas Diarias (`rutaCalendarioMensualService.ts`)**: Se actualizaron las consultas de cuotas, relaciones de supervisión y asignaciones para filtrar estrictamente por la fecha consultada (`options.fecha`), evitando que tiendas cuya supervisión cambió durante el mes se muestren erróneamente en el territorio del supervisor anterior.
  - **Servicio de Ciclo de Vida Operativo (`operationalLifecycleService.ts`)**: Se normalizó `vigente_desde` al primer día del mes (`YYYY-MM-01`) para cumplir con la restricción de integridad de base de datos.
  - **Auditoría Global del Territorio (100% Coincidencia)**: Se auditó la totalidad de los 293 PDVs activos de ISDIN México: 0 discrepancias entre `supervisor_pdv`, `asignacion` y `ruta_cuota_supervisor_pdv`.
  - **Despliegue a Producción**: Compilado y desplegado exitosamente a Cloudflare Workers con versión `aff0f34a-bd2f-484f-9579-8ea391ad2679` activa en `beteele-one.com`.

- **Cartografía Monocromática de Alto Contraste y Despliegue en Producción**:
  - Se configuró el mapa base con un lienzo neutro y limpio en escala de grises (`esri-canvas` y filtro CSS en `.leaflet-tile-pane`) para que la orografía y calles no saturen la visualización.
  - **Puntos de Alto Contraste**: Las visitas agendadas se destacan en azul cielo brillante con halo blanco puro (`r=9`, borde 3.5px), las tiendas del territorio sin visita en naranja encendido (`r=7`) y las tiendas vacantes en gris pizarra (`r=7`), todos con opacidad al 100%.
  - **Línea de Ruta con Doble Halo**: Trazo compuesto por una base blanca de 8px y una línea punteada azul cielo de 4px encima, asegurando legibilidad máxima sobre cualquier fondo.
  - **Selector Táctil de Modo**: Botón flotante `[ 🎨 Fondo Neutro | 🗺️ Calles ]` que permite al usuario alternar entre el fondo neutro y las calles a color tradicionales.
  - **Despliegue a Producción**: Compilado y desplegado con éxito en Cloudflare Workers con versión `bdfc5a09-2bb3-47a3-b950-298a3f66b1c7` activa en `beteele-one.com`.
- **Blindaje y Resolución de Error de Pantalla en Rutas y Mapa**:
  - Se diagnosticó y corrigió el error de carga de pantalla al navegar a la sub-pestaña `🗺️ Rutas por Día y Mapa`:
    1. *Subdomains en TileLayer*: Se identificó que `osm-standard` y `esri-street` entregaban `subdomains: undefined`, lo que provocaba que Leaflet fallara al calcular URLs de mosaicos (`TypeError: Cannot read properties of undefined reading length`). Se implementó `getSafeSubdomains` con TDD y se asignó `'abc'` por defecto.
    2. *Aislamiento y Sanitización*: Se implementó `mapSanitization.ts` para descartar cualquier coordenada inválida o `NaN`, asegurando que Leaflet solo reciba coordenadas geográficas finitas válidas.
    3. *Reconciliación DOM en Leaflet*: Se sustituyó el envoltorio `<div>` de cada marcador por `<Fragment>` de React, evitando conflictos de manipulación de DOM en el contenedor de Leaflet.
    4. *Error Boundary Aislado*: Se envolvió el componente del mapa con `<SafeMapBoundary>` para que contingencias del mapa nunca tumben la aplicación ni impidan gestionar rutas o listas de visitas.
    5. *Sincronización en la Nube*: Se recompiló y desplegó a producción en Cloudflare Workers (`npm run deploy`), subiendo todos los paquetes estáticos actualizados para eliminar cualquier conflicto de versiones en caché del navegador.
- **Mapa Panorámico con Territorio Completo y 3 Tipos de Puntos**:
  - En la vista de revisión de rutas por día (`RutaMensualRevisionDia`), se expandió el mapa a formato panorámico (8 columnas de 12, altura de 560px) y se compactó la lista de secuencia de visitas (4 columnas de 12 con scroll interno).
  - **Tres Tipos de Puntos en el Mapa**:
    1. 🔵/🟢 *Puntos Azules / Verdes*: Tiendas con visita agendada para el día, conectadas ordenadamente por la línea de ruta.
    2. 🟠/🔴 *Puntos Ámbar*: Tiendas asignadas al supervisor que **no** tienen visita programada ese día.
    3. ⚪ *Puntos Grises*: Tiendas asignadas que se encuentran **vacantes** (sin dermoconsejera) y sin visita ese día.
  - **Tooltips y Leyenda en Vivo**: Al pasar el ratón (*hover*) sobre cualquier punto se despliega el nombre del PDV, formato, dirección y condición. Además, se incluyó una barra de leyenda con el conteo en tiempo real de cada tipo de punto.
  - **Eliminación de Watermark**: Se actualizó el proveedor de mosaicos del mapa a OpenStreetMap estándar y Esri Street Map, eliminando la marca de agua *"API KEY REQUIRED"* sin requerir claves externas.
- **Sección Minimalista de Rutas por Día y Aprobación Mensual Directa**:
  - Se sustituyó el kanban semanal complejo de `/operacion-supervisores` por una interfaz minimalista, ágil y conectada en tiempo real al calendario mensual: `🗺️ Rutas por Día y Mapa` (`RutaMensualRevisionDia`).
  - **Selector Desplegable de Supervisores**: Menú desplegable directo para seleccionar al supervisor y revisar su mes de inmediato sin buscar entre columnas.
  - **Navegador Día a Día y Secuencia de Tiendas**: Botones `< Anterior` y `Siguiente >` más botones tipo pastilla de días activos, desplegando la secuencia ordenada de paradas (`1, 2, 3...`) con nombre de PDV, formato, zona y estatus.
  - **Mapa Interactivo de Rutas Diarias**: Integración con `MexicoMap` georreferenciado con las coordenadas reales de cada tienda para el día elegido.
  - **Botones Directos de Aprobación**: Sustitución de listas desplegables ambiguas por dos botones de acción directa: 🟢 *Aprobar Ruta* (con un solo clic aprueba el mes completo) y 🟡 *Reabrir / Pedir cambios* (con captura de notas).
  - **Sincronización Inmediata con Calendario Mensual**: Al aprobar una ruta, se actualiza la base de datos a `PUBLICADA` / `APROBADA` y se sincroniza en vivo con `RutaMensualCalendar`, marcando automáticamente las celdas en verde.
- **Límite Mensual Estricto en Calendario de Supervisión y Exclusión de Bajas sin Actividad**:
  - Se blindó la consulta y agregación del calendario mensual de supervisión (`/operacion-supervisores`) para evitar que semanas puente limítrofes entre dos meses arrastren a supervisores inactivos o dados de baja sin visitas en el mes.
  - **Migración y RPC (`20260917180000_ruta_calendario_mensual_estricto.sql`)**: Se actualizó `rpc_ruta_calendario_mensual_resumen` para requerir que cualquier supervisor con `estatus_laboral = 'BAJA'` y `fecha_baja <= p_month_start` sólo sea incluido en el resumen mensual si cuenta con visitas completadas o eventos de agenda dentro del rango exacto del mes consultado (`[p_month_start, p_month_end]`), devolviendo además `supervisor_estatus_laboral` y `supervisor_fecha_baja`.
  - **Capa de Servicio (`rutaCalendarioMensualService.ts`)**: Se incorporó un filtro que descarta de las filas del calendario a supervisores dados de baja que presenten 0 visitas y 0 eventos en el mes, preservando a su vez el historial de aquellos que sí completaron visitas durante el periodo.
  - **Capa de Presentación (`RutaMensualCalendar.tsx`)**: En `mergeSupervisorRows`, se blindó la fusión para que supervisores que no figuren en `supervisorOptions` (supervisores inactivos o baja) no sean insertados en la tabla si no tienen actividad mensual real.
  - **Caso Vanesa Palacios**: Baja confirmada y verificada al 31 de agosto de 2026; se eliminó el registro residual vacío de semana puente y se validó que en septiembre de 2026 figuran exactamente los 17 supervisores activos, sin filas fantasma.
- **Tiendas Vacantes Apagadas, Cuotas Dinámicas y Avance Mensual de Supervisión**:
  - Las tiendas sin dermoconsejera activa se marcan automáticamente como `Tienda apagada (Vacante)` con cuota fija de `0 visitas` y `0 visitas pendientes`, sin sumar a la meta obligatoria del supervisor pero manteniéndose 100% disponibles para ser visitadas en cualquier momento.
  - Se habilitó la acreditación y descuento automático de cuota cuando el supervisor realiza visitas extraordinarias o adicionales: toda visita completa (con geocerca y checklist) se suma a la tienda y se descuenta de las visitas pendientes del mes del supervisor.
  - Se dotó al supervisor de un tablero ejecutivo de metas con 6 métricas (Meta mensual, Realizadas, Faltantes, Con cuota, Apagadas, Por visitar) y un visor en "Mi Ruta Hoy" para dar seguimiento en tiempo real a su avance mensual.
  - Se implementó una columna fija de casillas de verificación (*checkboxes*) directamente en la tabla del calendario mensual para que los administradores y coordinadores puedan seleccionar supervisores directamente en la cuadrícula y aplicar acciones de liberación o aprobación de rutas en lote de forma ágil e intuitiva.
  - **Evaluación Mensual de Tiendas Vacantes (Caso ACIEN)**: Se corrigió la lógica de solapamiento en `rangesOverlapIso` (donde asignaciones indefinidas con `fecha_fin: null` se trataban erróneamente como vencidas al día de inicio) y se implementó `isAssignmentActiveForMonth` para evaluar si el PDV cuenta con asignación activa publicada durante el mes analizado completo. Con esta corrección, para ATZIN SUSANA AGUIRRE CAMACHO ("ACIEN") en septiembre 2026, de sus 19 tiendas asignadas, 17 tiendas activas con dermoconsejera conservan su cuota mensual normal (102 visitas totales) y únicamente 2 tiendas que carecen de dermoconsejera activa en el mes (*Benavides Félix Cuevas* y *Liverpool Mitikah*) se marcan como `Tienda apagada (Vacante)`.
- **Sincronización en Cascada Multi-Nivel y Conciliación Monterrey**:
  - Se implementó `operationalLifecycleService.ts` para interconectar los 3 niveles operativos (Catálogo de PDVs `/pdvs`, Rol de Asignaciones `/asignaciones` y Rutas/Cuotas `/operacion-supervisores`) más la Captura Pública (`/captura/[slug]`):
    1. *Alta de PDV*: Crea automáticamente la cuota de supervisión en `ruta_cuota_supervisor_pdv` y refresca la planeación mensual para que aparezca disponible de inmediato en rutas y asignaciones.
    2. *Inactivación de PDV*: Cierra de inmediato las asignaciones de dermoconsejeras activas al día anterior (evitando registrar faltas injustificadas), finaliza las cuotas del supervisor para no castigar su cumplimiento de visitas y retira la tienda de las opciones activas en la app de captura pública.
    3. *Reasignación de Supervisor (en Catálogo o en Asignaciones)*: Sincroniza atómicamente `supervisor_pdv` (aguas arriba), las asignaciones activas de dermoconsejeras y su supervisor asignado (nivel central), y transfiere las cuotas mensuales en `ruta_cuota_supervisor_pdv` (aguas abajo) al nuevo supervisor.
    4. *Asignación de DC a PDV*: Enlaza automáticamente con la app de captura pública, destacando el PDV con pin `📌` y preseleccionando el nombre de la dermoconsejera en cuanto ella o el promotor eligen la tienda en el formulario.
  - **Resolución Caso Monterrey**: Se conciliaron directamente en la base de datos las 49 tiendas de Monterrey para quedar 100% bajo la supervisión de Ana Cristina Ánimas Saucedo en todos los niveles (`supervisor_pdv`, `asignacion`, `ruta_cuota_supervisor_pdv`, y `asignacion_diaria_resuelta`), cerrando los registros previos de Vanesa Alejandra Palacios y corrigiendo el filtro de supervisores en `pdvService.ts` para evitar fantasmas de asignaciones históricas concluidas.

## Cierre actual (2026-06-18)

- **Simplificación y Resguardos en Última Milla (Supervisores)**: Rediseñamos el flujo de entregas de última milla para supervisores, permitiendo la selección libre de cualquier punto de venta a su cargo (ámbito dinámico del supervisor) sin requerir pre-carga manual de dispersiones. Simplificamos el formulario móvil a una única pregunta de completitud ("¿Recibiste completo?") con cuadro de discrepancias si no lo está, y habilitamos la selección de Modo de entrega: `ENTREGADO` (con receptor dermo) o `RESGUARDO` (con motivo de resguardo obligatorio, p. ej. Tienda vacante). En el backend, agregamos creación automática de dispersión y detalle genérico al vuelo durante la sincronización si estos no existen en base de datos.

## Cierre actual (2026-06-09)

- **Conciliación e Importación de Asignaciones**: Conciliamos e importamos el Rol de Asignaciones actualizado de Junio 2026 a partir de `ROL JUNIO ACTUALIZADO.xlsx`. Eliminamos 9 asignaciones obsoletas, insertamos 3 nuevas asignaciones (Claudia Fernanda Gómez Galván y María del Rosario Limón López) con fecha de inicio `2026-06-01` e indefinidas, y actualizamos los días laborables de Luz Adriana Mancilla Gutiérrez. Re-vinculamos asistencias de junio y rematerializamos las asignaciones diarias (`asignacion_diaria_resuelta`) para los 9 colaboradores afectados, asegurando que las asignaciones se mantengan para los meses posteriores.

## Cierre actual (2026-06-01)

- **Carga de Inventario Inicial de Canjes**: Se procesaron y cargaron exitosamente todos los saldos iniciales de inventario de canjes para los 256 puntos de venta a partir del archivo Excel `CANJES PROMOCIONALES 2026 (3).xlsx`.
- **Registro de Catálogo**: Identificamos 12 materiales faltantes en el catálogo maestro y los registramos transaccionalmente en producción bajo la cuenta de cliente de ISDIN México (`92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba`).
- **Actualización de Restricción de BD**: Detectamos y solucionamos un conflicto de check constraint en producción (`material_inventario_movimiento_tipo_movimiento_check`) que no aceptaba el tipo `CARGA_INICIAL`. Aplicamos una migración DDL en vivo para habilitarlo.
- **Importación Masiva**: Inyectamos de forma masiva y segura (chunks de 200) los 1,963 movimientos en `material_inventario_movimiento` con sentido `ENTRADA` y tipo `CARGA_INICIAL`.
- **Trazabilidad de Auditoría**: Generamos el log de auditoría `carga_inicial_inventario_canjes_excel` en la tabla `audit_log` a nombre de Héctor Eduardo Valle Rodríguez.
- **Corrección de Filtrado de Canjes**: Solucionamos de raíz el problema de visualización de "Dosis de inicio" y "Testers" en la pantalla de Canjes en el portal público, refinando el filtro de la API `loadMateriales` para admitir exclusivamente los tipos `'PROMOCIONAL'` y `'CANJE_PROMOCIONAL'`. Desplegado con éxito a producción sobre Cloudflare Workers.
- **Carga e Integración del Rol de Junio 2026**: Limpiamos las dispersiones y lotes mensuales ordinarios obsoletos de Junio (280 dispersiones y 6 lotes eliminados de forma segura con `wipe_june_mensual.cjs`), registramos 2 PDVs faltantes (`BTL-BEN-SAN-BRN` y `BTL-SEA-MTY-ANH`), cerramos las 282 asignaciones vigentes de Mayo al 31 de Mayo de 2026, e inyectamos transaccionalmente las 281 asignaciones del nuevo Rol de Junio a partir del 1 de Junio de 2026 en estado `PUBLICADA`, enlazando correctamente empleados, PDVs y supervisores mediante un mapeo fuzzy robusto sin dejar filas de personal sin resolver. Registrado en `audit_log`.
- **Materialización y Habilitación del Portal de Campo (Junio 2026)**: Detectamos que la tabla de asignaciones efectivas del día (`asignacion_diaria_resuelta`) estaba completamente vacía para Junio de 2026 porque nunca se había ejecutado el resolvedor mensual de materialización. Diseñamos y ejecutamos un script nativo de Vitest para materializar el rol de Junio para los 235 empleados activos con asignaciones publicadas, inyectando exitosamente la planeación en la base de datos de producción (235 registros resueltos para el 1 de Junio). Habilitamos de inmediato que aparezca el tag `📌 (Con asignación hoy)` en el dropdown de Puntos de Venta del portal de campo. Adicionalmente, agregamos `export const fetchCache = 'force-no-store'` en la ruta pública `src/app/captura/[slug]/page.tsx` para evitar cualquier almacenamiento en caché en el servidor. Compilado y desplegado de forma segura a producción en Cloudflare Workers (`npm run cf:deploy`), verificando en vivo por HTTP que el payload Next.js contiene exactamente las asignaciones de hoy.
- **Corrección de Mapeo de Puntos de Venta (Benavides San Bernardino vs Pitic)**: Solucionamos el problema donde `Benavides San Bernardino` no figuraba en el catálogo activo de ISDIN ni en sus reportes, mientras que `Benavides Pitic` seguía apareciendo a pesar de no tener asignaciones en Junio. Investigamos la base de datos y descubrimos que `Benavides San Bernardino` carecía de su relación en `cuenta_cliente_pdv`, y `Benavides Pitic` seguía marcada como `activo: true` y sin fecha de finalización. Procedimos a actualizar la relación de `Benavides Pitic` marcándola como inactiva con fecha final al 31 de Mayo (`activo = false, fecha_fin = '2026-05-31'`) y creamos la nueva relación para `Benavides San Bernardino` activa a partir del 1 de Junio (`activo = true, fecha_inicio = '2026-06-01'`), integrándola al 100% de forma instantánea en todos los reportes, capturas y vistas de ISDIN México sin requerir re-despliegue de código.
- **Auditoría y Vinculación Global de Puntos de Venta a ISDIN México**: Atendiendo la indicación del usuario de que el 100% de los puntos de venta operables en el sistema deben pertenecer a ISDIN México, realizamos una auditoría masiva comparando la tabla `pdv` (343 tiendas) contra `cuenta_cliente_pdv` para ISDIN (`92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba`). Identificamos exactamente 5 tiendas activas que carecían de relación: `SAN PABLO DEL VALLE` (`BTL-SAN-1001`), `BENAVIDES CUMBRES` (`BTL-BEN-2001`), `Fresko Montejo Mérida` (`BTL-FRE-S460-TM`), `F Ahorro 50 Sur Mérida` (`BTL-FAH-50SU-ME`) y `Sears Monterrey Anáhuac` (`BTL-SEA-MTY-ANH`). Las 7 tiendas restantes no vinculadas corresponden estrictamente a entornos de pruebas o desactivaciones históricas válidas. Procedimos a conectar transaccionalmente estas 5 tiendas activas a ISDIN México a partir del 1 de Junio de 2026, logrando un éxito perfecto donde el 100% de las tiendas activas operables de la base de datos están vinculadas a ISDIN México y listas para mostrarse en reportes y capturas.

## Cierre actual (2026-05-30)

- **Corrección de Dermoconsejeras Faltantes**: Se resolvió de raíz el problema de dermoconsejeras faltantes en el portal público de campo (`https://dermoconsejo.beteele-one.com/`).
- **Causa Raíz y Solución de Datos**: Identificamos que dos dermoconsejeras activas (**MIRIAM MONTES AGUILERA** y **ABRIL ALEJANDRA RAIGOZA REYES**) no tenían su fila de usuario correspondiente en `public.usuario`. Insertamos de forma segura y transaccional sus registros en la base de datos de producción Supabase asignándoles la cuenta de cliente de ISDIN México (`92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba`).
- **Solución Lógica**: Modificamos el resolvedor `loadEmpleados` en [capturaPublicaService.ts](file:///d:/IA/Retail/src/features/captura-publica/services/capturaPublicaService.ts) para ampliar el filtro de puestos, de modo que ahora admita tanto a las personas registradas bajo el puesto exacto de `DERMOCONSEJERO` como a las registradas bajo el puesto `LOVE_IS` (incorporando con éxito a **Miriam Cárdenas Ramírez**).
- **Verificación y Despliegue**: Las **11 pruebas unitarias** pasaron perfectamente. Compilamos el bundle de producción (`npm run cf:build`) y desplegamos la actualización en vivo en **Cloudflare Workers** (`npm run deploy`) de forma exitosa.

## Cierre actual (2026-05-03)

- **Corrección de Reportes Mayo 2026**: Se resolvió la desaparición de datos en el Ranking y Reporte Detallado de Mayo 2026.
- **Causa Raíz**: Bug de mapeo en `reporteVisitasOperativasService.ts` donde se perdía `semana_inicio`, invalidando el cálculo de fechas de operación.
- **Invalidación de Caché**: Se incrementó la versión de caché (`v: 2`) para forzar la actualización de datos y aplicar el buffer de 6 días sobre resultados frescos.
- **Validación Operativa**: Se confirmaron 22 visitas completadas para Mayo 2026 en la cuenta de ISDIN.
- **Despliegue**: ¡Exitoso! Los cambios están en vivo en `beteele-one.com`.

## Cierre actual (2026-04-28)

- **Dashboard & Build Stability**: Se restauró el tablero operativo de supervisión (`SupervisorDailyBoard`) y se corrigieron errores de tipado críticos en el tablero de cobertura de reclutamiento.
- Se resolvió una regresión en el formulario de aprobación de candidatos que impedía el acceso al PDV sugerido.
- Se verificó la construcción exitosa del proyecto (`npm run build`).
- **Despliegue a Producción**: ¡Completado con éxito! 🎉 (Live en beteele-one.com)
- Validaciones recientes: `npm run build` OK, `npm run cf:deploy` OK.

## Cierre actual (2026-04-01)

- Asistencias ya tiene calendario administrativo mensual para ADMINISTRADOR, COORDINADOR y NOMINA, con detalle lazy por celda y exportación mensual.
- La vista operativa legacy de /asistencias se mantiene solo como compatibilidad temporal para SUPERVISOR y DERMOCONSEJERO mientras ese flujo termina de migrarse al dashboard.
- Validaciones recientes: cmd /c npx tsc --noEmit OK y cmd /c npm run build OK.

## Cierre actual (2026-03-20)

- El único pendiente canónico abierto es `0.1.1 Crear proyecto con create-next-app usando flags --typescript --tailwind --app`.
- Ese pendiente es una excepción histórica de bootstrap; no representa una brecha funcional vigente del producto.
- El informe técnico y funcional del estado actual vive en `docs/informe-cierre-y-funcionamiento-app.md`.
- No se deben cerrar más items del canon sin evidencia nueva de implementación o sin una aceptación retrospectiva explícita para `0.1.1`.

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
- [x] Implementar `ventas` ligadas a check-in válido del mismo día, con ventana digital post check-out.
- [x] Preparar cola offline y sync base para PWA.

### P2 - Control y gobierno

- [x] Implementar `nomina`, `ledger` y `cuotas`.
- [x] Implementar `reportes`, `bitacora` y `ranking`.
- [x] Implementar pruebas de integracion y property-based tests.

### P3 - PWA y Service Worker

- [x] 7.6 Service Worker y estrategias de red aplicado en `public/sw.js`.
  - [x] 7.6.1 `CacheFirst` para assets y rutas estáticas que aprovechan `cacheFirstWithTtl`.
  - [x] 7.6.2 `NetworkFirst` con fallback offline para datos operativos (navegación y APIs) gracias al handler `networkFirst`.
  - [x] 7.6.3 `StaleWhileRevalidate` para catálogos identificados como `/producto`, `/cadena`, `/ciudad`, `/horario` y `/mision`.
  - [x] 7.6.4 No se dispara polling automático; el service worker solo responde a peticiones navegadas o manuales.
  - [x] 7.6.5 Documentos pesados (`.pdf`, `.docx`, `.xlsx`, `.csv`, etc.) no se cachean ni se descargan automáticamente.

## Control de Inventario y Canjes por PDV (2026-05-30)

- `[x]` Fase 1: Resolvedor de Stock en Tiempo Real por PDV
  - `[x]` Crear la lógica de base de datos para resolver stock neto por PDV a partir de la última `CARGA_INICIAL` (Completado: Server Action en memoria sobre ledger PostgreSQL)
  - `[x]` Modificar la API pública de catálogo en `capturaPublicaService.ts` para retornar stock por PDV (Resuelto dinámicamente con Server Action bajo demanda)
- `[x]` Fase 2: Control de Salidas y Semáforo de Stock en Formulario de Campo
  - `[x]` Modificar la UI de canjes en `CapturaPublicaForm.tsx` para inhabilitar materiales con stock <= 0 (Resuelto con badges interactivos e inhabilitación con SearchableSelect)
  - `[x]` Modificar la acción en `capturaPublicaActions.ts` para registrar transaccionalmente la `SALIDA` (Completado de forma nativa a través del trigger `trg_captura_canje_auto_deduccion` en PostgreSQL de producción)
- `[x]` Fase 3: Importador de Excel de Inventario Inicial
  - `[x]` Crear el Route Handler `/api/materiales/inventario-inicial` para procesar el Excel masivo (Completado: Creado y enlazado con la Server Action en Next.js)
  - `[x]` Agregar formulario de subida en la sección administrativa de la aplicación (Completado: Integrado visualmente en el tab Cargar Dispersión como el panel AdminInventarioInicialSection, con tabla de logs y errores en tiempo real)
- `[x]` Fase 4: Integración con la Recepción de Lotes de Última Milla
  - `[x]` Validar que la recepción de un lote de última milla registre correctamente la `RECEPCION_LOTE` como `ENTRADA` (Completado: Validado estructuralmente con la inserción de ENTRADA en la tabla material_inventario_movimiento al confirmar recepción)

## Dependencias criticas

- El esquema Supabase debe existir antes de levantar modulos de negocio.
- Auth depende de `empleado`, `usuario` y claims JWT.
- `asignaciones` depende de `empleado`, `pdv`, `geocerca_pdv`, `supervisor_pdv` y configuracion.

## Próximo bloque (2026-03-17)

- Paso 1: reconfirmar el backlog no cerrado revisando `5.3 Motor de Cuotas` y las notas pendientes de `5.4 Entrega de material` en `.kiro/specs/field-force-platform/tasks.md` para anotar exactamente qué falta implementar.
- Paso 2: once se valide el estado real del código/front (cubriendo por ejemplo formularios de entrega, historial y carga de gastos) se actualizarán `task.md` y `AGENT_HISTORY.md` con las decisiones y pruebas realizadas antes de marcar ítems como completados (la regla de reconciliación se mantiene intacta).
- Paso 3: mantener la compactación contextual: antes de que se acerque la ventana de contexto al 95 % se deja un resumen breve del avance, las validaciones (build, lint, docs:check-encoding) y los bloqueos detectados, de modo que los siguientes agentes retomen sin perder trazabilidad.
- Paso 4: al desplegar en Cloudflare, conectar la automatización diaria de asignaciones usando `GET /api/asignaciones/scheduled-publication` con `x-asignaciones-cron-secret`, para recalcular `mes actual + siguiente` sin depender del frontend.
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

- Se agrega migracion de sincronizacion de claims JWT hacia auth.users.
- Se agrega migracion base de asignacion con RLS y estado BORRADOR/PUBLICADA.
- Se implementan primeras vistas funcionales de empleados, pdvs y asignaciones con lectura desde Supabase y tolerancia a infraestructura pendiente.
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
- Se ajusta `src/actions/auth.ts` para resolver `emailRedirectTo` y `redirectTo` hacia `/api/auth/confirm?next=/update-password` tanto en activacion como en recuperacion, incluso si falta `NEXT_PUBLIC_SITE_URL` y hay que derivar origen desde headers.
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
  pm run build; queda pendiente
  eportes, auditoria ampliada e invalidacion de sesion por cambio de puesto.

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

### 2026-03-18 10:05

- Se audita `AGENT_HISTORY.md`, `task.md` y el canon en `.kiro/specs/field-force-platform/` para reconciliar el backlog derivado contra el estado real del arbol de trabajo.
- Se confirma que `task.md` quedo desfasado frente a cierres posteriores de `4.3.1` a `4.3.5` y frente a cambios no reconciliados en `dashboard`, `reportes`, `offline`, `rutas`, `asistencias`, `ventas` y `nomina` visibles en el worktree.
- Se sanean bloqueos locales de calidad en `src/features/asistencias/services/asistenciaService.ts`, `src/features/solicitudes/actions.test.ts`, `tests/gastos.spec.ts` y `eslint.config.mjs` para recuperar la barrera tecnica del corte.
- Validaciones de este corte: `npm run docs:check-encoding` aprobado, `cmd /c .\node_modules\.bin\tsc.cmd --noEmit --pretty false` limpio y `npm run lint` sin errores; solo persisten warnings. `npm run build` sigue bloqueado externamente por `spawn EPERM` despues de compilar.
- Estado: reconciliacion documental en progreso. No se mueven mas checkboxes del canon en este corte hasta terminar el mapeo conservador item por item entre `.kiro/specs/field-force-platform/tasks.md` y la implementacion real.

### 2026-03-31 15:20

- Se implementa el flujo de registro extemporáneo para Ventas y LOVE ISDIN con buffer `registro_extemporaneo`, captura desde `Incidencias`, revisión por SUPERVISOR/ADMINISTRADOR en `Solicitudes` y consolidación final auditada.
- Ventas reemplaza el registro del mismo producto y fecha operativa cuando la incidencia aprobada consolida; LOVE ISDIN evita duplicación ciega y conserva trazabilidad `EXTEMPORANEO`.
- Estado: en progreso validado con `cmd /c npx tsc --noEmit` y `cmd /c npm run build`; pruebas de UI/unit siguen bloqueadas localmente por `spawn EPERM` del entorno.

### 2026-05-30 20:10

- Se corrigen de raíz los registros de dermoconsejeras faltantes en el portal público y el bug de inicialización de cantidades en memoria.
- Se crean provisionalmente las filas en `usuario` para MIRIAM MONTES AGUILERA y ABRIL ALEJANDRA RAIGOZA REYES, asociadas a ISDIN México.
- Se amplía el filtro de `loadEmpleados` en `capturaPublicaService.ts` para soportar puestos `LOVE_IS` además de `DERMOCONSEJERO` (incorporando a Miriam Cárdenas Ramírez).
- Se corrige el bug en `CapturaPublicaForm.tsx` inicializando el estado de la cantidad de React en `1` por defecto (en lugar de `undefined`) para sincronizarlo con lo que ve el usuario visualmente y habilitar el botón de envío al instante.
- Estado: completado y 100% en vivo; pruebas unitarias al 100% pasadas y despliegue exitoso en Cloudflare Workers completado.

### 2026-06-01 14:00

- Se procesaron y cargaron exitosamente todos los saldos iniciales de inventario de canjes para los 256 puntos de venta a partir del archivo Excel `CANJES PROMOCIONALES 2026 (3).xlsx`.
- Sincronizamos e inyectamos transaccionalmente 12 materiales faltantes en la tabla `material_catalogo` en producción bajo la cuenta de ISDIN México (`92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba`).
- Actualizamos la restricción `material_inventario_movimiento_tipo_movimiento_check` en Supabase para permitir `'CARGA_INICIAL'` de forma nativa.
- Inyectamos de forma masiva y segura en chunks de 200 los 1,963 saldos de inventario en `material_inventario_movimiento` con sentido `'ENTRADA'` y tipo `'CARGA_INICIAL'`.
- Registramos la bitácora de auditoría en la tabla `audit_log` con el evento `carga_inicial_inventario_canjes_excel` a nombre del administrador Hector Eduardo Valle Rodríguez.
- Estado: 100% completado y verificado en la base de datos viva de producción.

### 2026-08-15 - Calendario mensual de rutas de supervisión

- Implementado calendario mensual por supervisor/día sobre rutas semanales, con detalle lazy de tiendas, visitas realizadas, pendientes y reposiciones.
- La matriz consume el token de cambios operativos existente para refrescar el resumen tras una mutación sin introducir polling.
- Implementados endpoints de resumen/detalle, índices de lectura, semanas solapadas y caché por cuenta/mes.
- Corregida conexión de replicación mensual y endurecida la aprobación masiva para no aprobar cambios solicitados automáticamente.
- Se agregó prueba Playwright móvil y benchmark reproducible de resumen/detalle; el flujo E2E pasó y las respuestas reales devolvieron HTTP 200.
- Estado: implementación funcional validada con build de Next y OpenNext; el corte queda cerrado con evidencia E2E, visual móvil y medición de latencia fría/caliente.
- Refinamiento de layout completado: shell administrativo a ancho completo con sidebar auto-ocultable y calendario de 31 días sin scroll horizontal en escritorio.
- Validación adicional: Playwright desktop/móvil 2/2, ESLint dirigido limpio, pruebas unitarias 3/3 y builds de Next/OpenNext exitosos; sin nuevas consultas ni polling.

### 2026-08-23 - Cierre de Fase 8: Planeación mensual

- Se completó el editor mensual con cambios efectivos temporales o definitivos para asignar, liberar y mover DC; rotación de dos o tres PDVs; descansos; horarios; estados de PDV; eventos independientes y sustitución de supervisor.
- Alta/baja de DC y alta/pausa/inactivación de PDV quedaron enlazadas al materializador diario, snapshots, cuotas persistidas e invalidación selectiva. La baja de supervisor exige sucesor cuando conserva PDVs operativos y propaga el nuevo alcance a las superficies dependientes.
- Dashboard y reportes consumen resúmenes mensuales de cuota persistidos; no recalculan cuotas recorriendo asignaciones o ventas durante la lectura.
- Las migraciones `20260823170000`, `20260823172000`, `20260823173000` y `20260823174000` se aplicaron y validaron en Supabase. La prueba transaccional confirmó preview, aplicación, idempotencia, actualización de snapshot, rollback, RLS, permisos y aislamiento entre cuentas.
- Validación del corte: 61 pruebas focalizadas, Playwright desktop/móvil 4/4, ESLint dirigido sin errores, `npm run build`, `npm run cf:build`, `npm run docs:check-encoding` y `npm run hooks:install` exitosos.
- Estado: Fase 8 cerrada contra implementación verificable; `7.10` continúa como pendiente independiente porque requiere configurar el Cron Trigger en el entorno desplegado.

### 2026-08-24 - Despliegue de Planeación Mensual y automatización diaria

- Se publicó la versión Cloudflare Worker `746a217f-50e7-4315-b1fe-b4f6d318f41e` al 100 % en `beteele-one.com` y dominios asociados.
- El entrypoint de OpenNext conserva `fetch` y agrega el handler `scheduled`; Cloudflare ejecutará `15 8 * * *` (02:15 de Ciudad de México) para procesar mes actual y siguiente.
- Se creó `ASIGNACIONES_CRON_SECRET` como secreto productivo y el endpoint rechaza llamadas no autenticadas con HTTP 401.
- Validación: 65/65 pruebas focalizadas, build Next/OpenNext, dry-run Wrangler, verificación transaccional PostgreSQL con rollback, login HTTP 200 y metadata productiva con handlers `fetch + scheduled`.
- Estado: tarea canónica `7.10` cerrada. Rollback disponible a `0d65e195-0887-441d-99f1-f2238c90c9cf`.

### 2026-08-24 - Continuidad mensual y bajas programadas

- Septiembre hereda las asignaciones abiertas de agosto sin copiar la fuente maestra; los cambios con inicio futuro sólo alteran las fechas desde su vigencia y un fin vacío continúa hasta la siguiente versión.
- PDV, DC y supervisor abren el editor maestro; las celdas diarias mantienen el detalle puntual.
- Las bajas usan último día laborado y primer día inactivo al día siguiente, conservando acceso hasta el cierre del primero y aplicando `BAJA` automáticamente desde el segundo.
- La ruta de supervisores resuelve PDVs por semana y día exacto, incluyendo semanas que cruzan el cambio de responsable.
- Se reparó el 401 del cron, se generaron agosto/septiembre y se evitó el reproceso sin cambios. Migración Supabase y Worker Cloudflare `de7246c7-7f12-4abe-b7cc-3c88050b5cab` desplegados.
- Validación: pruebas focalizadas 11/11, Playwright local/productivo 1/1, build Next, build OpenNext y UTF-8 correctos.

### 2026-09-03 - Sustitución de envío semanal por ruta mensual

- Se reemplazó la captura semanal visible del SUPERVISOR por `Planificar Mes`: calendario diario,
  selector de mes, edición táctil por fecha, orden de tiendas y un solo envío mensual.
- El contrato nuevo `ruta_mensual_envio` guarda estado, revisión optimista, totales y trazabilidad;
  `rpc_guardar_ruta_mensual` valida todo el mes y confirma o revierte la operación completa.
- `ruta_semanal` permanece como contenedor interno para check-in, agenda e historial. Cada visita y
  cada semana compartida quedan ligadas al envío mensual, evitando mezclar días cuando una semana
  cruza dos meses.
- Coordinación conserva la matriz mensual agregada y el detalle diario diferido. Aprobar o liberar
  opera por envío mensual exacto; una ruta pendiente no aparece en `Mi Ruta Hoy`.
- Rendimiento: el cambio no agrega polling, realtime ni lecturas por día. La navegación mensual usa
  un workspace cacheado por cuenta, supervisor, mes y versión; catálogo y borrador se cargan juntos,
  y el calendario administrativo conserva resumen agregado más detalle lazy.
- Validación: Vitest focalizado 32/32, Playwright móvil 1/1, ESLint dirigido limpio, `npm run build`,
  `npm run cf:build` y `npm run docs:check-encoding` correctos.
- Reconciliación: se cerraron `3.2.18` a `3.2.21` en el canon. La migración y el Worker quedaron
  desacoplados para evitar publicar cambios ajenos del worktree. El frontend mensual ya estaba en
  producción y el 03/09 se aplicó únicamente la migración `20260903120000` faltante, se registró en
  el historial remoto y se recargó PostgREST. Smoke autenticado como SUPERVISOR: planeación mensual
  visible, cero errores de schema cache y cero respuestas fallidas de `/api/ruta-semanal/`.
