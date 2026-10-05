# ADR 0001: Modelo de Mes de Planificación de Rutas para Supervisores

- **Estado:** Aprobado
- **Fecha:** 2026-08-05
- **Autor:** Equipo Antigravity / Retail SaaS Platform

---

## Contexto

Anteriormente, los supervisores organizaban su secuencia de visitas a los puntos de venta (PDVs) mediante una planeación semanal aislada. Cada semana se programaba, guardaba y enviaba a revisión de forma independiente.

Operativamente, la coordinación y los clientes necesitan visibilidad previa de **todo el mes** para validar cuotas mensuales de visitas, asegurar que ninguna tienda quede sin cobertura y optimizar la logística con antelación.

---

## Decisión Arquitectónica

Adoptar un **Modelo de Mes de Planificación** para la planeación operativa de supervisores con las siguientes características:

1. **Compatibilidad Estructural:** Se mantiene el esquema físico de almacenamiento en las tablas `ruta_semanal` y `ruta_semanal_visita` indexadas por `semana_inicio` (Lunes ISO). Esto garantiza cero disrupción en el motor de asistencia diaria, check-in con selfie y reportes existentes.
2. **Contexto Mensual en la Capa de Negocio:** La capa de servicio (`rutaSemanalService.ts`) y las server actions (`actions.ts`) exponen operaciones agrupadas por **Mes de Planificación** (ej. `2026-09`).
3. **Clonación de Semana Patrón:** Se implementa la capacidad de armar una primera semana patrón y replicarla automáticamente a todas las semanas que componen el mes de planificación con un solo clic.
4. **Guardado y Envío en Lote Mensual:** El supervisor puede guardar el borrador del mes completo o enviarlo en lote a Coordinación.

---

## Consecuencias

### Positivas
- **Visibilidad Anticipada:** Coordinación y clientes conocen la agenda completa del mes antes de su inicio.
- **Productividad:** El supervisor reduce en un 80% el tiempo de captura manual al replicar semanas patrón en 1 clic.
- **Sin Cambios Rupturistas en Base de Datos:** Cero migraciones destructivas en tablas operativas.

### Mitigaciones
- Si una semana pertenece a dos meses calendario (semana traslapada), se asigna al mes donde cae el Lunes de esa semana, manteniendo la integridad del calendario operativo.
