---
name: utf8-standard
description: Estándar UTF-8 obligatorio para generación de código y manejo de archivos en Beteele SAAS
---

# Estándar UTF-8 para Beteele SAAS

## Overview
Garantiza que todo el código generado, archivos de texto, y respuestas de la IA utilicen la codificación UTF-8 para prevenir errores de visualización de caracteres especiales (ñ, acentos, símbolos).

## Regla de Oro
**TODO el código, comentarios, documentación y strings deben estar en UTF-8.**

## Cuando Usar
- Siempre que se genere un nuevo archivo.
- Al editar archivos existentes con caracteres especiales.
- Al generar respuestas en español neutro.

## Implementación Técnica

### 1. Cabeceras de Archivo (Opcional pero Recomendado)
En archivos que lo soporten, asegurar que no haya BOM y que el editor esté configurado en UTF-8.

### 2. Manejo de Caracteres Especiales
- Usar directamente caracteres como `ñ`, `á`, `é`, `í`, `ó`, `ú`.
- NO usar entidades HTML si el archivo es un componente de React/Next.js (JSX admite UTF-8 nativo).
- Ejemplo:
  ```tsx
  // ✅ CORRECTO
  <label>Campañas Activas</label>
  
  // ❌ INCORRECTO
  <label>Campa&ntilde;as Activas</label>
  ```

### 3. Configuración de Base de Datos (PocketBase/SQLite)
- Asegurar que los filtros y queries manejen strings en UTF-8.
- Ejemplo de filtro: `nombre ~ "García"`

## Verificación
1. Abrir archivos generados en un editor con soporte UTF-8 (VS Code, Notepad++).
2. Validar que los caracteres especiales se visualicen correctamente en el navegador y el sistema operativo (Windows).

## Impacto en Productividad
Evita el "mojibake" (caracteres basura) en la interfaz de usuario, garantizando una experiencia premium para operarios de campo en México y LATAM.
