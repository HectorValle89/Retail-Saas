# ADR-03: Arquitectura y Sustitución de Módulo para el Levantamiento de Uniformes de Supervisores

## Contexto y Problema

El negocio ya no requiere que el equipo de campo proponga mecánicas de canje comerciales desde el portal público de captura (módulo "Mecánicas de Canje"). En su lugar, el área de operaciones necesita urgentemente realizar una encuesta cerrada para el levantamiento de tallas de uniformes (Filipinas y Pantalones) del equipo de 19 supervisores oficiales.

Para evitar el despliegue de nuevas rutas públicas y aprovechar los enlaces/códigos QR ya compartidos en campo (que apuntan a la URL `/mecanicas/[slug]`), se requiere:
1. Reutilizar la ruta del formulario `/mecanicas/[slug]` pero reescribir su contenido para el Levantamiento de Uniformes de Supervisores.
2. Dar de baja lógica y física el módulo obsoleto de mecánicas de canje.
3. Crear un esquema de persistencia seguro en la base de datos para almacenar el levantamiento.
4. Generar reportes interactivos en la plataforma del supervisor/administrador que incluyan control de participación, consolidación agregada para el proveedor y desglose detallado.

## Decisiones de Diseño

### 1. Modelo de Datos de Uniformes (`levantamiento_uniforme`)
Se crea una tabla específica e independiente en la base de datos con nombre en español latino, respetando la regla del proyecto:
- Tabla: `public.levantamiento_uniforme`
- Columnas:
  - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - `supervisor_nombre` TEXT UNIQUE NOT NULL (Garantiza que cada supervisor solo guarde una única respuesta).
  - `prendas` JSONB NOT NULL (Colección ordenada de prendas elegidas, cada una con `{ prenda: 'Filipina' | 'Pantalón', genero: 'Dama' | 'Caballero', talla: 'CH' | 'M' | 'G' | 'XL' | '2XL' | '3XL', cantidad: number }`).
  - `fecha_creacion` TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
  - `metadata` JSONB (Guarda el IP, User-Agent, slug origen, etc., para auditoría).

### 2. Baja del Módulo de Mecánicas
Se descontinúan las siguientes superficies y consultas:
- Tabla `propuesta_mecanica_canje` (se mantiene en la base de datos como histórico pero no se escribirá más sobre ella).
- Se reemplazan el servicio `mecanicasReportService.ts`, el endpoint `/api/reportes/mecanicas-propuestas` y la server action `registrarPropuestaMecanica` para que actúen sobre `levantamiento_uniforme`.

### 3. Flujo del Formulario Público (Captura de Uniformes)
El componente cliente de captura pública en la ruta `/mecanicas/[slug]` se transformará en la UI de Uniformes:
- Validará que el supervisor seleccione su nombre de la lista cerrada de 19 supervisores oficiales.
- Permitirá agregar una o varias prendas de manera dinámica, eligiendo Tipo, Género, Talla y la Cantidad.
- Al enviar, se validará a nivel de servidor la lista oficial de supervisores y se insertará en `levantamiento_uniforme`. Si ya existe registro de ese supervisor, se arrojará un error descriptivo impidiendo capturas dobles.

### 4. Reporte y Consolidación (UI Administrativa)
En el panel de reportes del administrador/coordinador:
- Se reemplaza la sección de mecánicas por la sección de **Levantamiento de Uniformes**.
- **Control de Participación:** Identifica cuántos de los 19 supervisores ya respondieron y genera la lista de supervisores pendientes con base en el cruce de datos en caliente.
- **Pedido Consolidado:** Agrupa por `Prenda`, `Género` y `Talla` sumando todas las cantidades registradas en JSONB mediante agregación de base de datos o procesamiento local en JS.
- **Desglose Detallado:** Lista individual por supervisor con su selección.
- **Exportación CSV:** Permite descargar el desglose total de forma rápida para el fabricante.

## Implicaciones y Consecuencias

### Ventajas:
- **Cero fricción de distribución:** Al conservar la misma ruta `/mecanicas/[slug]`, los supervisores pueden usar los enlaces y accesos directos ya distribuidos.
- **Limpieza transaccional:** La restricción `UNIQUE` en `supervisor_nombre` garantiza que no existan capturas duplicadas ni basura en el reporte de compras.
- **Centralización administrativa:** El reporte consolida matemáticamente las piezas eliminando errores manuales en Excel.

### Restricciones:
- Las propuestas de mecánicas de canje históricas ya no serán visibles en la UI. Sin embargo, los datos se preservan intactos en la tabla original `propuesta_mecanica_canje` por razones de cumplimiento histórico de base de datos.
