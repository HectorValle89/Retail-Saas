# Repository Instructions

## Canonical Spec

La fuente de verdad del producto en este repositorio es exclusivamente:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

## Working Rule

Antes de planear, implementar, reconciliar backlog o cerrar una iteracion, consulta las secciones relevantes de esos tres archivos.

Si cualquier otro documento del repositorio entra en conflicto con ellos, prevalece `.kiro/specs/field-force-platform/`.

## Change Analysis and Replacement Rule

Desde este punto, cualquier cambio solicitado que toque logica de negocio, backend, frontend o UX/UI debe tratarse como una sustitucion controlada de funcionalidad existente, no como un parche local.

Antes de editar codigo, el agente debe completar y comunicar un analisis minimo que incluya:

1. Como funciona actualmente la funcionalidad afectada.
2. Que cambio se solicita exactamente.
3. Que impacto tendra el cambio en comportamiento, contratos, datos, UI, permisos, sincronizacion, pruebas y modulos relacionados.
4. Que dependencias aguas arriba y aguas abajo pueden verse afectadas.
5. Que skill(s) locales aplican al cambio y se activaran para ejecutarlo con criterio estructural.

Reglas obligatorias de ejecucion:

- No implementar cambios relevantes a ciegas ni sobre suposiciones si el comportamiento actual puede inspeccionarse en el repo.
- No resolver solicitudes con parches aislados cuando el cambio exige reemplazar, extender o reencadenar una funcionalidad existente.
- El agente debe investigar el radio de impacto antes de editar: componentes, actions, services, librerias, rutas, migraciones, seeds, pruebas, scripts y documentacion derivada relacionados.
- Si el cambio altera una funcionalidad existente, debe dejarla coherente end-to-end en sus superficies criticas, no solo en el punto puntual donde se detecto el sintoma.
- Si una skill local aplica, debe declararse y usarse como parte del enfoque del cambio, no solo mencionarse al final.
- Antes de cerrar el corte, el agente debe validar las superficies afectadas de manera proporcional al riesgo del cambio para reducir regresiones sobre lo ya implementado.

Si el analisis revela consecuencias no obvias, riesgo de regresion amplio o necesidad de cambiar contratos existentes, el agente debe pausar y explicitar ese impacto antes de continuar con la implementacion.

## UTF-8 Rule

Los tres documentos canonicos ya estan almacenados en UTF-8 valido. Si PowerShell o la terminal muestran mojibake al leerlos, tratalo como un problema de render de consola, no como corrupcion del archivo.

Cuando necesites inspeccionarlos o reconciliarlos, usa lectura UTF-8 segura y evita asumir corrupcion solo por la salida de `Get-Content`.

Esta regla es irrompible: cualquier agente que edite documentos, migraciones, seeds o configuracion debe preservar UTF-8 sin BOM y line endings LF.

Antes de cerrar una iteracion que toque esos archivos, el agente debe ejecutar `npm run docs:check-encoding` y corregir cualquier hallazgo antes de continuar.

Queda prohibido usar flujos de edicion que reserialicen texto sin control de encoding, especialmente `Get-Content ... | Set-Content ...` sobre archivos sensibles; para cambios manuales se debe preferir edicion controlada que preserve UTF-8.

Ademas, todo clon local de trabajo debe instalar el hook versionado del repositorio con `npm run hooks:install` para activar `.githooks/pre-commit` como barrera previa al commit.

## Derived Documents

Los siguientes archivos son derivados y deben mantenerse alineados con la especificacion canonical, nunca reemplazarla:

- `task.md`
- `README.md`
- `AGENT_HISTORY.md`

## Task Integrity Rule

`task.md` es un documento derivado y frágil; no se debe editar ni marcar tareas como completas sin tener implementaciones verificables en código, migraciones, seeds o pruebas que respalden el cierre. Cuando haya que reconcilir, sigue estos pasos:

- Revisa el estado real (códigos comprometidos, migraciones aplicadas, pruebas ejecutadas y/o datos generados) antes de mover cualquier checkbox en `task.md`.
- Usa `npm run docs:check-encoding` antes y después de tocar el archivo para asegurarte de que no se corrompan los caracteres. No reemplaces el archivo entero ni lo rescribas con herramientas que podrían introducir BOM o CRLF.
- Si detectas discrepancia entre el código y `task.md`, documentala en `AGENT_HISTORY.md` y actualiza `task.md` solo después de reparar la implementación o confirmar bloqueos claros.
- Al terminar el corte, haz una revisión en bloque (`npm run docs:check-encoding` + `git diff .kiro/specs/field-force-platform/tasks.md`) y deja un comentario de reconciliación en `AGENT_HISTORY.md` antes de cerrar el esfuerzo.

Esta regla es irrompible: cualquier agente que detecte corrupción o dudas en `task.md` debe detenerse y alertar antes de continuar.

## Reconciliation Rule

Cuando se complete trabajo real en codigo, migraciones, seeds o pruebas:

1. Primero reconciliar `tasks.md` contra el estado real del repo.
2. Despues actualizar los documentos derivados necesarios.
3. No marcar tareas como completas si solo existe implementacion parcial o placeholder.

Como barrera conservadora, el hook local de `pre-commit` puede bloquear commits si `.kiro/specs/field-force-platform/tasks.md` marca items como completos pero no existen cambios staged de implementacion real en `src/`, `supabase/migrations/`, `supabase/seed.sql`, `scripts/`, `tests/`, `e2e/`, `public/` o `tools/`.

La regla debe mantenerse digerible: no bloquear reconciliaciones legitimas si no se estan marcando items nuevos como completos.

## Context Compact Rule

Si un agente percibe que la ventana de contexto se acerca a saturacion operativa, debe compactar antes de perder continuidad.

Regla practica:

1. Antes de continuar o cerrar el turno, reconciliar lo esencial en `task.md` y `AGENT_HISTORY.md`.
2. Dejar un resumen corto de estado real, decisiones tomadas, validaciones ejecutadas, bloqueos y siguiente corte logico.
3. Hacer la compactacion antes de entrar en zona de riesgo alta de contexto; objetivo operativo aproximado: no esperar a superar 95% si la continuidad ya esta en peligro.

La compactación se activa de forma preventiva: cuando el hilo se acerca al 95% de la ventana cognitiva (según la longitud acumulada de mensajes del agente), se debe generar y guardar un resumen breve en `task.md` y `AGENT_HISTORY.md` antes de producir más cambios, de modo que el siguiente agente pueda retomar sin perder trazabilidad. Ese resumen debe incluir: estado del backlog, validaciones locales (build, lint, tests ejecutados), bloqueos técnicos existentes y el siguiente paso recomendado.

## Local Skills Rule

Ademas de la especificacion canonica, todo agente que edite este repositorio debe revisar y aplicar las skills relevantes de `.claude/skills/` antes de hacer trabajo sustancial.

La carpeta `.claude/skills/` debe tratarse como el catalogo local completo de capacidades del repositorio. Las skills listadas abajo son obligatorias por tipo de cambio, pero no limitan el uso del resto del catalogo; si existe una skill local relevante en arquitectura, diseño, seguridad, debugging, performance, workflow o contexto, el agente debe integrarla al enfoque del cambio cuando aplique.

Regla operativa adicional:

- No reducir el uso de skills locales solo al subconjunto "obligatorio". Ese subconjunto es el minimo.
- Si un cambio tiene una dimension clara de diseño, arquitectura, seguridad, contexto visual, performance o ideacion, el agente debe revisar tambien las skills correspondientes dentro de `.claude/skills/` y declarar cuales usara.
- Si en un turno el usuario pide expresamente usar las skills del repo, el agente debe priorizar `.claude/skills/` por encima de heuristicas propias, salvo conflicto con la especificacion canonica.

Skills obligatorias por tipo de cambio:

- `09-encoding/utf8-standard`
  - Siempre que se lean o editen documentos, seeds, migraciones o archivos de configuracion.
- `05-code-review/typescript-strict-typing`
  - Siempre que se modifique tipado TypeScript, contratos de datos o clientes Supabase.
- `06-performance/offline-sync-patterns`
  - Siempre que se toque sincronizacion offline, IndexedDB o colas.
- `01-testing-tdd/pwa-service-worker`
  - Siempre que se toque PWA, manifest, service worker o estrategias de cache.
- `02-testing-e2e/playwright-testing`
  - Siempre que se agreguen o cambien flujos criticos de interfaz.
- `02-testing-e2e/tailwind-mobile-first`
  - Siempre que se modifiquen vistas moviles o compactas.
- `03-debugging/systematic-debugging`
  - Siempre que haya depuracion no trivial o regresiones sin causa clara.
- `06-performance/sql-indexing-strategy`
  - Siempre que se creen tablas, consultas nuevas o indices.

Si una skill aplica, no debe ignorarse. Si una skill entra en conflicto con `.kiro/specs/field-force-platform/`, prevalece la especificacion canonica y el conflicto debe documentarse.

## Pending Design Backlog - Motor de Asignacion Efectiva del Dia

Guardar este bloque como referencia operativa para futuros cortes de implementacion. No sustituye la especificacion canonica ni autoriza marcar tareas como completas sin codigo verificado.

### Objetivo

Centralizar la resolucion de la asignacion efectiva del dia para dermoconsejeras, enlazando:

- asignacion base
- cobertura temporal
- cobertura permanente
- vacaciones aprobadas
- incapacidades aprobadas
- justificaciones de falta aprobadas
- formaciones activas

La app debe responder una sola pregunta por `empleado + fecha`:

- `que le toca hoy`

### Regla general

- Si existe una excepcion operativa valida para el dia, esa excepcion se sobrepone a la asignacion estructural.
- Si no existe excepcion, se usa la asignacion estructural vigente.
- Si no existe ninguna asignacion vigente, el resultado es `SIN_ASIGNACION`.

### Naturalezas estructurales de asignacion

Mantener solo estas naturalezas en el motor estructural:

- `BASE`
- `COBERTURA_TEMPORAL`
- `COBERTURA_PERMANENTE`

### Prioridad operativa del dia

El resolvedor debe aplicar esta jerarquia exacta:

1. `FORMACION_ACTIVA`
2. `INCAPACIDAD_APROBADA`
3. `VACACIONES_APROBADAS`
4. `JUSTIFICACION_FALTA_APROBADA`
5. `COBERTURA_TEMPORAL`
6. `COBERTURA_PERMANENTE`
7. `BASE`
8. `SIN_ASIGNACION`

### Contrato unico esperado

El sistema debe exponer una salida unica por `empleado + fecha` equivalente a:

- `estadoOperativo`
- `origen`
- `pdvId`
- `supervisorEmpleadoId`
- `cuentaClienteId`
- `referenciaId`
- `horarioEsperadoId`
- `mensajeOperativo`

Estados operativos esperados:

- `FORMACION`
- `INCAPACIDAD`
- `VACACIONES`
- `FALTA_JUSTIFICADA`
- `ASIGNADA_PDV`
- `SIN_ASIGNACION`

Origenes esperados:

- `FORMACION`
- `INCAPACIDAD`
- `VACACIONES`
- `JUSTIFICACION`
- `COBERTURA_TEMPORAL`
- `COBERTURA_PERMANENTE`
- `BASE`
- `NINGUNO`

### Integracion por modulo

#### Dermoconsejo

- consultar solo la asignacion efectiva del dia
- si hay `FORMACION`, mostrar formacion como jornada principal
- si hay `INCAPACIDAD`, `VACACIONES` o `FALTA_JUSTIFICADA`, no mostrar tienda como jornada principal
- si no hay excepcion, mostrar el PDV resuelto

#### Solicitudes

- las solicitudes no deben reescribir asignaciones estructurales
- solo alteran el estado operativo cuando alcancen el estado de aprobacion requerido

#### Formaciones

- no deben modificar la base ni la cobertura
- solo sobreponen la operacion del dia

#### Asistencias

- deben calcularse desde la asignacion efectiva del dia
- si el estado es `FORMACION`, registrar asistencia de formacion
- si el estado es `INCAPACIDAD`, `VACACIONES` o `FALTA_JUSTIFICADA`, no generar falta normal
- si el estado es `ASIGNADA_PDV`, aplicar flujo normal de tienda

#### Reportes y Nomina

- deben consumir la misma resolucion diaria para evitar divergencias entre operacion, asistencia y pago

### Servicio tecnico esperado

Crear un resolvedor central, por ejemplo en:

- `src/features/asignaciones/services/asignacionResolverService.ts`

Funciones minimas esperadas:

- `resolverAsignacionEfectivaDia(empleadoId, fecha)`
- `resolverAsignacionesEfectivasPorFecha(fecha, filtros?)`
- `resolverAsignacionesEfectivasPorRango(fechaInicio, fechaFin, empleadoIds?)`

### Vista o tabla derivada recomendada

Evaluar una vista o tabla derivada `asignacion_diaria_resuelta` con:

- `fecha`
- `empleado_id`
- `estado_operativo`
- `origen`
- `pdv_id`
- `supervisor_empleado_id`
- `cuenta_cliente_id`
- `referencia_id`
- `horario_esperado_id`
- `resolved_at`

### Alertas esperadas del motor

- `DC_SIN_ASIGNACION`
- `PDV_LIBRE_POR_CAMBIO`
- `COBERTURA_TEMPORAL_POR_VENCER`
- `DC_CON_FORMACION_Y_TIENDA_DESPLAZADA`
- `DC_CON_VACACIONES_EN_DIA_LABORAL`
- `DC_CON_INCAPACIDAD_EN_DIA_LABORAL`

### Orden recomendado de implementacion

1. Normalizar `naturaleza` en `asignacion` a `BASE`, `COBERTURA_TEMPORAL`, `COBERTURA_PERMANENTE`.
2. Crear el resolvedor central del dia.
3. Integrar `solicitudes` y `formaciones` al resolvedor.
4. Reemplazar lecturas diarias en `dashboard` por el resolvedor.
5. Reemplazar calculo diario de `asistencias` por el resolvedor.
6. Bajar la misma resolucion a `reportes` y `nomina`.

## Pending Design Backlog - Exportacion XLSX del Calendario Operativo para Cliente

Guardar este bloque como referencia operativa para futuros cortes de refinamiento del export mensual del cliente. No sustituye la especificacion canonica ni autoriza marcar tareas como completas sin codigo verificado.

### Objetivo

Mantener un export XLSX de `calendario_operativo` orientado a cliente que combine:

- una hoja principal `calendario` con matriz mensual por dermoconsejera y por dia
- una hoja secundaria `resumen` con KPIs del mes y leyenda operativa
- lectura exclusiva desde `asignacion_diaria_resuelta` para evitar recalculos amplios

### Estructura vigente esperada

#### Hoja `calendario`

- columnas fijas operativas:
  - `CADENA`
  - `ID PDV`
  - `SUCURSAL`
  - `NOMBRE DC`
  - `# DC`
  - `ROL`
  - `SUPERVISOR`
  - `COORDINADOR`
  - `CIUDAD`
  - `ESTADO`
  - `HORARIO`
  - `DIAS`
  - `DESCANSO`
  - `OBSERVACIONES`
- una columna por dia del mes visible
- columnas resumen al final:
  - `# LAB`
  - `# INC`
  - `# VAC`
  - `# FORM`
  - `# JUST`
  - `# FAL`
  - `# SIN`
- leyenda visual inferior dentro de la misma hoja

#### Hoja `resumen`

- `Mes`
- `Dermoconsejeras visibles`
- `Cadenas visibles`
- `PDVs visibles`
- `Jornadas laborando`
- `Incapacidades`
- `Vacaciones`
- `Formaciones`
- `Faltas justificadas`
- `Faltas`
- `Sin asignacion`
- bloque de leyenda operativa para codigos diarios

### Codigos diarios esperados

- `1` = jornada laborando / asistencia valida
- `RET` = retardo
- `PEND` = pendiente de validacion
- `DES` = descanso
- `INC` = incapacidad aprobada
- `VAC` = vacaciones aprobadas
- `FOR` = formacion
- `JUS` = falta justificada
- `FAL` = falta
- `SIN` = sin asignacion

### Reglas de presentacion esperadas

- encabezado mensual fuerte en la franja del calendario
- fila de dias de semana visible
- bloques semanales visualmente diferenciados
- colores por estado operativo y por columnas resumen
- freeze pane sobre columnas fijas y cabecera del calendario
- la hoja `resumen` debe mantenerse simple, ejecutiva y facil de leer por cliente

### Reglas de performance esperadas

- el export no debe recalcular la operacion diaria en tiempo de descarga
- debe alimentarse desde `asignacion_diaria_resuelta`
- cualquier refinamiento futuro del XLSX debe mantenerse en la capa de presentacion (`reporteExport.ts`, endpoints XLSX, helpers de tema), no reabrir consultas del motor salvo necesidad real

### Siguiente refinamiento recomendado

1. agregar nombre de cuenta/cliente y fecha-hora de generacion en ambas hojas
2. aplicar branding ligero en la hoja `resumen`
3. si el cliente lo pide, agregar una tercera hoja opcional con detalle de observaciones por dermoconsejera y dia

## Pending Design Backlog - Agenda Operativa Dinamica de Supervision

Guardar este bloque como referencia de arquitectura para la evolucion del modulo `Ruta semanal`. No sustituye la spec canonica y no autoriza marcar tareas como completas sin codigo verificado.

### Objetivo

Evolucionar la ruta semanal de supervisores desde una planeacion estatica hacia una agenda operativa dinamica donde:

- `ruta_semanal` y `ruta_semanal_visita` siguen siendo la base aprobada por coordinacion
- el dia real puede sumar visitas adicionales o eventos extraordinarios
- un evento puede:
  - `SUMA`
  - `SOBREPONE_PARCIAL`
  - `REEMPLAZA_TOTAL`
- las visitas no realizadas se clasifican y pasan a bandeja de reposicion

### Entidades esperadas

- `ruta_agenda_evento`
  - eventos adicionales o extraordinarios del supervisor por fecha
  - con tipo, impacto, aprobacion y evidencia de ejecucion
- `ruta_visita_pendiente_reposicion`
  - visitas base no ejecutadas
  - clasificadas como `JUSTIFICADA` o `INJUSTIFICADA`

### Reglas operativas esperadas

1. La ruta aprobada sigue siendo el baseline.
2. `SUMA` agrega actividad sin desplazar visitas base.
3. `SOBREPONE_PARCIAL` desplaza solo visitas seleccionadas del dia.
4. `REEMPLAZA_TOTAL` desplaza toda la ruta aprobada del dia.
5. Toda visita desplazada por una sobreposicion aprobada debe pasar a reposicion `JUSTIFICADA`.
6. Toda visita pasada no ejecutada sin causa operativa aprobada debe quedar en reposicion `INJUSTIFICADA`.
7. La comparacion de cumplimiento debe distinguir:
   - planeadas
   - ejecutadas
   - pendientes justificadas
   - pendientes injustificadas

### Servicio tecnico esperado

- `src/features/rutas/services/rutaAgendaService.ts`
  - resolvedor diario para supervisor
  - clasificacion de pendientes
  - comparacion entre ruta base y agenda real

### Superficies a mantener alineadas

- `src/features/rutas/services/rutaSemanalService.ts`
- `src/features/rutas/actions.ts`
- `src/features/rutas/components/RutaSemanalPanel.tsx`
- `src/features/rutas/components/SupervisorTodayRouteSheet.tsx`
- dashboard del supervisor y war room de coordinacion

### Siguiente corte recomendado

1. llevar la agenda resuelta del dia a `SupervisorTodayRouteSheet`
2. permitir check-in y check-out de eventos extraordinarios desde `Mi ruta hoy`
3. reprogramar pendientes de reposicion directamente dentro de la planeacion de la semana siguiente

## Operational Reference - Padrón actual ISDIN y primer acceso

Guardar este bloque como referencia de continuidad para futuros cortes relacionados con empleados actuales y carga de expedientes. No sustituye la spec canonica.

### Estado real implementado

- El padrón actual de empleados ISDIN se importa desde `INFORMACION PERSONAL AL 25 DE MARZO.xlsx` usando `scripts/import-current-isdin-employees.cjs`.
- La importacion es idempotente y actualiza:
  - `empleado`
  - `usuario`
  - `auth.users`
- Todos los empleados importados quedan con:
  - acceso `PROVISIONAL`
  - `cuenta_cliente_id` de `isdin_mexico`
  - snapshot del origen en `empleado.metadata.onboarding_inicial`
  - `primer_acceso.required = true`

### Flujo esperado de primer acceso

1. El empleado entra con `username` provisional y password temporal.
2. El sistema lo manda al flujo de activacion (`/activacion`) para registrar/verificar correo.
3. Al definir contrasena final, si el padrón inicial exige revision, el sistema redirige a `/primer-acceso`.
4. En `/primer-acceso` el empleado ve sus datos actuales y debe:
   - confirmar que son correctos
   - o solicitar correccion
5. Solo despues puede entrar al dashboard.

### Trazabilidad y correcciones

- La confirmacion o correccion de primer acceso se guarda en `empleado.metadata.onboarding_inicial.primer_acceso`.
- Si el empleado solicita correccion, el sistema genera `mensaje_interno` para `ADMINISTRADOR` y `RECLUTAMIENTO` y registra evento en `audit_log`.

### Siguiente corte recomendado

1. crear carga de expedientes actuales sobre el mismo padrón ya importado
2. agregar una bandeja administrativa para correcciones de primer acceso
3. si operacion lo requiere, generar un export mas formal de credenciales provisionales por lote
