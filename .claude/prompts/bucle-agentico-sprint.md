# ⚡ Bucle Agéntico: Modo SPRINT

> _"No pienses. Ejecuta. Itera. Confirma."_

El modo SPRINT es para tareas que no requieren planificación formal. Ejecución directa con MCPs on-demand.

---

## 🎯 Cuándo Usar SPRINT

- [ ] La tarea se puede describir en una oración
- [ ] Afecta 1-3 archivos máximo
- [ ] No requiere cambios estructurales en base de datos
- [ ] No tiene dependencias complejas entre componentes
- [ ] El resultado es verificable inmediatamente

### Ejemplos de Tareas SPRINT

```
✅ "El botón de login no funciona"
✅ "Añade un campo de teléfono al formulario"
✅ "Cambia el color del header a azul"
✅ "El query de usuarios está lento"
✅ "Añade validación de email"
✅ "El componente no se renderiza en mobile"
```

---

## 🔄 El Flujo SPRINT

```
┌─────────────────────────────────────────┐
│           RECIBIR TAREA                 │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         EJECUTAR DIRECTAMENTE           │
│                                         │
│  • Leer archivos relevantes             │
│  • Implementar solución                 │
│  • NO crear plan formal                 │
│  • NO usar TodoWrite                    │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      MCPs ON-DEMAND (si necesita)       │
│                                         │
│  🧠 Next.js MCP → Ver errores           │
│  👁️ Playwright → Validar visual         │
│  🗄️ Supabase → Consultar/modificar DB   │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│        ITERAR HASTA COMPLETAR           │
│                                         │
│  IF error detectado:                    │
│    → Corregir                           │
│    → Verificar de nuevo                 │
│  ELSE:                                  │
│    → Pasar a confirmar                  │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         CONFIRMAR RESULTADO             │
│                                         │
│  • Mostrar qué se hizo                  │
│  • Explicar brevemente el cambio        │
│  • Preguntar si necesita ajustes        │
└─────────────────────────────────────────┘
```

---

## 🔧 Uso de MCPs en SPRINT

Los MCPs son **herramientas disponibles**, no pasos obligatorios.

El agente decide **dinámicamente** cuándo usarlos:

### 🧠 Next.js DevTools MCP

**Usar cuando:**

- Hay un error y no está claro qué lo causa
- Necesito verificar que no hay errores de tipos
- Quiero ver el estado del servidor de desarrollo

**NO usar cuando:**

- El cambio es puramente visual
- Ya sé exactamente qué está mal

### 👁️ Playwright MCP

**Usar cuando:**

- Necesito verificar cómo se ve algo visualmente
- El usuario reportó un problema visual
- Quiero confirmar que un componente renderiza correctamente

**NO usar cuando:**

- El cambio es en lógica backend
- Es un fix de tipos sin impacto visual

### 🗄️ Supabase MCP

**Usar cuando:**

- Necesito ver la estructura actual de una tabla
- Quiero verificar que un query funciona
- Necesito ver logs de auth o postgres

**NO usar cuando:**

- El cambio no involucra base de datos
- Ya conozco la estructura de los datos

---

## 📝 Ejemplo Completo SPRINT

### Tarea

```
Usuario: "El botón de login no funciona, se queda cargando infinitamente"
```

### Ejecución SPRINT

```
1. LEO el componente LoginButton.tsx
   → Veo que hace fetch a /api/auth/login

2. LEO la ruta /api/auth/login
   → Parece correcta, pero veo que usa await sin try/catch

3. [Next.js MCP] → get_errors
   → "Unhandled promise rejection in /api/auth/login"

4. CORRIJO añadiendo try/catch con manejo de error

5. [Next.js MCP] → get_errors
   → Sin errores ✅

6. [Playwright MCP] → screenshot de /login
   → Botón funciona, muestra loading y luego redirige

7. CONFIRMO:
   "Listo. El problema era que el endpoint de login no tenía
   manejo de errores. Cuando Supabase fallaba, la promesa
   quedaba sin resolver. Añadí try/catch y ahora muestra
   el error correctamente si falla, o redirige si tiene éxito."
```

**Tiempo total: ~2 minutos**

---

## ⚠️ Cuándo NO Usar SPRINT

Si la tarea cumple alguna de estas condiciones, usar **BLUEPRINT**:

- ❌ Requiere crear múltiples componentes nuevos
- ❌ Necesita cambios en esquema de base de datos
- ❌ Tiene dependencias entre varias partes
- ❌ Es una feature completa end-to-end
- ❌ Requiere entender contexto amplio antes de implementar

---

## 🏁 Principios SPRINT

1. **Sin overhead**: No crear fases, planes, ni TodoWrite
2. **MCPs on-demand**: Usar solo cuando el juicio lo indique
3. **Iteración pura**: Código → Error → Fix → Repeat
4. **Velocidad máxima**: Cada token cuenta
5. **Confirmación clara**: Siempre explicar qué se hizo

---

_"No pienses de más. Ejecuta, observa, ajusta."_
