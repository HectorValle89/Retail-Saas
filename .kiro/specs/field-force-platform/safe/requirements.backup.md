# Requirements Document

## Introduction

Field Force Platform es una plataforma de gestión de promotores de campo (field force management) que convierte la realidad operativa del campo en datos irrefutables. Resuelve cuatro problemas críticos del negocio: fraude y ausentismo, disputas de nómina, pérdida de información comercial, y cuotas injustas por rotación. La plataforma protege la rentabilidad del negocio, da transparencia al cliente y garantiza que el promotor que trabaja y vende cobre exactamente lo que merece.

La plataforma tiene tres actores principales: el **Promotor** (usuario de campo, app móvil), el **Gestor** (supervisor de zona o cuenta, dashboard web), y el **Administrador** (configuración, nómina, reportes).

---

## Glossary

- **DERMOCONSEJERO**: Usuario de campo (app móvil) que ejecuta visitas a PDVs, registra asistencia con GPS+selfie, reporta ventas diarias, registra incidencias y afiliaciones LOVE ISDIN, y monitorea su progreso de ventas y bonos.
- **SUPERVISOR**: Responsable directo de los DERMOCONSEJEROs. Valida o rechaza sin editar. Aprueba excepciones de asistencia, valida ventas y aprueba solicitudes de primer nivel. Registra visitas a tiendas con selfie obligatoria y checklist de calidad.
- **COORDINADOR**: Jefe de supervisores. Autoridad de segundo nivel: aprueba vacaciones, cambios de tienda, incidencias graves y rutas/visitas de supervisores.
- **RECLUTAMIENTO**: Administra el ciclo de vida laboral. Gestiona vacantes, candidatos y expedientes digitales con soporte OCR+IA. Envía expedientes a Nómina para alta ante IMSS. Formaliza incidencias autorizadas por operación.
- **NÓMINA**: Convierte información laboral en económica. Realiza altas/bajas ante IMSS, edita campos administrativos (ID nómina, sueldo base), cierra periodos de nómina y gestiona el Ledger para ajustes post-cierre.
- **LOGISTICA**: Gestiona envío de materiales a tiendas y control de activos prestados (tablets, uniformes, gafetes). Es notificada ante bajas para recuperar activos.
- **LOVE_IS**: Administra y audita el programa LOVE ISDIN. Supervisa afiliaciones en tiempo real, gestiona QR personales de DCs, monitorea metas y cuotas, y opera la bandeja de control antifraude.
- **VENTAS**: Consolida ventas reportadas y validadas. Opera el motor de cuotas individuales y calcula bonos de productividad al cierre de mes, enviando cifras al módulo de Nómina.
- **ADMINISTRADOR**: Acceso y visión total del sistema. Crea tiendas, productos y usuarios; asigna roles; verifica asignaciones; y es el único con acceso a la Caja Negra (bitácora inmutable de auditoría).
- **CLIENTE**: Rol de solo lectura asignado a los clientes que contratan a la agencia (ej. ISDIN u otras marcas). Puede existir más de un CLIENTE en el sistema simultáneamente. Cada usuario con rol CLIENTE está vinculado a una cuenta de cliente específica y accede únicamente a los PDVs, reportes y datos operativos asociados a esa cuenta; no puede ver ni acceder a datos de otras cuentas de cliente. Sin capacidad de edición ni operación.
- **Misión del Día**: Instrucción física aleatoria (ej. "Haz una V con los dedos", "Toca tu frente") que el sistema presenta al Promotor justo antes de capturar la selfie de check-in. Su propósito es antifraude: obliga al Promotor a interactuar en tiempo real frente a la cámara, impidiendo suplantación de identidad, uso de fotos de galería y reciclaje de imágenes anteriores. Las instrucciones se extraen del Catálogo de Misiones administrado por el ADMINISTRADOR.
- **Catálogo de Misiones**: Conjunto de instrucciones físicas configuradas por el ADMINISTRADOR desde las cuales el sistema selecciona aleatoriamente la Misión del Día para cada check-in.
- **Tarea de Visita**: Actividad de ejecución en campo asignada al Promotor durante una visita activa (foto de anaquel, conteo de inventario, encuesta, registro de precio). Las Tareas de Visita son distintas de la Misión del Día.
- **Check-in**: Registro de entrada validado por GPS y selfie al inicio de una visita.
- **Check-out**: Registro de salida al finalizar una visita, que requiere confirmación de ventas.
- **PDV**: Punto de Venta; tienda o sucursal donde opera el Promotor.
- **Periodo**: Ciclo de nómina (quincenal o mensual) con fecha de apertura y cierre.
- **Pre-nómina**: Cálculo en tiempo real de los ingresos acumulados del Promotor en el Periodo activo.
- **Ledger**: Libro de correcciones contables que registra ajustes post-cierre de Periodo sin alterar el historial fiscal.
- **Cuota**: Meta de ventas asignada a un PDV para un Periodo determinado.
- **Cuota Individual**: Porción de la Cuota del PDV asignada al Promotor activo en ese PDV durante el Periodo.
- **Cobertura**: Situación en que un Promotor visita un PDV distinto al que tiene asignado habitualmente.
- **Falta**: Ausencia registrada cuando no existe Check-in validado ni asignación de Cobertura para un día laboral.
- **Validación Biométrica**: Proceso de verificación de identidad mediante selfie comparada con foto de referencia.
- **Sistema**: La plataforma Field Force Platform en su conjunto.
- **App_Movil**: Componente móvil (iOS/Android) utilizado por el Promotor.
- **Dashboard**: Componente web utilizado por Gestores y Administradores.
- **Motor_Nomina**: Módulo interno que calcula Pre-nómina, aplica Ledger y genera reportes de nómina.
- **Motor_Cuotas**: Módulo interno que distribuye y ajusta Cuotas Individuales.
- **Validador_GPS**: Módulo interno que verifica coordenadas de Check-in contra la ubicación registrada del PDV.
- **Validador_Biometrico**: Módulo interno que compara la selfie del Check-in con la foto de referencia del Promotor.

---

## Requirements
### Requirement 0: Disciplina de Implementacion Asistida por Skills

**User Story:** Como dueno tecnico del repositorio, quiero que todo agente que modifique el proyecto use las skills locales relevantes de forma obligatoria, para estandarizar calidad, depuracion, pruebas, performance y manejo seguro de encoding.

#### Acceptance Criteria

1. THE Sistema de trabajo SHALL considerar `.claude/skills/` como biblioteca operativa obligatoria para agentes que editen este repositorio.
2. WHEN un agente trabaje sobre PWA, Service Worker, cache o instalacion offline, THEN THE agente SHALL consultar y aplicar `01-testing-tdd/pwa-service-worker`.
3. WHEN un agente trabaje sobre sincronizacion offline, IndexedDB o colas de reintento, THEN THE agente SHALL consultar y aplicar `06-performance/offline-sync-patterns`.
4. WHEN un agente trabaje sobre tipado TypeScript, clientes Supabase o contratos de datos, THEN THE agente SHALL consultar y aplicar `05-code-review/typescript-strict-typing`.
5. WHEN un agente trabaje sobre UI movil o vistas compactas, THEN THE agente SHALL consultar y aplicar `02-testing-e2e/tailwind-mobile-first`.
6. WHEN un agente agregue o modifique flujos criticos de interfaz, THEN THE agente SHALL consultar y aplicar `02-testing-e2e/playwright-testing`.
7. WHEN un agente depure un fallo no trivial o una regresion, THEN THE agente SHALL consultar y aplicar `03-debugging/systematic-debugging`.
8. WHEN un agente modifique migraciones, consultas intensivas o indices, THEN THE agente SHALL consultar y aplicar `06-performance/sql-indexing-strategy`.
9. WHEN un agente lea o edite documentos, migraciones, seeds o archivos sensibles a codificacion, THEN THE agente SHALL consultar y aplicar `09-encoding/utf8-standard`.
10. THE agente SHALL registrar en el historial del proyecto cualquier decision relevante que haya sido guiada por una skill cuando eso afecte arquitectura, performance, pruebas o reconciliacion.
11. WHEN un agente modifique documentos, migraciones, seeds o configuracion, THEN THE agente SHALL preservar UTF-8 sin BOM y saltos de linea LF.
12. BEFORE cerrar una iteracion que toque archivos sensibles a codificacion, THE agente SHALL ejecutar `npm run docs:check-encoding` y resolver cualquier hallazgo antes de reconciliar backlog o actualizar documentos derivados.
13. THE agente SHALL NOT usar flujos de edicion que reserialicen texto sin control de codificacion sobre archivos sensibles, incluyendo patrones tipo `Get-Content ... | Set-Content ...`.
14. WHEN un agente marque nuevos items como completos en `.kiro/specs/field-force-platform/tasks.md`, THEN THE agente SHALL respaldar ese cambio con trabajo real staged en codigo, migraciones, seeds, scripts o pruebas.
15. IF un agente detecta que la continuidad del trabajo corre riesgo por saturacion de contexto, THEN THE agente SHALL compactar el estado operativo en documentos derivados antes de continuar o cerrar el turno.

### Requirement 1: Check-in Validado con GPS y Biometría

**User Story:** Como Promotor, quiero registrar mi entrada a un PDV con validación de ubicación y selfie, para que mi asistencia sea irrefutable y no pueda ser suplantada.

#### Acceptance Criteria

1. WHEN el Promotor inicia un Check-in, THE App_Movil SHALL obtener del servidor la Misión del Día: una instrucción física aleatoria seleccionada del Catálogo de Misiones (ej. "Haz una V con los dedos", "Toca tu frente con la mano derecha"), y SHALL mostrarla al Promotor antes de activar la cámara.
2. WHEN el Promotor ejecuta la Misión del Día, THE App_Movil SHALL capturar la selfie directamente desde la cámara del dispositivo sin permitir seleccionar imágenes de la galería, e incrustar en la imagen un timestamp visible y las coordenadas GPS del momento de captura.
3. WHEN el Promotor envía el Check-in, THE Validador_GPS SHALL comparar las coordenadas capturadas contra el radio de tolerancia configurado para el PDV (por defecto 100 metros).
4. IF las coordenadas del Check-in están fuera del radio de tolerancia del PDV, THEN THE Sistema SHALL rechazar el Check-in y notificar al Promotor con la distancia de desviación en metros.
5. WHEN el Check-in es aceptado por el Validador_GPS, THE Validador_Biometrico SHALL comparar la selfie capturada con la foto de referencia del Promotor usando un umbral de similitud configurable.
6. IF la similitud biométrica está por debajo del umbral configurado, THEN THE Sistema SHALL rechazar el Check-in, registrar el intento fallido con timestamp, coordenadas y la Misión del Día presentada, y notificar al Gestor responsable.
7. WHEN el Check-in supera ambas validaciones, THE Sistema SHALL registrar el Check-in como válido con timestamp UTC, coordenadas exactas, hash de la selfie y la instrucción de Misión del Día que se presentó al Promotor.
8. WHILE el Promotor no tiene un Check-in válido activo, THE App_Movil SHALL impedir el acceso a las funciones de registro de ventas y ejecución de Tareas de Visita.
9. THE Sistema SHALL almacenar la evidencia fotográfica de cada Check-in durante un mínimo de 90 días.
10. THE ADMINISTRADOR SHALL poder gestionar el Catálogo de Misiones: crear, editar, activar y desactivar instrucciones físicas; el catálogo debe contener al menos 10 instrucciones activas para garantizar variabilidad.
11. THE Sistema SHALL garantizar que la Misión del Día presentada en un check-in sea diferente a la presentada en el check-in inmediatamente anterior del mismo Promotor en el mismo PDV.

---

### Requirement 2: Check-out con Confirmación de Ventas

**User Story:** Como Gestor, quiero que el Promotor confirme sus ventas antes de salir del PDV, para que ninguna información comercial se pierda y el cierre de visita sea completo.

#### Acceptance Criteria

1. WHEN el Promotor intenta iniciar un Check-out, THE App_Movil SHALL verificar que todas las Tareas de Visita obligatorias de la visita estén en estado completado o justificado.
2. IF existen Tareas de Visita obligatorias sin completar ni justificar, THEN THE App_Movil SHALL bloquear el Check-out y mostrar la lista de tareas pendientes al Promotor.
3. WHEN todas las Misiones están resueltas, THE App_Movil SHALL presentar al Promotor un resumen de las ventas registradas durante la visita para confirmación explícita.
4. WHEN el Promotor confirma las ventas y ejecuta el Check-out, THE Sistema SHALL registrar el Check-out con timestamp UTC y marcar la visita como cerrada.
5. THE Sistema SHALL calcular la duración de la visita como la diferencia entre el timestamp del Check-out y el timestamp del Check-in válido correspondiente.
6. IF el Promotor no ejecuta Check-out antes del horario límite configurado para el PDV, THEN THE Sistema SHALL registrar automáticamente un Check-out tardío y notificar al Gestor.

---

### Requirement 3: Tareas de Visita Dinámicas Anti-Reciclaje

**User Story:** Como Administrador, quiero asignar tareas de visita con contenido dinámico que cambie en cada visita, para eliminar el fraude por reciclaje de fotos o respuestas copiadas durante la ejecución en campo.

#### Acceptance Criteria

1. THE Administrador SHALL poder crear plantillas de Tarea de Visita con tareas de tipo: foto de anaquel, conteo de inventario, encuesta de preguntas, y registro de precio.
2. WHEN el Sistema genera las Tareas de Visita para una visita, THE Sistema SHALL seleccionar un subconjunto aleatorio de tareas de la plantilla según la configuración de variabilidad definida por el Administrador.
3. WHEN una Tarea de Visita requiere foto, THE App_Movil SHALL capturar la imagen directamente desde la cámara del dispositivo e incrustar metadata de timestamp y coordenadas GPS en el archivo.
4. IF el Sistema detecta que una imagen enviada en una Tarea de Visita no contiene metadata de cámara en vivo o tiene coordenadas inconsistentes con el Check-in activo, THEN THE Sistema SHALL marcar la tarea como sospechosa y notificar al Gestor.
5. THE Sistema SHALL registrar el timestamp de inicio y fin de cada Tarea de Visita individual dentro de una visita.
6. WHEN el Promotor completa todas las Tareas de Visita de una visita, THE Sistema SHALL calcular y almacenar el tiempo total de ejecución.

---

### Requirement 4: Registro de Asistencia y Cálculo de Faltas

**User Story:** Como Administrador, quiero que el sistema calcule automáticamente las faltas basándose en Check-ins validados, para eliminar disputas sobre asistencia.

#### Acceptance Criteria

1. THE Sistema SHALL considerar un día laboral como Falta cuando no existe un Check-in válido ni una asignación de Cobertura aprobada para el Promotor en ese día.
2. WHEN el Periodo cierra, THE Motor_Nomina SHALL consolidar el registro de asistencia de cada Promotor basándose exclusivamente en Check-ins válidos y Coberturas aprobadas.
3. THE Administrador SHALL poder configurar el calendario laboral por PDV, incluyendo días de descanso, festivos y horarios de operación.
4. WHEN un Gestor registra una Cobertura para un Promotor en un PDV distinto al habitual, THE Sistema SHALL requerir aprobación del Administrador antes de que la Cobertura elimine la Falta potencial.
5. IF un Promotor registra Check-in en un PDV diferente al asignado sin una Cobertura aprobada, THEN THE Sistema SHALL registrar la visita pero marcar el día como Falta en el PDV asignado y notificar al Gestor.
6. THE Sistema SHALL generar un reporte de asistencia por Promotor, por PDV y por Periodo, exportable en formato CSV.

---

### Requirement 5: Pre-nómina en Tiempo Real

**User Story:** Como Promotor, quiero ver mi pre-nómina acumulada en tiempo real, para saber exactamente cuánto voy a cobrar antes del cierre del Periodo.

#### Acceptance Criteria

1. THE Motor_Nomina SHALL recalcular la Pre-nómina de cada Promotor cada vez que se registre un Check-in válido, un Check-out, o una venta confirmada.
2. THE App_Movil SHALL mostrar al Promotor su Pre-nómina acumulada del Periodo activo, desglosada por: días trabajados, ventas confirmadas, bonos aplicables y deducciones por Faltas.
3. THE Dashboard SHALL mostrar al Gestor la Pre-nómina de todos los Promotores bajo su responsabilidad en una vista consolidada.
4. WHEN el Administrador cierra un Periodo, THE Motor_Nomina SHALL congelar los valores de Pre-nómina y generar el reporte de nómina definitivo en formato compatible con sistemas de pago externos (CSV, XLSX).
5. THE Motor_Nomina SHALL aplicar las reglas de cálculo configuradas por el Administrador, incluyendo: salario base diario, porcentaje de bono por cumplimiento de Cuota, y deducciones por Falta.
6. IF el Motor_Nomina detecta una inconsistencia en los datos de entrada durante el cálculo, THEN THE Sistema SHALL registrar la inconsistencia en un log de auditoría y excluir el registro afectado del cálculo hasta que sea resuelto.

---

### Requirement 6: Ledger de Correcciones Post-Cierre

**User Story:** Como Administrador, quiero un libro de correcciones que ajuste errores del Periodo anterior en el siguiente Periodo, para mantener la integridad fiscal sin alterar el historial cerrado.

#### Acceptance Criteria

1. WHEN el Administrador cierra un Periodo, THE Motor_Nomina SHALL marcar ese Periodo como inmutable; ningún registro de asistencia, venta o cálculo de ese Periodo podrá ser modificado.
2. THE Administrador SHALL poder crear entradas en el Ledger que referencien un Periodo cerrado, especificando: Promotor afectado, monto del ajuste (positivo o negativo), concepto, y Periodo de aplicación (siempre el Periodo activo o siguiente).
3. WHEN el Motor_Nomina calcula la Pre-nómina del Periodo activo, THE Motor_Nomina SHALL incluir todas las entradas del Ledger pendientes que correspondan a ese Periodo.
4. THE Sistema SHALL mantener trazabilidad completa de cada entrada del Ledger, registrando: usuario que la creó, timestamp de creación, Periodo de origen del error, y Periodo de aplicación.
5. THE Dashboard SHALL mostrar al Administrador un resumen del Ledger pendiente por Promotor antes del cierre de cada Periodo.
6. IF una entrada del Ledger supera el 30% del salario base mensual del Promotor afectado, THEN THE Sistema SHALL requerir una segunda aprobación de un Administrador distinto al que creó la entrada.

---

### Requirement 7: Tablero de Ventas en Tiempo Real

**User Story:** Como Gestor, quiero un tablero en tiempo real que muestre el estado de ventas por PDV y por Promotor, para identificar y actuar sobre problemas antes del cierre del día.

#### Acceptance Criteria

1. THE Dashboard SHALL actualizar los indicadores de ventas con una latencia máxima de 60 segundos desde que el Promotor confirma una venta.
2. THE Dashboard SHALL mostrar por cada PDV: Cuota del Periodo, ventas confirmadas acumuladas, porcentaje de cumplimiento, y Promotor activo en ese momento.
3. THE Dashboard SHALL mostrar por cada Promotor: estado de Check-in (activo/inactivo), PDV actual, ventas del día, y Misiones completadas vs. pendientes.
4. THE Gestor SHALL poder filtrar el tablero por zona geográfica, cuenta, PDV individual, y rango de fechas.
5. WHEN el porcentaje de cumplimiento de un PDV cae por debajo del umbral de alerta configurado (por defecto 70% a mitad del Periodo), THE Sistema SHALL enviar una notificación push al Gestor responsable.
6. THE Dashboard SHALL incluir un mapa con la ubicación en tiempo real de los Promotores con Check-in activo, actualizado con una latencia máxima de 120 segundos.

---

### Requirement 8: Gestión de Cuotas y Ajuste Automático por Cobertura

**User Story:** Como Promotor, quiero que mi meta individual se ajuste automáticamente cuando cubro otro PDV o cuando hay ausencias, para que mi bono refleje el trabajo real que hice.

#### Acceptance Criteria

1. THE Administrador SHALL poder asignar una Cuota a cada PDV para un Periodo determinado, expresada en unidades o valor monetario.
2. WHEN el Motor_Cuotas distribuye la Cuota de un PDV entre los Promotores que lo atendieron en el Periodo, THE Motor_Cuotas SHALL calcular la Cuota Individual de cada Promotor de forma proporcional a los días efectivamente trabajados en ese PDV.
3. WHEN un Promotor registra Cobertura en un PDV adicional durante el Periodo, THE Motor_Cuotas SHALL recalcular la Cuota Individual del Promotor sumando la porción proporcional de la Cuota del PDV cubierto.
4. WHEN un Promotor tiene una Falta registrada, THE Motor_Cuotas SHALL redistribuir la porción de Cuota correspondiente a ese día entre los Promotores que sí trabajaron en ese PDV ese día.
5. THE Motor_Cuotas SHALL garantizar que la suma de todas las Cuotas Individuales asignadas a un PDV en un Periodo sea igual a la Cuota total del PDV para ese Periodo.
6. THE Dashboard SHALL mostrar al Promotor y al Gestor el historial de ajustes de Cuota Individual con la justificación de cada cambio (cobertura, falta, ajuste manual).
7. IF el Administrador modifica manualmente la Cuota de un PDV durante un Periodo activo, THEN THE Motor_Cuotas SHALL recalcular todas las Cuotas Individuales afectadas y registrar el cambio en el log de auditoría.

---

### Requirement 9: Gestión de Usuarios y Roles

**User Story:** Como ADMINISTRADOR, quiero gestionar usuarios cuyos roles se derivan directamente del campo "puesto" en la base de datos de empleados, para que cada actor acceda solo a las funciones y datos que le corresponden sin duplicar información.

#### Acceptance Criteria

1. THE Sistema SHALL derivar el rol de cada usuario directamente del campo `puesto` del registro de empleado en la base de datos, sin mantener un campo de rol separado; los valores válidos son: DERMOCONSEJERO, SUPERVISOR, COORDINADOR, RECLUTAMIENTO, NÓMINA, LOGISTICA, LOVE_IS, VENTAS, ADMINISTRADOR y CLIENTE.

2. THE Sistema SHALL otorgar al rol DERMOCONSEJERO acceso exclusivo a: check-in/check-out con GPS y selfie, reporte de ventas diarias, registro de incidencias y desabastos, afiliaciones LOVE ISDIN, solicitud de vacaciones/permisos/incapacidades, y visualización de su propio progreso de ventas y proyección de bonos.

3. THE Sistema SHALL otorgar al rol SUPERVISOR acceso a: validación o rechazo (sin edición) de excepciones de asistencia y ventas capturadas, aprobación de solicitudes de primer nivel, planificación de ruta semanal de visitas, y registro de visita a tienda con selfie obligatoria y checklist de calidad.

4. THE Sistema SHALL otorgar al rol COORDINADOR acceso a: aprobación definitiva de vacaciones, cambios de tienda de un DERMOCONSEJERO, resolución de incidencias graves no resueltas por SUPERVISOR, y aprobación o rechazo de rutas y visitas de SUPERVISORES.

5. THE Sistema SHALL otorgar al rol RECLUTAMIENTO acceso a: gestión de vacantes, entrevistas y candidatos, creación y administración de expedientes digitales con soporte OCR+IA, envío de expedientes completos a NÓMINA para alta ante IMSS, gestión de bajas con checklist, y formalización en el sistema de incidencias autorizadas por operación.

6. THE Sistema SHALL otorgar al rol NÓMINA acceso a: recepción de expedientes validados por RECLUTAMIENTO, edición de campos administrativos (ID nómina externa y sueldo base), carga de comprobante IMSS en PDF, registro de bajas institucionales, monitoreo de pre-nómina, configuración de conceptos de pago y deducción, cierre de periodos de nómina, y uso del Ledger para ajustes post-cierre.

7. THE Sistema SHALL otorgar al rol LOGISTICA acceso a: envío de materiales a tiendas y verificación de confirmación de recepción, control de activos prestados (tablets, uniformes, gafetes), y recepción de notificaciones de baja para gestión de recuperación de activos.

8. THE Sistema SHALL otorgar al rol LOVE_IS acceso a: supervisión en tiempo real de afiliaciones capturadas por DERMOCONSEJEROs, administración de asignación de QR personales, monitoreo de metas diarias y cuotas mensuales del programa, bandeja de control antifraude, gestión de excepciones de afiliaciones observadas, y consulta de reportes y métricas del programa.

9. THE Sistema SHALL otorgar al rol VENTAS acceso a: consolidación de ventas reportadas y validadas, configuración del motor de distribución de cuota individual por DC según días activos y asignaciones diarias, cálculo de porcentaje de cumplimiento y bonos de productividad al cierre de mes, y envío automático de cifras al módulo de Nómina.

10. THE Sistema SHALL otorgar al rol ADMINISTRADOR acceso total al sistema, incluyendo: creación de tiendas y productos, creación de usuarios y asignación de roles, verificación de asignaciones mensuales y diarias por DC, y acceso exclusivo a la Caja Negra (bitácora inmutable de auditoría); el rol ADMINISTRADOR no ejecuta operaciones del día a día como aprobación de check-ins.

11. THE Sistema SHALL otorgar al rol CLIENTE acceso de solo lectura a reportes ejecutivos consolidados, incluyendo: asistencia, coberturas, evidencias fotográficas de visitas y desempeño comercial por PDV y por Periodo; el acceso SHALL estar estrictamente limitado a los PDVs y datos de la cuenta de cliente a la que pertenece el usuario; ningún usuario CLIENTE podrá ver datos de otra cuenta de cliente, y el Sistema SHALL rechazar con código 403 cualquier intento de acceso a datos fuera de su cuenta.

12. WHEN el campo `puesto` de un empleado es actualizado en la base de datos, THE Sistema SHALL actualizar los permisos de acceso del usuario correspondiente en un plazo máximo de 5 minutos.

13. WHEN un usuario intenta acceder a una función o dato fuera de los permisos de su rol, THE Sistema SHALL rechazar la solicitud con código de error 403 y registrar el intento en el log de auditoría.

14. WHEN la sesión de un usuario está activa y su `puesto` cambia a un rol con menores permisos, THE Sistema SHALL invalidar la sesión activa en un plazo máximo de 5 minutos.

---

### Requirement 10: Operación Offline de la App Móvil

**User Story:** Como Promotor, quiero poder registrar mis actividades aunque no tenga conexión a internet en el PDV, para que la falta de señal no afecte mi registro de asistencia ni mis ventas.

#### Acceptance Criteria

1. THE App_Movil SHALL permitir al Promotor ejecutar Check-in, registrar ventas y completar Misiones sin conexión a internet activa.
2. WHEN la App_Movil opera sin conexión, THE App_Movil SHALL almacenar todos los registros localmente con timestamp del dispositivo y marcarlos como pendientes de sincronización.
3. WHEN la App_Movil recupera conexión a internet, THE App_Movil SHALL sincronizar automáticamente todos los registros pendientes con el servidor en orden cronológico.
4. WHEN el servidor recibe registros sincronizados offline, THE Sistema SHALL validar el GPS y la biometría del Check-in usando los datos embebidos en el registro; IF la validación falla, THEN THE Sistema SHALL marcar el registro como inválido y notificar al Gestor.
5. THE App_Movil SHALL mostrar al Promotor el estado de sincronización (pendiente/sincronizado/error) para cada registro offline.
6. IF un registro offline no puede sincronizarse después de 3 intentos, THEN THE App_Movil SHALL notificar al Promotor y al Gestor con el detalle del error.

---

### Requirement 11: Auditoría e Integridad de Datos

**User Story:** Como Administrador, quiero un log de auditoría completo de todas las acciones críticas del sistema, para poder resolver disputas y cumplir con requerimientos legales.

#### Acceptance Criteria

1. THE Sistema SHALL registrar en el log de auditoría toda acción que modifique datos de asistencia, ventas, nómina o configuración, incluyendo: usuario que ejecutó la acción, timestamp UTC, entidad afectada, valor anterior y valor nuevo.
2. THE Sistema SHALL conservar el log de auditoría durante un mínimo de 2 años sin posibilidad de eliminación por parte de ningún rol de usuario.
3. THE Administrador SHALL poder consultar el log de auditoría filtrando por usuario, tipo de acción, entidad afectada y rango de fechas.
4. THE Sistema SHALL generar un hash de integridad para cada entrada del log de auditoría que permita detectar modificaciones no autorizadas.
5. WHEN el Sistema detecta que el hash de una entrada del log no coincide con el contenido almacenado, THE Sistema SHALL marcar esa entrada como comprometida y notificar al Administrador.

---

### Requirement 12: Reglas de Negocio Irrompibles

**User Story:** Como Administrador, quiero que el sistema haga cumplir automáticamente las reglas de negocio críticas de asignación, anti-fraude, asistencia, incapacidades, horarios y cuotas, para que ninguna operación pueda violarlas sin importar quién la ejecute.

#### Acceptance Criteria

**Asignación de PDV**

1. WHEN el Sistema procesa las asignaciones diarias, THE Motor_Cuotas SHALL garantizar que ningún DERMOCONSEJERO tenga más de un PDV asignado en el mismo día calendario.
2. THE Sistema SHALL permitir que dos o más DERMOCONSEJEROs trabajen en el mismo PDV el mismo día (modalidad de apoyo).
3. WHEN un DERMOCONSEJERO es reasignado a un PDV que pertenece a un SUPERVISOR distinto al actual, THE Sistema SHALL actualizar automáticamente la relación jerárquica del DERMOCONSEJERO al nuevo SUPERVISOR sin intervención manual.

**Anti-fraude y Evidencia**

4. THE App_Movil SHALL deshabilitar la opción de seleccionar imágenes desde la galería del dispositivo en todos los flujos que requieran captura de evidencia fotográfica.
5. WHEN la App_Movil captura una fotografía en cualquier flujo de evidencia, THE App_Movil SHALL incrustar un timestamp visible en la imagen antes de almacenarla o enviarla al servidor.
6. WHILE un DERMOCONSEJERO no tiene un Check-in válido activo en un PDV, THE App_Movil SHALL bloquear el registro de ventas y la ejecución de Tareas de Visita para ese PDV.
7. WHEN un DERMOCONSEJERO intenta ejecutar un Check-out, THE App_Movil SHALL verificar que exista al menos una venta confirmada en la visita activa; IF no existen ventas confirmadas, THEN THE App_Movil SHALL bloquear el Check-out y mostrar un mensaje indicando que se requiere al menos un registro de venta.

**Check-in con GPS Fallido**

8. IF el GPS del dispositivo no está disponible o no obtiene señal al momento del Check-in, THEN THE Sistema SHALL registrar el Check-in en estado PENDIENTE_VALIDACION en lugar de rechazarlo.
9. WHILE un Check-in está en estado PENDIENTE_VALIDACION, THE Sistema SHALL notificar al SUPERVISOR responsable para que revise la selfie de la Misión del Día y el contexto de la visita.
10. WHEN el SUPERVISOR revisa un Check-in en estado PENDIENTE_VALIDACION, THE Dashboard SHALL permitir al SUPERVISOR aprobarlo manualmente si la selfie es válida y el contexto lo justifica, o rechazarlo con motivo registrado.
11. IF un Check-in en estado PENDIENTE_VALIDACION no recibe aprobación manual del SUPERVISOR, THEN THE Sistema SHALL tratar ese Check-in como inválido para efectos de asistencia, ventas y Misiones.

**Incidencias que Anulan Faltas**

12. WHEN una incidencia de tipo vacaciones, incapacidad, permiso o cumpleaños es registrada en estado REGISTRADA para un DERMOCONSEJERO en fechas específicas, THE Motor_Nomina SHALL anular automáticamente cualquier Falta o Retardo registrado para esas fechas.
13. THE Sistema SHALL requerir que toda solicitud de incidencia siga el flujo de autorización jerárquica: el DERMOCONSEJERO crea la solicitud, el SUPERVISOR la aprueba en primer nivel, y el COORDINADOR la aprueba definitivamente.
14. WHEN un DERMOCONSEJERO solicita vacaciones o registra su día de cumpleaños, THE Sistema SHALL validar que la solicitud se realice con un mínimo de 30 días naturales de anticipación a la fecha de inicio; IF no se cumple el plazo, THEN THE Sistema SHALL rechazar la solicitud automáticamente con el motivo correspondiente.
15. THE Administrador SHALL poder configurar un catálogo de días feriados por año; THE Sistema SHALL tratar los días feriados configurados como días no laborables y no generará Faltas ni Retardos para ningún DERMOCONSEJERO en esas fechas.

**Flujo de Incapacidades**

16. WHEN un DERMOCONSEJERO crea una solicitud de incapacidad desde la App_Movil, THE App_Movil SHALL requerir obligatoriamente la selección de fechas de inicio y fin, y la captura de una fotografía del documento médico tomada en el momento (sin galería); al enviar, THE Sistema SHALL registrar la solicitud en estado ENVIADA y notificar al SUPERVISOR.
17. WHEN el SUPERVISOR recibe una solicitud de incapacidad en estado ENVIADA, THE Dashboard SHALL permitir al SUPERVISOR aprobarla (cambiando el estado a VALIDADA_SUP) o rechazarla con motivo en un plazo máximo de 24 horas; IF el SUPERVISOR rechaza la solicitud, THEN THE Sistema SHALL notificar al DERMOCONSEJERO para que corrija y reenvíe.
18. WHEN una incapacidad alcanza el estado VALIDADA_SUP, THE Sistema SHALL notificar al rol NÓMINA para que verifique el formato oficial del documento y formalice la incapacidad cambiando el estado a REGISTRADA_RH en un plazo máximo de 48 horas.
19. WHEN una incapacidad alcanza el estado REGISTRADA_RH, THE Motor_Nomina SHALL anular automáticamente todas las Faltas injustificadas y Retardos registrados para el DERMOCONSEJERO en las fechas cubiertas por la incapacidad.
20. WHEN el Motor_Nomina calcula el pago de una incapacidad, THE Motor_Nomina SHALL aplicar la siguiente lógica por bloque continuo de ausencia: los días 1 al 3 consecutivos del bloque se marcan como pagados al 100% del sueldo base (IP o ISP); el día 4 en adelante del mismo bloque continuo se marcan como justificados sin pago por parte de la empresa (I o IS).
21. IF un DERMOCONSEJERO presenta un nuevo folio de incapacidad sin haber registrado al menos una Asistencia Normal entre el folio anterior y el nuevo, y el folio anterior ya agotó los 3 días subsidiados, THEN THE Motor_Nomina SHALL marcar todos los días del nuevo folio directamente como IS (sin pago).
22. WHEN un DERMOCONSEJERO registra una Asistencia Normal después de un bloque de incapacidad, THE Motor_Nomina SHALL reiniciar el contador de días pagados, de modo que una incapacidad futura inicie un nuevo bloque con derecho a 3 días pagados.

**Horarios y Jerarquía de Resolución**

23. WHEN el Sistema resuelve el horario esperado de un DERMOCONSEJERO para un día específico, THE Sistema SHALL aplicar la siguiente jerarquía en orden descendente de prioridad: (1) Horario de Asignación Puntual o Evento especial del día, (2) Horario de Segmento de ruta, (3) Excepción de Tienda por Fecha específica, (4) Horario por Cadena y Día de la Semana, (5) Horario Estándar de la Cadena, (6) Horario Global de la agencia; el primer nivel que tenga un horario definido para ese día es el que aplica.
24. WHEN el Sistema resuelve el horario de un PDV perteneciente a la cadena San Pablo para un día específico, THE Sistema SHALL buscar el horario correspondiente al bloque semanal configurado por el Administrador para esa semana; IF no existe configuración para la semana actual, THEN THE Sistema SHALL aplicar el horario de la cadena o el global y generará una alerta inmediata al SUPERVISOR responsable.
25. IF el Administrador actualiza el horario de San Pablo a mitad de una semana en curso, THEN THE Sistema SHALL aplicar el cambio únicamente a los días futuros de esa semana; los días ya transcurridos de la misma semana conservarán el horario que tenían al momento del Check-in.
26. WHEN el Sistema resuelve el horario de un DERMOCONSEJERO para un día, THE Sistema SHALL tomar un snapshot inmutable del horario resuelto e inyectarlo en la asignación del día del DERMOCONSEJERO; la App_Movil SHALL comparar la hora real del Check-in y Check-out contra ese snapshot y, si supera la tolerancia configurada, SHALL levantar una bandera de Retardo o Salida Temprana en la bandeja del SUPERVISOR.

**Regla 3 Retardos = 1 Falta Administrativa**

27. THE Sistema SHALL mantener un contador mensual de Retardos confirmados (no justificados por el SUPERVISOR) por DERMOCONSEJERO, reiniciándolo automáticamente al inicio de cada mes calendario.
28. WHEN el contador de Retardos confirmados de un DERMOCONSEJERO alcanza 3 en el mismo mes calendario, THE Sistema SHALL generar automáticamente una Falta Administrativa con fecha del tercer Retardo y enviar alertas inmediatas al SUPERVISOR y al rol NÓMINA.
29. WHEN se genera una Falta Administrativa por acumulación de Retardos, THE Motor_Nomina SHALL aplicar el descuento equivalente a 1 día de salario base (o la penalización configurada en el módulo de Nómina) en la Pre-nómina del DERMOCONSEJERO afectado.
30. WHEN el SUPERVISOR o el rol NÓMINA solicita anular una Falta Administrativa generada por acumulación de Retardos, THE Sistema SHALL requerir autorización del COORDINADOR antes de procesar la anulación; IF el COORDINADOR aprueba, THEN THE Motor_Nomina SHALL revertir el descuento aplicado y registrar la anulación en el log de auditoría.

**Cuotas**

31. THE Motor_Cuotas SHALL garantizar en todo momento que la suma de las Cuotas Individuales de todos los DERMOCONSEJEROs asignados a un PDV en un Periodo sea igual a la Cuota total del PDV para ese Periodo; ninguna operación de asignación o ajuste podrá dejar el sistema en un estado que viole esta invariante.
32. WHEN un DERMOCONSEJERO tiene una incapacidad o vacaciones aprobadas para un día en que debía trabajar en un PDV, THE Motor_Cuotas SHALL redistribuir proporcionalmente la Cuota Individual correspondiente a ese día entre los DERMOCONSEJEROs que sí trabajaron en ese PDV ese día, sin reducir la Cuota total del PDV.
33. THE Motor_Cuotas SHALL calcular la Cuota total de un SUPERVISOR como la suma de las Cuotas de todos los PDVs que tiene asignados en el Periodo activo, actualizándola automáticamente cuando se agreguen o remuevan PDVs de su asignación.

---

### Requirement 13: Activación de Cuenta y Gestión de Credenciales

**User Story:** Como empleado nuevo, quiero activar mi cuenta con mis credenciales temporales y registrar mi correo electrónico, para poder acceder a la aplicación de forma segura y habilitar funciones como recuperación de contraseña y notificaciones.

#### Acceptance Criteria

**Creación de usuario provisional**

1. WHEN RECLUTAMIENTO da de alta a un nuevo empleado en el sistema, THE Sistema SHALL crear automáticamente un usuario en estado PROVISIONAL con una contraseña temporal generada aleatoriamente de al menos 10 caracteres alfanuméricos.
2. WHEN el Sistema crea un usuario en estado PROVISIONAL, THE Sistema SHALL registrar el timestamp de creación de la contraseña temporal y establecer su expiración en 72 horas a partir de ese momento.
3. THE Sistema SHALL notificar a RECLUTAMIENTO con las credenciales temporales generadas para que las distribuya al empleado por WhatsApp u otro canal fuera de banda.

**Control de acceso por estado de cuenta**

4. WHILE un usuario está en estado PROVISIONAL, THE Sistema SHALL permitir únicamente el acceso al flujo de activación de cuenta; el acceso a cualquier módulo operativo SHALL ser denegado con código 403.
5. WHILE un usuario está en estado PENDIENTE_VERIFICACION_EMAIL, THE Sistema SHALL permitir únicamente reenviar el correo de verificación o cambiar el correo electrónico ingresado; el acceso a cualquier módulo operativo SHALL ser denegado con código 403.
6. WHEN un usuario en estado PROVISIONAL o PENDIENTE_VERIFICACION_EMAIL intenta acceder a un módulo operativo, THE Sistema SHALL redirigir al usuario al flujo de activación correspondiente a su estado actual.

**Flujo obligatorio de activación en primer login**

7. WHEN un usuario en estado PROVISIONAL inicia sesión con credenciales temporales válidas, THE Auth_Service SHALL iniciar el flujo de activación de cuenta en lugar de otorgar acceso a la operación.
8. WHEN el flujo de activación inicia, THE Auth_Service SHALL requerir que el usuario ingrese una dirección de correo electrónico válida con formato estándar (RFC 5322).
9. WHEN el usuario ingresa un correo electrónico en el flujo de activación, THE Auth_Service SHALL verificar que el correo no esté ya registrado en el sistema; IF el correo ya existe, THEN THE Auth_Service SHALL rechazar el registro con un mensaje que indique que el correo ya está en uso.
10. WHEN el usuario envía un correo electrónico válido y disponible, THE Auth_Service SHALL enviar un correo de verificación con un link de un solo uso al correo proporcionado y cambiar el estado de la cuenta a PENDIENTE_VERIFICACION_EMAIL.

**Verificación de correo electrónico**

11. THE Auth_Service SHALL generar links de verificación de correo con expiración de 24 horas a partir del momento de envío.
12. WHEN el usuario hace clic en el link de verificación dentro del plazo de 24 horas, THE Auth_Service SHALL marcar el correo como verificado y solicitar al usuario que defina su contraseña definitiva.
13. IF el link de verificación ha expirado, THEN THE Auth_Service SHALL informar al usuario que el link no es válido y ofrecer la opción de solicitar un nuevo correo de verificación.
14. WHEN un usuario en estado PENDIENTE_VERIFICACION_EMAIL solicita reenvío del correo de verificación, THE Auth_Service SHALL invalidar el link anterior, generar uno nuevo con expiración de 24 horas y enviarlo al correo registrado.
15. WHEN un usuario en estado PENDIENTE_VERIFICACION_EMAIL solicita cambiar el correo ingresado, THE Auth_Service SHALL invalidar el link de verificación pendiente, actualizar el correo y enviar un nuevo link de verificación al correo actualizado.

**Definición de contraseña definitiva y activación**

16. WHEN el usuario define su contraseña definitiva tras verificar el correo, THE Auth_Service SHALL requerir que la contraseña cumpla con los criterios de seguridad configurados: mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número.
17. WHEN el usuario confirma su contraseña definitiva válida, THE Auth_Service SHALL cambiar el estado de la cuenta a ACTIVA, invalidar la contraseña temporal, y ligar el correo electrónico verificado al registro del empleado en el módulo de Empleados.
18. WHEN la cuenta alcanza el estado ACTIVA, THE Auth_Service SHALL otorgar al usuario acceso completo a los módulos operativos correspondientes a su rol derivado del campo `puesto`.

**Expiración de contraseña temporal**

19. IF un usuario en estado PROVISIONAL intenta iniciar sesión con una contraseña temporal cuyo plazo de 72 horas ha expirado, THEN THE Auth_Service SHALL rechazar el intento de login con un mensaje que indique que las credenciales han expirado y que debe contactar a RECLUTAMIENTO.
20. WHEN la contraseña temporal de un usuario en estado PROVISIONAL expira, THE Sistema SHALL notificar al rol RECLUTAMIENTO para que genere nuevas credenciales temporales.

**Ligado del correo al expediente del empleado**

21. WHEN la cuenta de un usuario alcanza el estado ACTIVA, THE Sistema SHALL actualizar el campo de correo electrónico en el expediente del empleado correspondiente en el módulo de Empleados con el correo verificado durante la activación.
22. THE Sistema SHALL mantener consistencia entre el correo registrado en el Auth_Service y el correo en el expediente del empleado; IF ocurre un error al actualizar el expediente, THEN THE Sistema SHALL registrar el fallo en el log de auditoría y notificar al ADMINISTRADOR para resolución manual.

**Recuperación de contraseña**

23. WHEN un usuario en estado ACTIVA solicita recuperación de contraseña, THE Auth_Service SHALL enviar un link de recuperación de un solo uso con expiración de 24 horas al correo electrónico verificado registrado en la cuenta.
24. IF un usuario en estado PROVISIONAL o PENDIENTE_VERIFICACION_EMAIL solicita recuperación de contraseña, THEN THE Auth_Service SHALL rechazar la solicitud e indicar al usuario que debe completar el flujo de activación de cuenta.

**Forzar reactivación por ADMINISTRADOR**

25. WHEN el ADMINISTRADOR fuerza la reactivación de una cuenta, THE Auth_Service SHALL generar una nueva contraseña temporal, cambiar el estado de la cuenta a PROVISIONAL, invalidar cualquier sesión activa del usuario, y registrar la acción en el log de auditoría con el identificador del ADMINISTRADOR que la ejecutó.
26. WHEN el ADMINISTRADOR fuerza la reactivación de una cuenta, THE Sistema SHALL notificar a RECLUTAMIENTO con las nuevas credenciales temporales para su distribución al empleado.

---

### Requirement 14: Validaciones de Asignación

**User Story:** Como ADMINISTRADOR, quiero que el sistema valide automáticamente las asignaciones mensuales antes de publicarlas y monitoree la operación en vivo, para que ninguna asignación inválida llegue al campo y los problemas operativos se detecten antes de que afecten la nómina.

#### Acceptance Criteria

**Errores de asignación (bloquean la publicación)**

1. WHEN el Sistema procesa una asignación, IF el PDV referenciado por `BTL_CVE` no existe en el catálogo de PDVs, THEN THE Sistema SHALL rechazar la asignación con error `PDV_INEXISTENTE` y bloquear su publicación.

2. WHEN el Sistema procesa una asignación, IF el empleado referenciado por `IDNOM` no existe en el catálogo de empleados, THEN THE Sistema SHALL rechazar la asignación con error `EMPLEADO_INEXISTENTE` y bloquear su publicación.

3. WHEN el Sistema procesa una asignación, IF el PDV referenciado tiene estatus INACTIVO en el catálogo de PDVs, THEN THE Sistema SHALL rechazar la asignación con error `PDV_INACTIVO` y bloquear su publicación.

4. WHEN el Sistema procesa una asignación, IF el empleado referenciado tiene estatus de baja en el catálogo de empleados, THEN THE Sistema SHALL rechazar la asignación con error `DC_DADO_DE_BAJA` y bloquear su publicación.

5. WHEN el Sistema procesa una asignación, IF el campo `puesto` del empleado referenciado no corresponde al rol DERMOCONSEJERO, THEN THE Sistema SHALL rechazar la asignación con error `DC_SIN_ROL_DC` y bloquear su publicación.

6. WHEN el Sistema procesa una asignación, IF el PDV referenciado no tiene geocerca completa (latitud, longitud y radio de tolerancia configurados), THEN THE Sistema SHALL rechazar la asignación con error `PDV_SIN_GEOCERCA` y bloquear su publicación.

7. WHEN el Sistema procesa una asignación, IF el PDV referenciado no tiene un supervisor válido y activo asignado, THEN THE Sistema SHALL rechazar la asignación con error `PDV_SIN_SUPERVISOR` y bloquear su publicación.

8. WHEN el Sistema procesa una asignación, IF el campo de días laborales tiene un formato inválido o contiene valores no reconocidos, THEN THE Sistema SHALL rechazar la asignación con error `DIAS_LABORALES_INVALIDOS` y bloquear su publicación.

9. WHEN el Sistema procesa una asignación, IF los días de descanso configurados se contradicen con los días laborales (ej. el día de descanso está marcado como día laboral), THEN THE Sistema SHALL rechazar la asignación con error `DESCANSOS_CONTRADICTORIOS` y bloquear su publicación.

10. WHEN el Sistema procesa un conjunto de asignaciones para el mismo DC en el mismo mes, IF dos o más asignaciones marcan el mismo día calendario como día laboral obligatorio para el mismo DC, THEN THE Sistema SHALL rechazar las asignaciones en conflicto con error `DOBLE_ASIGNACION_OBLIGATORIA` y bloquear su publicación.

11. WHEN el Sistema procesa una asignación para un PDV con cuota configurada, IF la cuota del PDV para el periodo está ausente o tiene un valor inválido (nulo, negativo o cero), THEN THE Sistema SHALL rechazar la asignación con error `CUOTA_INVALIDA` y bloquear su publicación.

**Alertas de asignación (publican pero notifican)**

12. WHEN el Sistema publica una asignación, IF el empleado asignado no tiene teléfono o correo electrónico registrado en su expediente, THEN THE Sistema SHALL publicar la asignación y generar una alerta `DC_SIN_CONTACTO` al ADMINISTRADOR y al SUPERVISOR responsable.

13. WHEN el Sistema publica una asignación, IF el radio de tolerancia de geocerca del PDV es menor a 50 metros o mayor a 300 metros, THEN THE Sistema SHALL publicar la asignación y generar una alerta `GEOCERCA_FUERA_DE_RANGO` al ADMINISTRADOR indicando el valor configurado.

14. WHEN el Sistema publica una asignación de tipo ROTATIVA, IF el DC tiene más de 3 PDVs asignados en la misma semana, THEN THE Sistema SHALL publicar la asignación y generar una alerta `ROTATIVA_SOBRECARGADA` al ADMINISTRADOR y al SUPERVISOR responsable.

15. WHEN el Sistema publica un conjunto de asignaciones para un DC, IF los días laborales configurados resultan en 7 días consecutivos sin descanso, THEN THE Sistema SHALL publicar las asignaciones y generar una alerta `SIN_DESCANSO_SEMANAL` al ADMINISTRADOR y al SUPERVISOR responsable.

16. WHEN el Sistema publica una asignación, IF el DC tiene una incapacidad activa aprobada que se solapa con el rango de fechas de la asignación, THEN THE Sistema SHALL publicar la asignación y generar una alerta `DC_CON_INCAPACIDAD_ACTIVA` al ADMINISTRADOR y al SUPERVISOR responsable.

17. WHEN el Sistema publica una asignación, IF el DC tiene vacaciones aprobadas en algún día del mes de la asignación, THEN THE Sistema SHALL publicar la asignación y generar una alerta `DC_CON_VACACIONES_APROBADAS` al ADMINISTRADOR y al SUPERVISOR responsable.

18. WHEN el Sistema publica una asignación para un PDV de la cadena San Pablo, IF el PDV no tiene horarios semanales cargados para el periodo de la asignación, THEN THE Sistema SHALL publicar la asignación y generar una alerta `PDV_SIN_HORARIOS_SAN_PABLO` al SUPERVISOR responsable.

**Avisos de cobertura (eficiencia operativa)**

19. WHEN el Sistema cierra el proceso de publicación de asignaciones de un mes, THE Sistema SHALL identificar todos los PDVs activos que no tienen ningún DC asignado en ese mes y generar un aviso `PDV_SIN_COBERTURA` al ADMINISTRADOR con la lista de PDVs afectados.

20. WHEN el Sistema cierra el proceso de publicación de asignaciones de un mes, THE Sistema SHALL identificar todos los DCs activos que no tienen ninguna asignación en ese mes y generar un aviso `DC_SIN_ASIGNACION` al ADMINISTRADOR con la lista de DCs afectados.

**Alertas de operación en vivo (post-publicación)**

21. WHEN un DC tiene una asignación activa en un PDV y no registra check-in después de transcurrido el tiempo de tolerancia configurado desde la hora de entrada esperada, THE Sistema SHALL generar una alerta `DC_SIN_CHECKIN` al SUPERVISOR responsable.

22. WHEN el Sistema detecta que un DC ha registrado check-in fuera de la geocerca del PDV asignado en 3 días consecutivos en el mismo PDV, THE Sistema SHALL generar una alerta `FUERA_DE_GEOCERCA_MASIVO` al SUPERVISOR y al ADMINISTRADOR.

23. WHEN el Sistema detecta que un PDV acumula retardos de check-in en más del 50% de los días del mes en curso, THE Sistema SHALL generar una alerta `RETARDOS_MASIVOS_PDV` al SUPERVISOR responsable indicando que el horario del PDV puede estar mal configurado.

24. WHEN la cola de sincronización offline de un DC tiene registros pendientes de sincronización por más de 48 horas y el DC tiene asignación activa en un PDV obligatorio, THE Sistema SHALL generar una alerta `COLA_OFFLINE_ATORADA` al SUPERVISOR y al ADMINISTRADOR.

**Reglas pospuestas para v2**

25. THE Sistema SHALL reservar en el modelo de datos los campos necesarios para implementar en v2 las siguientes validaciones: razón social incompatible entre DC y PDV, tipo de PDV incompatible con el perfil del DC, carta de acceso vigente requerida por la cadena, y densidad de rotación por zona; estas validaciones no se ejecutarán en v1 pero el modelo debe soportarlas sin migración de esquema.

---

### Requirement 15: Multi-tenancy de Cuentas de Cliente

**User Story:** Como ADMINISTRADOR, quiero gestionar múltiples cuentas de cliente en el mismo sistema con aislamiento total de datos, para que cada cliente vea únicamente su propia operación sin posibilidad de acceder a información de otros clientes.

#### Acceptance Criteria

**Modelo de cuenta de cliente**

1. THE Sistema SHALL soportar múltiples cuentas de cliente activas simultáneamente; cada cuenta de cliente es una entidad independiente con nombre, identificador único, PDVs asignados, usuarios asociados y configuración propia.

2. THE ADMINISTRADOR SHALL poder crear, editar, activar y desactivar cuentas de cliente desde el módulo de Configuración; al crear una cuenta, el ADMINISTRADOR SHALL poder asignarle un subconjunto de PDVs del catálogo maestro.

3. THE Sistema SHALL permitir que un PDV esté asignado a una sola cuenta de cliente a la vez; si el ADMINISTRADOR intenta asignar un PDV ya vinculado a otra cuenta, THE Sistema SHALL mostrar una advertencia y requerir confirmación explícita antes de reasignarlo.

**Aislamiento de datos por cuenta**

4. WHEN un usuario con rol CLIENTE realiza cualquier consulta (reportes, asistencias, ventas, coberturas, evidencias), THE Sistema SHALL filtrar automáticamente los resultados para incluir únicamente datos de los PDVs asociados a la cuenta de cliente del usuario; ningún dato de otra cuenta SHALL ser retornado.

5. THE Sistema SHALL implementar el aislamiento de datos de cuentas de cliente mediante Row-Level Security en PostgreSQL, de forma que la restricción opere a nivel de base de datos y no dependa exclusivamente de la lógica de aplicación.

6. WHEN un usuario CLIENTE intenta acceder a un recurso (PDV, reporte, evidencia, asistencia) que no pertenece a su cuenta de cliente, THE Sistema SHALL rechazar la solicitud con código 403 y registrar el intento en el log de auditoría.

**Usuarios de cliente**

7. THE ADMINISTRADOR SHALL poder crear múltiples usuarios con rol CLIENTE dentro de la misma cuenta de cliente; todos los usuarios de una misma cuenta comparten el mismo conjunto de PDVs visibles.

8. WHEN el ADMINISTRADOR crea un usuario con rol CLIENTE, THE Sistema SHALL requerir que el usuario sea vinculado a una cuenta de cliente existente; no puede existir un usuario CLIENTE sin cuenta de cliente asociada.

9. WHEN el ADMINISTRADOR desactiva una cuenta de cliente, THE Sistema SHALL invalidar automáticamente todas las sesiones activas de los usuarios asociados a esa cuenta en un plazo máximo de 5 minutos y bloquear nuevos inicios de sesión para esos usuarios.

**Reportes y visibilidad**

10. THE Dashboard SHALL mostrar a cada usuario CLIENTE únicamente los PDVs, métricas y reportes de su cuenta; los filtros de zona, ciudad y cadena SHALL operar únicamente sobre el subconjunto de PDVs de su cuenta.

11. THE Sistema SHALL permitir al ADMINISTRADOR generar reportes consolidados que crucen datos de múltiples cuentas de cliente; esta vista consolidada SHALL estar disponible únicamente para el rol ADMINISTRADOR y nunca para usuarios CLIENTE.

12. WHEN el ADMINISTRADOR reasigna un PDV de una cuenta de cliente a otra, THE Sistema SHALL conservar el historial operativo (asistencias, ventas, evidencias) del PDV asociado a la cuenta original; los datos históricos no se transfieren a la nueva cuenta.
