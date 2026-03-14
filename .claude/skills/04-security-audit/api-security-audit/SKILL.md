---
name: api-security-audit
description: Auditoría de seguridad para API Rules de PocketBase
---

# API Security Audit - Beteele PocketBase

## Cuando Usar
- Antes de deploy a producción
- Al agregar nuevas colecciones
- Modificar API Rules existentes
- Implementar endpoints de exportación/reportes

## Checklist de Seguridad

### 1. Principio de Mínimo Privilegio
```javascript
// ✅ CORRECTO: Nómina solo LECTURA
// Collection: attendance
{
  "listRule": "@request.auth.role = 'nomina'",
  "viewRule": "@request.auth.role = 'nomina'",
  "createRule": null,  // ❌ NO puede crear
  "updateRule": null,  // ❌ NO puede editar
  "deleteRule": null   // ❌ NO puede eliminar
}

// ✅ CORRECTO: DC solo sus asignaciones
// Collection: assignments_daily
{
  "listRule": "dc_id = @request.auth.id",
  "updateRule": null  // Solo admin puede cambiar asignaciones
}
```

### 2. Validación de Inputs
```javascript
// Collection: employees
{
  "schema": [
    {
      "name": "email",
      "type": "email",  // ✅ Validación nativa
      "required": true
    },
    {
      "name": "rfc",
      "type": "text",
      "pattern": "^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$"  // ✅ RFC válido
    }
  ]
}
```

### 3. Rate Limiting
```javascript
// Hook de PocketBase para uploads
onRecordBeforeCreateRequest((e) => {
  const userId = e.httpContext.get("auth").id;
  
  // Limitar a 10 fotos por hora
  const recentUploads = $app.dao().findRecordsByFilter(
    "attendance",
    `user_id = '${userId}' && created >= @now-1h`
  );
  
  if (recentUploads.length >= 10) {
    throw new BadRequestError("Rate limit exceeded");
  }
}, "attendance");
```

## Casos Críticos en Beteele

### Exportación de Nómina
```javascript
// ❌ VULNERABLE
{
  "listRule": "@request.auth.role = 'nomina'"
}

// ✅ SEGURO: Filtrar por territorio del usuario
{
  "listRule": "@request.auth.role = 'nomina' && territory = @request.auth.territory"
}
```

### Sincronización Offline
```javascript
// Validar que registro pertenece al usuario
{
  "createRule": "dc_id = @request.auth.id && pdv_id IN @request.auth.assigned_pdvs"
}
```

## Comandos de Auditoría
```bash
# Exportar todas las API Rules
curl http://localhost:8090/api/collections | jq '.[] | {name, listRule, createRule}'

# Test de permisos (debe fallar)
curl -H "Authorization: Bearer TOKEN_NOMINA" -X POST http://localhost:8090/api/collections/attendance/records
```
