# ADR 0003: Planeación mensual, asignación efectiva y cuotas diarias

## Estado

Aceptado - 2026-08-23

## Contexto

La operación necesita editar asignaciones con fecha efectiva desde una matriz mensual y reflejar el
cambio tanto en las fuentes estructurales como en la resolución diaria, asistencias, jerarquía,
formularios y reportes. Editar únicamente la tabla derivada perdería la causa del cambio; editar sólo
la asignación base dejaría inconsistentes los consumidores diarios. Además, las cuotas individuales
deben representar los días realmente trabajados en cada PDV y no redistribuciones ficticias.

## Decisión

Adoptar un modelo de comandos temporales en lote. La UI envía operaciones tipadas con vista previa,
fecha efectiva, idempotency key y versión base. Una transacción PostgreSQL modifica vigencias y
eventos, valida que ninguna DC tenga dos PDVs el mismo día, recalcula únicamente el rango afectado y
publica un outbox post-commit. `asignacion_diaria_resuelta` continúa siendo la lectura canónica del
día, pero toda edición desde la matriz impacta su fuente y su proyección de forma atómica.

La matriz se alimenta de `planeacion_mensual_snapshot_fila`, una consulta general por cuenta y mes
cacheada por versión. Los detalles se solicitan bajo demanda y no habrá polling ni renovación por
foco. Los cambios invalidan solamente cuenta y meses impactados.

La cuota mensual se desglosa en `cuotas_diarias_pdv`. La Cuota Individual de una DC es la suma de los
importes diarios para los días en que trabajó efectivamente en ese PDV. Ausencias y vacantes dejan la
cuota del día sin atribuir, salvo que exista una cobertura efectiva.

Las incapacidades quedan reducidas a `I = INICIAL` e `IS = SUBSECUENTE`, según la clasificación que la
persona receptora registra del formato médico. Se retiran `IP/ISP` y cualquier inferencia por duración,
continuidad o pago.

## Consecuencias

**Positivas:**

- La matriz puede liberar, mover o asignar una DC sin romper la trazabilidad aguas arriba y abajo.
- Los cambios futuros conservan historia y los conflictos se rechazan antes del commit.
- Planeación, Asistencias, Reportes y Nómina comparten una sola resolución diaria.
- Una carga mensual requiere una consulta compacta cacheable y los detalles permanecen diferidos.
- La cuota individual refleja trabajo real; la falta de cobertura queda visible.

**Negativas:**

- Se agregan tablas de vigencia, lotes, snapshots y outbox que requieren mantenimiento incremental.
- La transacción de aplicación es más compleja y necesita pruebas de concurrencia e idempotencia.
- Los registros históricos `IP/ISP` requieren traducción controlada o conservación sólo como legado.

**Alternativas consideradas:**

1. Editar directamente `asignacion_diaria_resuelta`: rechazada porque elimina la causa estructural y
   sería sobrescrita por el siguiente materializado.
2. Recalcular todo el mes después de cada cambio: rechazada por latencia, lecturas y costo.
3. Redistribuir automáticamente cuotas de ausencias: rechazada porque atribuye metas a personas que
   no necesariamente cubrieron el PDV.
4. Refrescar la matriz cada cierto intervalo: rechazada porque genera lecturas incluso sin cambios.

## Referencias

- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/tasks.md`
- `supabase/migrations/20260823100000_incapacidad_clasificacion_simple.sql`
- `supabase/migrations/20260823110000_planeacion_mensual_fundacion.sql`
