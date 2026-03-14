---
name: tailwind-mobile-first
description: Diseño Mobile-First con Tailwind para operarios
---

# Tailwind Mobile-First - Beteele

## Breakpoints
```typescript
// Default: mobile (< 640px)
// sm: 640px, md: 768px, lg: 1024px, xl: 1280px

<button className="
  w-full              {/* Mobile: botón full width */}
  sm:w-auto           {/* Tablet+: auto width */}
  px-4 py-3           {/* Espaciado táctil grande */}
  text-lg             {/* Texto legible en campo */}
  rounded-2xl         {/* Esquinas redondeadas */}
  bg-blue-600
  active:bg-blue-700  {/* Feedback táctil claro */}
">
  Registrar Asistencia
</button>
```

## Tokens Beteele
```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      fontSize: {
        'field': '18px',  // Mínimo para operarios
      },
      spacing: {
        'touch': '44px',  // Mínimo táctil iOS/Android
      },
      colors: {
        'brand': {
          blue: '#2563eb',
          green: '#10b981',
          red: '#ef4444',
        }
      }
    }
  }
}
```

## Componentes Accesibles
```typescript
<input
  className="
    w-full
    px-4 py-3         {/* Grande para dedos */}
    text-field
    border-2
    rounded-xl
    focus:ring-4      {/* Indicador de focus claro */}
    focus:ring-blue-200
  "
/>
```
