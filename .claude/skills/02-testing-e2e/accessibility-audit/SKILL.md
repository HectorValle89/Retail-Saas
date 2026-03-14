---
name: accessibility-audit
description: Auditoría WCAG para PWA Mobile-First
---

# Accessibility Audit - Beteele PWA

## Cuando Usar
- Antes de deploy a producción
- Al crear nuevos componentes UI
- Rediseño de interfaces
- Preparar para certificación WCAG

## Checklist WCAG 2.1 AA

### Contraste de Color
```typescript
// Verificar contraste mínimo 4.5:1 para texto normal
// 3:1 para texto grande (18pt+)

// ✅ Ejemplo con Tailwind
<button className="bg-blue-600 text-white">  {/* Contraste: 4.6:1 ✅ */}
  Registrar
</button>

// ❌ Mal contraste
<button className="bg-gray-300 text-gray-400">  {/* Contraste: 1.8:1 ❌ */}
  Registrar
</button>
```

### Navegación por Teclado
```typescript
// Todos los elementos interactivos deben ser accesibles por Tab
<button 
  onClick={handleSubmit}
  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}  // ✅ Enter key
>
  Guardar
</button>
```

### ARIA Labels
```typescript
// Componente de cámara necesita labels
<button aria-label="Capturar foto de asistencia">
  <CameraIcon />  {/* Solo icono, sin texto */}
</button>

// Formularios
<input
  type="text"
  id="rfc"
  aria-required="true"
  aria-invalid={errors.rfc ? "true" : "false"}
  aria-describedby="rfc-error"
/>
{errors.rfc && <span id="rfc-error" role="alert">{errors.rfc}</span>}
```

## Tools de Testing
```bash
# Lighthouse Accessibility
npm run build
npx lighthouse http://localhost:3000 --only-categories=accessibility

# Axe DevTools (Chrome Extension)
# Pa11y CLI
npx pa11y http://localhost:3000
```
