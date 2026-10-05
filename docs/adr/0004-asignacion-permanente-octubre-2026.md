# ADR 0004: Modelo de Sustitución Estructural de Asignaciones Permanentes - Octubre 2026

- **Estado:** Aprobado y Aplicado
- **Fecha:** 2026-09-28
- **Autor:** Antigravity / Retail SaaS Platform

---

## Contexto

A partir del 1 de Octubre de 2026, la operación comercial de ISDIN México requería una nueva configuración integral de asignaciones fijas y rotativas en los puntos de venta (PDVs), transferencias de tiendas entre supervisores, e identificación de vacantes por cubrir.

El archivo maestro provisto por operaciones (`ASIGNACIÓN A PARTIR DE OCTUBRE.xlsx`) definió 268 puntos de venta operativos, 18 supervisores, 231 asignaciones activas (165 fijas y 66 rotativas de 33 colaboradoras con factor 0.5) y 37 tiendas por cubrir / vacantes.

---

## Decisión Arquitectónica

Se implementó una sustitución estructural controlada aguas arriba y aguas abajo que respeta el principio de integridad histórica y cableado permanente:

1. **Cierre Limpio de Historial:**
   - Todas las asignaciones vigentes de septiembre de 2026 se cerraron con `fecha_fin = '2026-09-30'`, protegiendo el 100% de la historia previa de asistencias, ventas, canjes y nómina de septiembre.
2. **Vigencia Permanente a partir de Octubre:**
   - Las 231 asignaciones activas se insertaron con `fecha_inicio = '2026-10-01'` y `fecha_fin = null` (permanente hasta nuevos cambios), estado `PUBLICADA` y naturaleza `BASE`.
3. **Reconciliación Tienda - Supervisor (`supervisor_pdv`):**
   - Los 268 puntos de venta quedaron vinculados a su supervisor de octubre desde el 01 de octubre de 2026 (incluyendo la corrección de Farmacia del Ahorro Polanco `BTL-FAH-POLA-HM` a Jacqueline López Ruiz).
4. **Perfil de Colaboradoras:**
   - Se actualizó el campo `supervisor_empleado_id` en las 198 dermoconsejeras asignadas para garantizar la cadena de mando directa y visibilidad en la app móvil.
5. **Cuotas de Visitas de Supervisores (`ruta_cuota_supervisor_pdv`):**
   - Se transfirieron y preservaron las cuotas mensuales de visitas hacia los nuevos supervisores designados a partir del 1 de octubre.
6. **Motor Diario Resuelto (`asignacion_diaria_resuelta`):**
   - Se materializaron los 31 días de octubre para cada colaboradora según su matriz de descansos (`DOMINGO`, `MIÉRCOLES`, `SÁBADO`) y días laborales (`LUN-SAB`, `LUN-MAR-MIE`, `JUE-VIE-SAB`, `JUE-MAR`).
7. **Snapshot de Planeación Mensual:**
   - Se refrescó la matriz mensual en `planeacion_mensual_snapshot` para consulta en tiempo real desde la ruta `/asignaciones?mes=2026-10`.

---

## Consecuencias

### Positivas
- **Sincronización End-to-End:** La plataforma, los reportes de ventas, canjes, desabastos, fidelización Love ISDIN y cuotas quedan perfectamente alineados al nuevo esquema operativo de octubre.
- **Rendimiento:** El snapshot y la matriz precalculada eliminan consultas N+1 en tiempo de render, manteniendo la navegación rápida e instantánea.
- **Cero Regresiones:** El cierre a septiembre 30 garantiza que las auditorías de nómina y asistencia pasadas no sufren ninguna alteración.
