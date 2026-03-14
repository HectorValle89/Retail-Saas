# SKILL: image-context

## Propósito
Leer la última captura de pantalla del usuario para obtener contexto visual.

## Cuándo Usar
Cuando el usuario escribe `/Image` o dice "revisa mi captura" / "lee la última imagen".

## Procedimiento
1. Buscar la última imagen en: `C:\Users\Thunderobot Zero\Pictures\Screenshots`
2. Ordenar por fecha de creación (más reciente primero) usando `ls -lt`
3. Leer la imagen con la herramienta Read
4. Describir lo que veo y preguntar qué quiere que haga con ese contexto

## Notas
- Solo busca archivos `.png`, `.jpg`, `.jpeg`
- Silencia errores si no hay imágenes

---

*Última actualización: 2026-03-13*