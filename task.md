# Proyecto Retail - Backlog Ejecutivo

Archivo ejecutivo unico del proyecto, alineado a:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

## Decisiones de negocio confirmadas

- Check-in fuera de geocerca: permitido con justificacion.
- Radio de geocerca por defecto: 100 metros.
- Operacion ejecutiva: una sola planeacion y seguimiento centralizado en este archivo.

## Estado general

- Fase activa: Fundacion tecnica.
- Estado: En progreso.
- Objetivo actual: cerrar esquema inicial Supabase, base multi-tenant y arranque de auth/estructura maestra.

## Plan ejecutivo

### P0 - Fundacion tecnica

- [x] Eliminar el dominio heredado del repositorio y dejar base semantica retail.
- [x] Reorientar navegacion, entry points, tipos base y seed placeholder al dominio retail.
- [x] Resolver ambiguedades criticas de geocerca con el usuario.
- [x] Crear migracion inicial de estructura maestra retail en `supabase/migrations`.
- [x] Ejecutar migracion inicial en Supabase.
- [ ] Validar RLS base con cuentas de prueba interna y rol CLIENTE.
- [ ] Crear seed inicial real para `cuenta_cliente`, `cadena`, `ciudad`, `mision_dia` y configuracion base.

### P1 - Auth y control de acceso

- [ ] Implementar `usuario` + estados de cuenta `PROVISIONAL`, `PENDIENTE_VERIFICACION_EMAIL`, `ACTIVA`, `SUSPENDIDA`, `BAJA`.
- [ ] Derivar permisos desde `puesto` como unica fuente de verdad.
- [ ] Inyectar claims JWT: `rol`, `cuenta_cliente_id`, `empleado_id`.
- [ ] Bloquear acceso operativo a cuentas no activadas.
- [ ] Preparar invalidacion de sesion en <= 5 minutos cuando cambie `puesto`.

### P1 - Estructura maestra

- [ ] Implementar modulo `empleados`.
- [ ] Implementar modulo `pdvs` con geocerca y supervisor.
- [ ] Implementar `cuenta_cliente` y asignacion historica de PDVs a clientes.
- [ ] Implementar `configuracion`, `regla_negocio` y `mision_dia`.

### P1 - Planeacion operativa

- [ ] Implementar `asignaciones`.
- [ ] Implementar validaciones de asignacion previas a publicacion.
- [ ] Implementar estados `BORRADOR` y `PUBLICADA`.

### P1 - Ejecucion diaria

- [ ] Implementar `asistencias` con GPS, selfie y justificacion fuera de geocerca.
- [ ] Implementar `ventas` ligadas a jornada activa.
- [ ] Preparar cola offline y sync base para PWA.

### P2 - Control y gobierno

- [ ] Implementar `nomina`, `ledger` y `cuotas`.
- [ ] Implementar `reportes`, `bitacora` y `ranking`.
- [ ] Implementar pruebas de integracion y property-based tests.

## Dependencias criticas

- El esquema Supabase debe existir antes de levantar modulos de negocio.
- Auth depende de `empleado`, `usuario` y claims JWT.
- `asignaciones` depende de `empleado`, `pdv`, `geocerca_pdv`, `supervisor_pdv` y configuracion.
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
- Se agrega migracion de sincronizacion de claims JWT hacia uth.users.
- Se agrega migracion base de signacion con RLS y estado BORRADOR/PUBLICADA.
- Se implementan primeras vistas funcionales de empleados, pdvs y signaciones con lectura desde Supabase y tolerancia a infraestructura pendiente.
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

