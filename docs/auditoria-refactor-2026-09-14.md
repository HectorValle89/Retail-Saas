# Auditoría y refactorización — 2026-09-14

## Resultado

- 99 declaraciones privadas sin uso (3.394 líneas de declaraciones) y 93 imports retirados.
- Eliminado el wrapper mensual sin consumidores; el endpoint vigente sigue usando el workspace mensual cacheado.
- Middleware unificado conservando precedencia, redirects, parámetros y frontera de sesión.
- PWA reducida a registro diferido y supresión del aviso: cero estados React y un listener de instalación.
- Eliminados los logs informativos/de depuración de producción y el dump de FormData. Conservados errores con contexto y auditoría funcional.
- Fuera del código activo: ejemplo temporal de tipos, página privada duplicada y dos verificaciones históricas dependientes de credenciales/datos reales. Estas últimas se conservan como texto en `.cleanup-quarantine/2026-09-12/`.

## Criterio e impacto

La revisión tomó como fuente de verdad design.md, requirements.md y tasks.md de `.kiro/specs/field-force-platform/`. Se conservaron las cadenas App Router → acciones/servicios → Supabase y PWA → IndexedDB → sincronización. Se eliminaron declaraciones privadas sin referencias y sus dependencias huérfanas mediante AST y comprobación de tipos. No se consideró prescindible un Route Handler por carecer de imports.

Se conservan contratos públicos, permisos, datos, UI visible, mensajes operativos, idempotencia y cursores. La supresión del aviso PWA mantiene el comportamiento solicitado en el código anterior. El registro del service worker sigue diferido con idle callback o timeout de dos segundos, cancelable antes de ejecutarse.

Consultas principales preservadas: updateSession, catálogo/workspace mensual de rutas, validación y persistencia de captura pública, deltas de asignación y cargas de paneles. Se agregan **0 consultas, 0 joins, 0 suscripciones y 0 refreshes**. Los helpers retirados eran inalcanzables, por lo que su eliminación no representa un ahorro de lecturas. La reducción efectiva está en estados/listeners del cliente y serialización/logging. No se midieron latencia de producción ni factura de Supabase.

## Validación

| Verificación | Resultado |
| --- | --- |
| TypeScript sin emitir ni incremental | Correcto |
| Pruebas unitarias | 481/481 |
| Pruebas de servicios con Playwright | 13/13 |
| npm run build | Correcto |
| npm run cf:build | Correcto; Worker generado |
| npm run docs:check-encoding | Correcto |
| Lint de src antes | 356 errores y 295 advertencias |
| Lint de src después | 349 errores y 143 advertencias |

Las pruebas de servicios cubren integridad de auditoría, bitácora, empleados y PDVs. Comando reproducible:

```powershell
node --conditions=react-server node_modules/@playwright/test/cli.js test --config=playwright.retail.config.ts tests/audit-log-integrity.spec.ts tests/bitacora-panel.spec.ts tests/pdvs-panel.spec.ts tests/empleados-panel.spec.ts
```

La condición react-server permite cargar módulos de servidor en el runner. Estas verificaciones usan dobles de datos; no son un recorrido visual autenticado ni una validación remota de RLS. No se desplegó ni se escribió en la base de datos.

Se añadieron pruebas para reescrituras/redirecciones del middleware y registro, diferimiento, cancelación y error del arranque PWA. Las comprobaciones de comillas del service worker se reemplazaron por pruebas de comportamiento de caché. Los fixtures se adaptaron a contratos vigentes sin relajar tipos de producción.

## Pendientes y compatibilidad conservada

- El lint general sigue pendiente, principalmente any, reglas de hooks y variables sin uso cuya eliminación necesita analizar efectos o contratos. No se declara limpio todo el repositorio.
- documentOptimization.ts sigue pasando archivos originales sin compresión de servidor. Su rama muerta se retiró; reactivarla exige revisar calidad, límites y compatibilidad Workers. La divergencia con 7.1 queda registrada y abierta.
- Se conservó la convención middleware existente, aunque Next.js emite una advertencia de deprecación. No se introdujo runtime edge, next-on-pages ni dependencias nuevas.
- Se mantienen los fallbacks activos de R2, navegador y Windows/OpenNext. OpenNext terminó sin necesitar sustituciones de rutas Windows.
- La comparación usa una copia del workspace anterior a esta auditoría, no HEAD, para distinguir los cambios previos del usuario.
- Backlog canónico: 351/352 checkboxes; sin nuevas tareas funcionales marcadas completas.

## Código completo

[Descargar archivos refactorizados completos](../artifacts/auditoria-refactor-2026-09-14/codigo-refactorizado.zip). Contiene los archivos modificados completos, las pruebas y un manifiesto de eliminaciones. Se aplica sobre este repositorio con sus dependencias y configuración vigentes.

## Declaraciones retiradas

| Archivo | Declaraciones privadas eliminadas |
| --- | --- |
| [src/features/asignaciones/actions.ts](../src/features/asignaciones/actions.ts) | `safelyRefreshMaterializedAssignmentRanges` |
| [src/features/asignaciones/components/AsignacionesPanel.tsx](../src/features/asignaciones/components/AsignacionesPanel.tsx) | `FutureVacanciesSection`, `CalendarSection`, `shiftMonth`, `getWeekdayLetter`, `getCalendarCode`, `getCalendarTone` |
| [src/features/asistencias/lib/attendanceDiscipline.ts](../src/features/asistencias/lib/attendanceDiscipline.ts) | `isApprovedJustification`, `isOperationalFormation`, `getAssignmentPriority`, `getAssignmentTypeWeight`, `normalizeMetadata` |
| [src/features/asistencias/services/attendanceAdminService.ts](../src/features/asistencias/services/attendanceAdminService.ts) | `resolveExpectedMinutes`, `resolveActualMinutes` |
| [src/features/campanas/components/CampanasPanel.tsx](../src/features/campanas/components/CampanasPanel.tsx) | `ReportesCampanaCard` |
| [src/features/campanas/lib/campaignRotationImpact.ts](../src/features/campanas/lib/campaignRotationImpact.ts) | `rangesOverlapIso` |
| [src/features/captura-publica/components/CapturaPublicaForm.tsx](../src/features/captura-publica/components/CapturaPublicaForm.tsx) | `withPlaceholder`, `SUBTIPOS_CANJE`, `SUBTIPOS_LOVE` |
| [src/features/clientes/services/clienteService.ts](../src/features/clientes/services/clienteService.ts) | `isActorActual` |
| [src/features/dashboard/components/ClienteDashboardPanel.tsx](../src/features/dashboard/components/ClienteDashboardPanel.tsx) | `AlertRow` |
| [src/features/dashboard/components/DashboardPanel.tsx](../src/features/dashboard/components/DashboardPanel.tsx) | `DermoSupportButton`, `RoleShortcutButton`, `RoleShortcutSheet`, `DermoVentasSheet`, `DermoLoveSheet`, `DermoPlaceholderSheet`, `SUPERVISOR_SHORTCUTS`, `getRoleShortcutIcon`, `RoleShortcutItem` |
| [src/features/dashboard/services/dashboardService.ts](../src/features/dashboard/services/dashboardService.ts) | `isMissingCiudadEstadoColumn` |
| [src/features/empleados/actions.ts](../src/features/empleados/actions.ts) | `provisionarAccesoProvisional`, `buildPreferredUsername`, `buildPlaceholderEmail`, `createTemporaryPassword`, `obtenerHorasPasswordTemporal`, `EmpleadoBaseRow` |
| [src/features/empleados/components/EmpleadosPanel.tsx](../src/features/empleados/components/EmpleadosPanel.tsx) | `getExpedienteTone`, `getImssTone`, `EXPEDIENTE_OPTIONS`, `DOCUMENT_CATEGORY_OPTIONS`, `DOCUMENT_TYPE_OPTIONS` |
| [src/features/empleados/lib/ocrMapping.ts](../src/features/empleados/lib/ocrMapping.ts) | `normalizeDecimal` |
| [src/features/formaciones/actions.ts](../src/features/formaciones/actions.ts) | `resolveScopedPdvIds`, `buildExpenseLines`, `FORMACION_EVIDENCE_BUCKET` |
| [src/features/formaciones/services/formacionService.ts](../src/features/formaciones/services/formacionService.ts) | `signStorageUrl` |
| [src/features/love-isdin/lib/loveIsdinExport.ts](../src/features/love-isdin/lib/loveIsdinExport.ts) | `formatFechaDiaMes` |
| [src/features/materiales/actions.ts](../src/features/materiales/actions.ts) | `normalizeIdCadena` |
| [src/features/materiales/lib/materialDistributionImport.ts](../src/features/materiales/lib/materialDistributionImport.ts) | `uniquePush`, `buildDistributionIdentityKey` |
| [src/features/materiales/services/materialService.ts](../src/features/materiales/services/materialService.ts) | `sumInventory` |
| [src/features/nomina/components/NominaPanel.tsx](../src/features/nomina/components/NominaPanel.tsx) | `InboxFilterChip` |
| [src/features/pdvs/services/pdvService.ts](../src/features/pdvs/services/pdvService.ts) | `isMonthlyPublicationState`, `groupRecentItems` |
| [src/features/reportes/components/ReportesPanel.tsx](../src/features/reportes/components/ReportesPanel.tsx) | `formatFriendlyPeriod`, `buildLastMileExcelHref`, `buildUniformsExcelHref` |
| [src/features/reportes/components/VisitasSupervisoresDemandCard.tsx](../src/features/reportes/components/VisitasSupervisoresDemandCard.tsx) | `formatDateTime` |
| [src/features/reportes/services/capturaPublicaReporteService.ts](../src/features/reportes/services/capturaPublicaReporteService.ts) | `calcularResumen` |
| [src/features/reportes/services/pptExportService.ts](../src/features/reportes/services/pptExportService.ts) | `addCanjeEvidenceImages` |
| [src/features/rutas/components/RutaSemanalPanel.tsx](../src/features/rutas/components/RutaSemanalPanel.tsx) | `getExceptionTone`, `getWorkloadLabel`, `getCoordinatorApprovalStateForColumn`, `BlockedDaysCard`, `ReassignmentAlertsCard`, `HeatMapCard`, `AgendaEventEvidenceCenter`, `ApprovedRouteNotice`, `buildWeeklyDrafts`, `WeeklyRouteCanvasPlanner`, `DropZone`, `RouteChangeImpactCard`, `AgendaEventEvidenceDraft`, `WeeklyCanvasDraftVisit`, `WeeklyPlannerView` |
| [src/features/rutas/lib/routeAgenda.ts](../src/features/rutas/lib/routeAgenda.ts) | `normalizeApprovalState` |
| [src/features/rutas/services/rutaCalendarioMensualService.ts](../src/features/rutas/services/rutaCalendarioMensualService.ts) | `getDisplacedVisitIds`, `asRecord` |
| [src/features/rutas/services/rutaSemanalService.ts](../src/features/rutas/services/rutaSemanalService.ts) | `SolicitudRutaRow` |
| [src/features/solicitudes/services/solicitudService.ts](../src/features/solicitudes/services/solicitudService.ts) | `buildEmptyCalendar`, `buildCalendar`, `getMonthRange`, `shiftIsoDate`, `formatMonthLabel`, `getTodayIso` |
| [src/features/ventas/lib/ventaExport.ts](../src/features/ventas/lib/ventaExport.ts) | `encodeCell` |
| [src/features/ventas/lib/ventaRegistration.ts](../src/features/ventas/lib/ventaRegistration.ts) | `findExistingVentaForReplacement`, `ExistingVentaRow` |
| [src/lib/files/documentOptimization.ts](../src/lib/files/documentOptimization.ts) | `resolvePdfCompressionConfiguration`, `normalizeWidthSteps`, `optimizePdfDocumentLocal`, `IMAGE_WIDTH_STEPS`, `IMAGE_QUALITY_STEPS`, `THUMBNAIL_QUALITY_STEPS`, `IMAGE_MAX_HEIGHT`, `THUMBNAIL_WIDTH`, `THUMBNAIL_HEIGHT` |
| [src/features/gastos/actions.ts](../src/features/gastos/actions.ts) | `GASTO_REFRESH_TARGETS` |

## Índice de archivos completos

| Archivo | Estado |
| --- | --- |
| [src/actions/auth.test.ts](../src/actions/auth.test.ts) | Refactorizado/ajustado |
| [src/actions/auth.ts](../src/actions/auth.ts) | Refactorizado/ajustado |
| [src/app/formularios/[slug]/page.tsx](../src/app/formularios/[slug]/page.tsx) | Refactorizado/ajustado |
| `src/app/formularios/_slug_/page.tsx` | Fuera del código activo |
| [src/components/pwa/PwaBootstrap.tsx](../src/components/pwa/PwaBootstrap.tsx) | Refactorizado/ajustado |
| [src/components/pwa/PwaBootstrap.test.ts](../src/components/pwa/PwaBootstrap.test.ts) | Nuevo |
| [src/features/asignaciones/actions.ts](../src/features/asignaciones/actions.ts) | Refactorizado/ajustado |
| [src/features/asignaciones/components/AsignacionesPanel.tsx](../src/features/asignaciones/components/AsignacionesPanel.tsx) | Refactorizado/ajustado |
| [src/features/asignaciones/services/asignacionService.ts](../src/features/asignaciones/services/asignacionService.ts) | Refactorizado/ajustado |
| [src/features/asistencias/lib/attendanceDiscipline.ts](../src/features/asistencias/lib/attendanceDiscipline.ts) | Refactorizado/ajustado |
| [src/features/asistencias/services/attendanceAdminService.ts](../src/features/asistencias/services/attendanceAdminService.ts) | Refactorizado/ajustado |
| [src/features/campanas/components/CampanasPanel.tsx](../src/features/campanas/components/CampanasPanel.tsx) | Refactorizado/ajustado |
| [src/features/campanas/lib/campaignRotationImpact.ts](../src/features/campanas/lib/campaignRotationImpact.ts) | Refactorizado/ajustado |
| [src/features/canjes/components/CanjesPanel.tsx](../src/features/canjes/components/CanjesPanel.tsx) | Refactorizado/ajustado |
| [src/features/captura-publica/components/CapturaPublicaForm.tsx](../src/features/captura-publica/components/CapturaPublicaForm.tsx) | Refactorizado/ajustado |
| [src/features/captura-publica/services/capturaPublicaActions.ts](../src/features/captura-publica/services/capturaPublicaActions.ts) | Refactorizado/ajustado |
| [src/features/clientes/services/clienteService.ts](../src/features/clientes/services/clienteService.ts) | Refactorizado/ajustado |
| [src/features/dashboard/components/ClienteDashboardPanel.tsx](../src/features/dashboard/components/ClienteDashboardPanel.tsx) | Refactorizado/ajustado |
| [src/features/dashboard/components/DashboardPanel.tsx](../src/features/dashboard/components/DashboardPanel.tsx) | Refactorizado/ajustado |
| `src/features/dashboard/services/clienteDashboardService.test.ts` | Fuera del código activo |
| [src/features/dashboard/services/dashboardService.ts](../src/features/dashboard/services/dashboardService.ts) | Refactorizado/ajustado |
| [src/features/empleados/actions.ts](../src/features/empleados/actions.ts) | Refactorizado/ajustado |
| [src/features/empleados/components/EmpleadosPanel.tsx](../src/features/empleados/components/EmpleadosPanel.tsx) | Refactorizado/ajustado |
| [src/features/empleados/lib/ocrMapping.ts](../src/features/empleados/lib/ocrMapping.ts) | Refactorizado/ajustado |
| [src/features/empleados/services/pdvCoberturaService.ts](../src/features/empleados/services/pdvCoberturaService.ts) | Refactorizado/ajustado |
| [src/features/evidencias/components/EvidenciasEntregasHub.tsx](../src/features/evidencias/components/EvidenciasEntregasHub.tsx) | Refactorizado/ajustado |
| [src/features/evidencias/components/SupervisorEvidenciasSheet.tsx](../src/features/evidencias/components/SupervisorEvidenciasSheet.tsx) | Refactorizado/ajustado |
| [src/features/evidencias/components/SupervisorUniformeSheet.tsx](../src/features/evidencias/components/SupervisorUniformeSheet.tsx) | Refactorizado/ajustado |
| [src/features/formaciones/actions.ts](../src/features/formaciones/actions.ts) | Refactorizado/ajustado |
| [src/features/formaciones/services/formacionService.ts](../src/features/formaciones/services/formacionService.ts) | Refactorizado/ajustado |
| [src/features/gastos/actions.ts](../src/features/gastos/actions.ts) | Refactorizado/ajustado |
| [src/features/love-isdin/lib/loveIsdinExport.ts](../src/features/love-isdin/lib/loveIsdinExport.ts) | Refactorizado/ajustado |
| [src/features/materiales/actions.ts](../src/features/materiales/actions.ts) | Refactorizado/ajustado |
| [src/features/materiales/components/DispersionesPanel.tsx](../src/features/materiales/components/DispersionesPanel.tsx) | Refactorizado/ajustado |
| [src/features/materiales/components/ImportacionExcelPanel.tsx](../src/features/materiales/components/ImportacionExcelPanel.tsx) | Refactorizado/ajustado |
| [src/features/materiales/components/InventarioDashboard.tsx](../src/features/materiales/components/InventarioDashboard.tsx) | Refactorizado/ajustado |
| [src/features/materiales/lib/materialDistributionImport.ts](../src/features/materiales/lib/materialDistributionImport.ts) | Refactorizado/ajustado |
| [src/features/materiales/services/materialService.ts](../src/features/materiales/services/materialService.ts) | Refactorizado/ajustado |
| [src/features/mensajes/actions.ts](../src/features/mensajes/actions.ts) | Refactorizado/ajustado |
| [src/features/nomina/components/NominaPanel.tsx](../src/features/nomina/components/NominaPanel.tsx) | Refactorizado/ajustado |
| [src/features/nomina/components/NominaWorkspacePanel.tsx](../src/features/nomina/components/NominaWorkspacePanel.tsx) | Refactorizado/ajustado |
| [src/features/pdvs/services/pdvService.ts](../src/features/pdvs/services/pdvService.ts) | Refactorizado/ajustado |
| [src/features/reclutamiento/components/PipelineBoard.tsx](../src/features/reclutamiento/components/PipelineBoard.tsx) | Refactorizado/ajustado |
| [src/features/reclutamiento/components/RecruitmentShell.tsx](../src/features/reclutamiento/components/RecruitmentShell.tsx) | Refactorizado/ajustado |
| [src/features/reportes/components/GeneradorPresentaciones.tsx](../src/features/reportes/components/GeneradorPresentaciones.tsx) | Refactorizado/ajustado |
| [src/features/reportes/components/ReportesPanel.tsx](../src/features/reportes/components/ReportesPanel.tsx) | Refactorizado/ajustado |
| [src/features/reportes/components/VisitasSupervisoresDemandCard.tsx](../src/features/reportes/components/VisitasSupervisoresDemandCard.tsx) | Refactorizado/ajustado |
| [src/features/reportes/services/capturaPublicaReporteService.ts](../src/features/reportes/services/capturaPublicaReporteService.ts) | Refactorizado/ajustado |
| [src/features/reportes/services/pptExportService.ts](../src/features/reportes/services/pptExportService.ts) | Refactorizado/ajustado |
| [src/features/reportes/services/reporteVisitasOperativasService.test.ts](../src/features/reportes/services/reporteVisitasOperativasService.test.ts) | Refactorizado/ajustado |
| [src/features/rutas/actions.ts](../src/features/rutas/actions.ts) | Refactorizado/ajustado |
| [src/features/rutas/components/RutaSemanalPanel.tsx](../src/features/rutas/components/RutaSemanalPanel.tsx) | Refactorizado/ajustado |
| [src/features/rutas/lib/routeAgenda.ts](../src/features/rutas/lib/routeAgenda.ts) | Refactorizado/ajustado |
| [src/features/rutas/lib/routeWorkspace.test.ts](../src/features/rutas/lib/routeWorkspace.test.ts) | Refactorizado/ajustado |
| [src/features/rutas/services/rutaCalendarioMensualService.ts](../src/features/rutas/services/rutaCalendarioMensualService.ts) | Refactorizado/ajustado |
| [src/features/rutas/services/rutaSemanalCatalogoService.ts](../src/features/rutas/services/rutaSemanalCatalogoService.ts) | Refactorizado/ajustado |
| [src/features/rutas/services/rutaSemanalService.ts](../src/features/rutas/services/rutaSemanalService.ts) | Refactorizado/ajustado |
| [src/features/solicitudes/services/solicitudService.ts](../src/features/solicitudes/services/solicitudService.ts) | Refactorizado/ajustado |
| [src/features/usuarios/actions.test.ts](../src/features/usuarios/actions.test.ts) | Refactorizado/ajustado |
| [src/features/usuarios/services/usuarioService.ts](../src/features/usuarios/services/usuarioService.ts) | Refactorizado/ajustado |
| [src/features/ventas/lib/ventaExport.ts](../src/features/ventas/lib/ventaExport.ts) | Refactorizado/ajustado |
| [src/features/ventas/lib/ventaRegistration.ts](../src/features/ventas/lib/ventaRegistration.ts) | Refactorizado/ajustado |
| [src/hooks/useOfflineSync.ts](../src/hooks/useOfflineSync.ts) | Refactorizado/ajustado |
| [src/lib/files/documentOptimization.ts](../src/lib/files/documentOptimization.ts) | Refactorizado/ajustado |
| [src/lib/notifications/workflows/nominaEmail.ts](../src/lib/notifications/workflows/nominaEmail.ts) | Refactorizado/ajustado |
| [src/lib/notifications/workflows/rutaSemanalEmail.test.ts](../src/lib/notifications/workflows/rutaSemanalEmail.test.ts) | Refactorizado/ajustado |
| [src/lib/offline/asignacionIndexedDB.ts](../src/lib/offline/asignacionIndexedDB.ts) | Refactorizado/ajustado |
| [src/lib/offline/offlineAttendanceFlow.test.ts](../src/lib/offline/offlineAttendanceFlow.test.ts) | Refactorizado/ajustado |
| [src/lib/operations/reportWindow.ts](../src/lib/operations/reportWindow.ts) | Refactorizado/ajustado |
| [src/lib/pwa/serviceWorkerStrategies.test.ts](../src/lib/pwa/serviceWorkerStrategies.test.ts) | Refactorizado/ajustado |
| [src/lib/storage/directR2Client.test.ts](../src/lib/storage/directR2Client.test.ts) | Refactorizado/ajustado |
| [src/middleware.ts](../src/middleware.ts) | Refactorizado/ajustado |
| `src/tmp-type-check.ts` | Fuera del código activo |
| `src/trigger_july_import.test.ts` | Fuera del código activo |
| [src/middleware.test.ts](../src/middleware.test.ts) | Nuevo |
| [tests/audit-log-integrity.spec.ts](../tests/audit-log-integrity.spec.ts) | Refactorizado/ajustado |
| [tests/bitacora-panel.spec.ts](../tests/bitacora-panel.spec.ts) | Refactorizado/ajustado |
| [tests/empleados-panel.spec.ts](../tests/empleados-panel.spec.ts) | Refactorizado/ajustado |
| [tests/pdvs-panel.spec.ts](../tests/pdvs-panel.spec.ts) | Refactorizado/ajustado |
| [tests/planeacion-mensual.spec.ts](../tests/planeacion-mensual.spec.ts) | Refactorizado/ajustado |
