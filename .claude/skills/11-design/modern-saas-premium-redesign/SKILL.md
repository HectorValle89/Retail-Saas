---
name: modern-saas-premium-redesign
description: Evolucion visual premium para productos SaaS enterprise ya operativos. Usar cuando se necesite rediseñar o elevar visualmente una app existente sin cambiar navegacion, arquitectura de informacion, campos, flujos de datos ni logica de negocio. Aplicar para redisenos de shell, sistema de superficies, tipografia, iconografia, tablas, formularios, hero cards, sidebars y estados visuales con enfoque de sustitucion controlada, mobile-first y alta consistencia.
---

# Modern SaaS Premium Redesign

Usa esta skill cuando el producto ya funciona bien a nivel UX/logica y el objetivo sea sustituir su capa visual por una identidad SaaS premium, mas suave, mas limpia y mas consistente, sin reestructurar el producto.

## Workflow obligatorio

1. Auditar primero la capa visual actual.
   - Identificar tokens actuales, primitives, shell, headers, tablas, formularios y estados.
   - Distinguir lo funcional de lo meramente visual.

2. Redisenar por capas, no por pantallas aisladas.
   - Primero tokens globales.
   - Luego primitives (`Card`, `Button`, `Input`, `Select`, `Badge`).
   - Luego shell (`layout`, `sidebar`, headers).
   - Luego modulos de mayor exposicion.

3. Tratar el cambio como sustitucion sistemica.
   - No introducir estilos premium solo en un modulo si las primitives siguen antiguas.
   - No mezclar dos lenguajes visuales rivales en la misma pantalla.

4. Mantener intacto el contrato funcional.
   - No mover menus.
   - No quitar campos.
   - No alterar rutas, acciones, permisos ni data flow.

5. Validar visualmente y tecnicamente.
   - Desktop y movil.
   - Hover, focus, loading, empty, error, success.
   - Accesibilidad minima de contraste y targets tactiles.

## Reglas de no regresion

- Priorizar legibilidad y claridad por encima de ornamentacion.
- Evitar heroes oscuros duros si el nuevo sistema es luminoso y premium.
- Evitar bordes finos dominantes; separar por superficie, radio y sombra.
- Evitar colores saturados constantes; usar el primario como enfasis, no como relleno total.
- Evitar tablas con gridlines pesadas; preferir tablas soft o micro-cards por fila.
- Si una vista es densa, mejorarla con spacing, estados y jerarquia, no con mas decoracion.

## Orden recomendado de implementacion

Lee estas referencias segun la fase:

- Direccion visual global: `references/visual-direction.md`
- Mapeo por componente: `references/component-mapping.md`
- Orden y prioridad por modulo: `references/module-priority.md`

## Criterios de aceptacion visual

- La app conserva exactamente su estructura funcional.
- El producto se percibe claramente mas premium, moderno y coherente.
- Las surfaces, tipografia, iconos, botones, tablas y formularios responden al mismo sistema.
- La navegacion lateral y los headers se sienten de producto SaaS enterprise, no de herramienta interna rigida.
- El cambio se hereda desde las primitives y no depende solo de overrides locales.
