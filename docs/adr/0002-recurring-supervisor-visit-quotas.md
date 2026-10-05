# ADR 0002: Cuotas recurrentes de visita por supervisor y PDV

## Estado

Aceptado - 2026-08-15

## Contexto

Las cuotas mensuales de visitas estaban guardadas dentro de `ruta_semanal.metadata`. Esto repetía la
misma configuración entre semanas, ligaba la cuota a la existencia de una ruta y permitía que una
revisión semanal sobrescribiera accidentalmente el objetivo mensual. Operación necesita que la cuota
vigente se herede indefinidamente a los meses siguientes y que un cambio posterior no reescriba el
histórico anterior.

## Decisión

Crear `ruta_cuota_supervisor_pdv` como fuente canónica de cuotas de visita. Cada registro representa
una versión efectiva para `cuenta + supervisor + PDV`, con `vigente_desde` al primer día del mes y
`vigente_hasta` nulo mientras siga activa.

Los cambios se guardan mediante una función SQL transaccional que cierra la versión anterior e inserta
o actualiza la versión del mes efectivo. La lectura mensual obtiene únicamente el intervalo que cubre
el mes solicitado. `ruta_semanal.metadata.pdvMonthlyQuotas` se conserva sólo como fallback de
compatibilidad y fuente de backfill inicial; deja de ser la fuente de verdad.

ADMINISTRADOR y COORDINADOR pueden gestionar las cuotas recurrentes desde la aplicación. La
aprobación de rutas semanales continúa siendo exclusiva de COORDINADOR.

## Consecuencias

**Positivas:**

- Una cuota se hereda a todos los meses futuros hasta que exista una nueva versión.
- Los cambios de septiembre no alteran el valor histórico de agosto.
- La configuración ya no crea rutas vacías ni depende de una semana específica.
- War Room, cobertura, alcance y ranking consumen una sola fuente recurrente.
- La carga agrega una consulta acotada, indexada y cacheada; no existe lectura por fila.

**Negativas:**

- Se agrega una tabla histórica y una consulta al cargar el War Room administrativo.
- Durante la transición debe mantenerse lectura fallback del metadata legado.

**Alternativas consideradas:**

1. Copiar cuotas a cada mes futuro: rechazada por crecimiento indefinido y necesidad de actualizar
   muchos meses ante cada cambio.
2. Mantener la cuota en `ruta_semanal.metadata`: rechazada porque mezcla configuración permanente con
   ejecución semanal y duplica el dato.
3. Guardar sólo el último valor sin vigencia: rechazada porque impediría reconstruir cuotas históricas.

## Referencias

- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/design.md`
- `supabase/migrations/20260815180000_ruta_cuota_supervisor_pdv_vigencia.sql`
