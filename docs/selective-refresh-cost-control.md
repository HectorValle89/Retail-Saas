# Actualizacion selectiva y control de costo

## Objetivo

La app debe mantener la misma experiencia operativa, pero dejar de recomputar modulos completos cuando no hubo cambios reales.

La regla base es:

1. cada pantalla carga un snapshot inicial;
2. cada superficie viva escucha cambios sobre `ui_change_version`;
3. si no cambia la version, no hay refetch;
4. si cambia la version, solo se refresca la superficie afectada;
5. las escrituras publican invalidaciones selectivas por modulo, surface y scope;
6. `router.refresh()` deja de ser el mecanismo por defecto para sincronizacion operativa.

## Infraestructura base

### Tabla de control

- `public.ui_change_version`

Llaves semanticas:

- `module`
- `surface`
- `scope_key`
- `role_target`

Scope keys normalizados:

- `global`
- `cuenta:<uuid>`
- `empleado:<uuid>`
- `supervisor:<uuid>`
- `pdv:<uuid>`
- `periodo:<yyyy-mm>`

### Publicacion de invalidaciones

Toda escritura de negocio debe usar:

- `publishUiChange(change)`
- `publishUiChanges(changes[])`
- `buildUiChangeTargetsFromBusinessEvent(...)`

Ninguna escritura nueva debe refrescar rutas completas “por si acaso”.

### Lecturas y cache

Toda lectura server-side nueva o modificada debe:

- declarar tags por modulo;
- reutilizar `unstable_cache` cuando el dato sea cacheable;
- invalidar solo los tags afectados;
- cargar primero el resumen visible y diferir el detalle.

Taxonomia minima de tags:

- `module:<name>`
- `module:<name>:cuenta:<id>`
- `module:<name>:empleado:<id>`
- `module:<name>:supervisor:<id>`
- `module:<name>:periodo:<yyyy-mm>`

## Regla de UI viva

Toda superficie cliente que necesite reaccionar a cambios debe usar:

- `useUiChangeSubscription(...)`
- `useVersionedRefetch(...)`
- `useScopedWidgetData(...)`

Politica:

- no escuchar tablas operativas grandes directamente;
- escuchar `ui_change_version`;
- hacer refetch parcial solo si cambia la version;
- si la pagina no esta visible, diferir el refetch hasta recuperar foco.

## Regla de implementacion futura

Toda nueva pantalla o modulo debe declarar:

- snapshot inicial;
- surfaces que expone;
- scopes que observa;
- tags que usa;
- eventos que la invalidan.

Toda nueva escritura debe declarar:

- que targets publica;
- que tags invalida;
- que widgets o surfaces deben refrescarse.

## Primer corte implementado

Este baseline ya quedo integrado en:

- `dashboard`
  - cache server-side con tags
  - endpoints parciales `/api/dashboard/panel` y `/api/dashboard/insights`
  - refresco cliente por `ui_change_version`
- escrituras operativas iniciales
  - `asistencias`
  - `love-isdin`

## Siguiente ola recomendada

1. `usuarios`
2. `configuracion`
3. `reportes`
4. `empleados`
5. `nomina`
6. `materiales`

Cada modulo debe migrarse de:

- refresh amplio,

a:

- shell server-side
- snapshot cacheado
- surfaces versionadas
- invalidacion selectiva por modulo/scope
