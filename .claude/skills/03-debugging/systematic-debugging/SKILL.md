---
name: systematic-debugging
description: Framework estructurado para resolver bugs antes de proponer fixes
---

# Systematic Debugging - Beteele SAAS

## Overview
Metodología sistemática de debugging ANTES de hacer cualquier fix manual.

## Cuando Usar
- **SIEMPRE** antes de proponer un fix
- Errores de runtime (ej. "Maximum update depth exceeded")
- Bugs de lógica (cuotas incorrectas, asistencias mal calculadas)
- Problemas de sincronización offline
- Performance degradado

## Proceso de 5 Pasos

### 1️⃣ REPRODUCIR
Crea un caso de prueba mínimo que reproduzca el bug consistentemente.

**Ejemplo: "Maximum update depth exceeded" en Matriz**
```typescript
// Componente problemático
function AttendanceMatrix() {
  const [daysInMonth, setDaysInMonth] = useState<Date[]>([]);
  
  useEffect(() => {
    // ❌ BUG: Recalcula en cada render → loop infinito
    setDaysInMonth(generateDaysForMonth(currentMonth));
  }, [currentMonth]); // currentMonth es objeto, cambia referencia
}
```

### 2️⃣ AISLAR
Identifica la causa raíz eliminando variables.

**Preguntas:**
- ¿El bug ocurre sin datos reales? (usar mock)
- ¿Ocurre en componente aislado? (crear sandbox)
- ¿Desaparece al eliminar cierta dependencia?

**Experimento:**
```typescript
// Test aislado
useEffect(() => {
  console.log('Effect ejecutado', { currentMonth });
  setDaysInMonth(generateDaysForMonth(currentMonth));
}, [currentMonth]);

// Resultado: Se ejecuta infinitamente
// Hipótesis: currentMonth cambia referencia en cada render
```

### 3️⃣ HIPÓTESIS
Formula hipótesis basadas en evidencia.

**Hipótesis para Matriz:**
1. ✅ `currentMonth` es objeto que cambia referencia → re-trigger de effect
2. ❌ `generateDaysForMonth()` lanza error
3. ❌ Estado de `daysInMonth` corrompe DOM

**Validar:**
```typescript
// Verificar cambio de referencia
useEffect(() => {
  console.log('currentMonth ref:', currentMonth);
}, [currentMonth]);

// Resultado: Se imprime en cada render ✅ Hipótesis confirmada
```

### 4️⃣ FIX CON TEST
Implementa fix y valida con test automatizado.

**Fix:**
```typescript
function AttendanceMatrix() {
  // Memoizar para evitar cambio de referencia
  const daysInMonth = useMemo(
    () => generateDaysForMonth(currentMonth.year, currentMonth.month),
    [currentMonth.year, currentMonth.month]
  );
  
  // Ya no necesita useEffect
}
```

**Test de regresión:**
```typescript
test('no debe causar loop infinito al cambiar mes', async () => {
  const { rerender } = render(<AttendanceMatrix initialMonth={1} />);
  
  const renderCount = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(renderCount);
  
  // Cambiar mes
  rerender(<AttendanceMatrix initialMonth={2} />);
  
  // Debe renderizar solo 2 veces (inicial + update)
  await waitFor(() => {
    expect(renderCount).toHaveBeenCalledTimes(2);
  });
});
```

### 5️⃣ DOCUMENTAR
Registra el bug, causa raíz y fix en ADR o changelog.

```markdown
## Bug Fix: Loop Infinito en Matriz de Asistencia

**Síntoma:** "Maximum update depth exceeded" al cargar matriz

**Causa Raíz:** Hook `useEffect` dependía de `currentMonth` (objeto), 
que cambiaba referencia en cada render, causando re-ejecución infinita.

**Fix:** Memoizar `daysInMonth` con `useMemo` dependiendo de primitivos 
(`year`, `month`) en lugar del objeto completo.

**Test:** `attendance-matrix.test.ts` - previene regresión
```

## Casos de Uso en Beteele

### Bug: Cuota Diaria Incorrecta
```
1. REPRODUCIR: DC con 30 días laborales muestra cuota de 1000 (esperado 1200)
2. AISLAR: ¿Días laborales incorrectos? → Verificar `diasRealesBloque`
3. HIPÓTESIS: Función no cuenta sábados laborales → Confirmar lógica
4. FIX: Actualizar `getDiasLaborales()` para incluir sábados
5. DOCUMENTAR: ADR-005: Cálculo de días laborales incluye sábados
```

### Bug: Sincronización Duplicada
```
1. REPRODUCIR: Al reconectar, registros se duplican en PocketBase
2. AISLAR: ¿Problem de IndexedDB o API? → Logs de cola de sync
3. HIPÓTESIS: No se limpian registros de IndexedDB post-sync
4. FIX: `await syncQueue.clear()` después de sync exitoso
5. TEST: Mock offline → online → verificar 1 solo registro
```

## Comandos de Debugging

```bash
# Logs de PocketBase (backend)
docker logs -f pocketbase-container

# Profiling de React (frontend)
npm run dev -- --inspect

# Inspeccionar IndexedDB
# Chrome DevTools → Application → IndexedDB
```

## Checklist Pre-Fix
- [ ] ¿Puedo reproducir el bug consistentemente?
- [ ] ¿Tengo logs/evidencia de la causa raíz?
- [ ] ¿He formulado al menos 2 hipótesis?
- [ ] ¿He validado la hipótesis con experimento?
- [ ] ¿Mi fix tiene test de regresión?
- [ ] ¿He documentado en ADR/changelog?

## Anti-Patrones (NO HACER)
❌ "Probar y ver qué pasa" sin hipótesis
❌ Hacer fix sin test de regresión
❌ Ignorar warnings de console
❌ "Funciona en mi máquina" sin reproducir en prod
