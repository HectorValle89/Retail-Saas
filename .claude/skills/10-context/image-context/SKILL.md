# SKILL: /Image - Captura de Pantalla Automática

## Propósito
Leer la última captura de pantalla del usuario para obtener contexto visual.

## Cuándo Usar
Cuando el usuario escribe `/Image` o comparte una imagen para dar contexto.

## Procedimiento
1. Buscar la última imagen en: `C:\Users\Thunderobot Zero\Pictures\Screenshots`
2. Ordenar por fecha de creación (más reciente primero)
3. Leer la imagen con la herramienta Read
4. Describir lo que veo y preguntar qué quiere que haga con ese contexto

## Notas
- Solo busca archivos `.png`, `.jpg`, `.jpeg`
- Silencia errores si no hay imágenes
- Si la carpeta no existe, buscar en otras rutas comunes de Windows:
  - `C:\Users\Thunderobot Zero\OneDrive\Pictures\Screenshots`
  - `C:\Users\Thunderobot Zero\Desktop`

---

*Última actualización: 2026-03-13*