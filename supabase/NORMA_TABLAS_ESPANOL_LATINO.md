# Norma de tablas en español latino

Esta guía convierte la regla de oro del proyecto en un paso práctico al crear tablas nuevas.

## Checklist obligatorio antes de crear una tabla

- La tabla usa un nombre en español latino claro.
- Las columnas de negocio usan nombres en español latino.
- No se usaron nombres en inglés por costumbre.
- Se reutilizó la terminología ya existente del proyecto.
- La tabla incluye `created_at` y `updated_at` solo si ese estándar técnico ya es requerido por compatibilidad.
- Si hubo una excepción técnica en inglés, quedó documentada arriba del SQL con una nota breve.
- La tabla tendrá RLS si almacena datos de negocio o de usuarios.

## Ejemplos rápidos

- Correcto: `usuarios`, `clientes_invitados`, `proyectos`, `estado_pago`, `fecha_registro`
- Incorrecto: `users`, `client_accounts`, `stores`, `payment_status`, `created_at` como nombre de negocio

## Excepciones permitidas

Solo se aceptan nombres en inglés cuando:

- El motor, framework o integración externa ya exige ese nombre.
- Cambiar el nombre rompería una interfaz externa.
- El nombre corresponde a campos técnicos universales ya consolidados en el proyecto.

## Cómo documentar una excepción

Usa un bloque como este antes de la tabla:

```sql
-- Excepción documentada:
-- `created_at` y `updated_at` se conservan por compatibilidad con utilidades existentes.
```
