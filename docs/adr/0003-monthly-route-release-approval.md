# ADR 0003: Liberación y aprobación masiva de rutas por mes

- Estado: Aceptado
- Fecha: 2026-08-28
- Alcance: Ruta semanal de supervisores

## Contexto

La aprobación mensual existente estaba ubicada debajo del calendario y actualizaba cada ruta en un
ciclo independiente. No existía una liberación mensual para retirar rutas publicadas de ejecución,
devolverlas a edición y solicitar su reenvío. Ese enfoque aumentaba el tiempo operativo, los
round-trips, las notificaciones repetidas y el riesgo de un resultado parcial.

## Decisión

Las dos acciones vivirán en la cabecera del calendario mensual y usarán
`rpc_gestionar_rutas_mes`. La misma función sirve como previsualización sin escritura y como
ejecución transaccional, comparando la cantidad elegible para detectar cambios concurrentes.

`LIBERAR` transforma exclusivamente rutas `PUBLICADA` sin ejecución a
`BORRADOR + CAMBIOS_SOLICITADOS`. Conserva sus visitas planeadas, limpia solicitudes puntuales
anteriores y las retira de las superficies que sólo consumen rutas aprobadas.

`APROBAR` transforma exclusivamente rutas `BORRADOR + PENDIENTE_COORDINACION`, con visitas
planeadas y sin una solicitud puntual pendiente, a `PUBLICADA + APROBADA`.

Las rutas en progreso, cerradas, completamente pasadas o con visitas completadas no son elegibles.
Una ruta semanal que cruza el límite del mes cambia como unidad completa y se declara en la
previsualización.

## Permisos y trazabilidad

ADMINISTRADOR y COORDINADOR pueden ejecutar ambas acciones dentro de su cuenta. La RPC sólo es
invocable con `service_role`, valida usuario, rol y cuenta, audita cada ruta modificada y no expone
escritura directa al navegador.

## Rendimiento

La operación reemplaza N lecturas, N actualizaciones y N auditorías secuenciales por una
previsualización bajo demanda y una única transacción set-based. La resolución de destinatarios se
hace en una consulta y se envía una sola notificación por supervisor y operación.
