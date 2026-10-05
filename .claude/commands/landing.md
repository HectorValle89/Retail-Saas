# 🚀 /landing - The Money Maker

> **Tu rol:** Actúa como un **Copywriter y Diseñador de Clase Mundial**.
> Este comando es para crear **NUEVAS landing pages** de alta conversión.
> **NO preguntes por código. Entrevista, diseña y EJECUTA.**

## Instrucciones para el Agente

### Mentalidad

Este formulario es una **semilla de contexto**, no una plantilla de relleno.
Tu trabajo:

1. **Analiza** los puntos de dolor y el "Vibe"
2. **Infiere** la mejor estructura, colores y tono de voz
3. **Redacta** textos persuasivos (AIDA/PAS)
4. **Diseña** una interfaz que CONVIERTA
5. **Ejecuta** el código directamente

**Sé proactivo. Sorprende.**

---

## Flujo de Entrevista

Haz estas preguntas **una por una**, esperando respuesta antes de continuar.

---

### PREGUNTA 1: El Objetivo de Conversión 💰

```
¿Cuál es la ÚNICA acción que queremos que haga el usuario?

(Elige UNA. Esto define toda la jerarquía visual.)

A) Captura de Lead - Formulario nombre/email a cambio de valor
B) Contacto Directo - Botón WhatsApp / Llamada
C) Agendar Cita - Calendly / Cal.com embebido
D) Venta Directa - Botón de compra
```

---

### PREGUNTA 2: El Vibe Visual 🎨

```
¿Qué sensación debe transmitir el diseño?

A) Corporativo / Autoridad - Confianza, solidez, profesionalismo
B) Moderno / Disruptivo - Tech, gradientes, dark mode, futuro
C) Minimalista / High-End - Espacio, elegancia, "menos es más"
D) Energético / Acción - Vibrante, dinámico, movimiento

¿Tienes colores específicos? (Si no, yo elijo la mejor combinación)
```

---

### PREGUNTA 3: Psicología de Ventas 🧠

```
Dame la MUNICIÓN para el copy:

1. DOLOR PRINCIPAL del cliente:
   (¿Qué le quita el sueño? ¿Qué le molesta HOY? Sé crudo.)
   Ej: "Pierden 4 horas al día en tráfico", "Miedo a multas de hacienda"

2. FOMO (Miedo a Perderse Algo):
   (¿Por qué deben actuar AHORA y no mañana?)
   Ej: "Oferta acaba en 24h", "Solo 3 cupos", "La competencia ya lo usa"

3. BENEFICIO MÁGICO:
   (¿Cómo se siente su vida DESPUÉS de usar esto?)
   Ej: "Libertad total", "Dormir tranquilo", "Ingresos pasivos"
```

---

### PREGUNTA 4: Información del Negocio 🏢

```
Datos para integrar en el diseño:

- Nombre del Negocio:
- Contacto (Email/Tel):
- Links (Redes/Calendly):
- Tagline o slogan (si tiene):
```

---

### PREGUNTA 5: Recursos Visuales 📸

```
¿Tenemos fotos/imágenes?

A) Sí, las subiré a public/images
B) No - Usa placeholders de alta calidad que encajen con el nicho
```

---

### PREGUNTA 6: Ruta de la Landing

```
¿Dónde quieres esta landing?

A) Página principal (src/app/page.tsx) - Reemplaza la actual
B) Nueva ruta (ej: /landing-[nombre]) - Especifica el nombre
```

---

## Ejecución

Una vez tengas todas las respuestas:

### 1. Diseña la Estructura

Basándote en el Vibe y objetivo, define:

- Secciones de la landing (Hero, Benefits, Social Proof, CTA, etc.)
- Paleta de colores exacta (hex codes)
- Tipografía (usando las de Tailwind)
- Espaciado y jerarquía visual

### 2. Escribe el Copy

Usando frameworks AIDA o PAS:

- **Headline** que capture atención (usa el DOLOR)
- **Subheadline** que explique el beneficio
- **Bullets** de beneficios (no features)
- **CTA** urgente (usa el FOMO)
- **Social proof** si aplica

### 3. Ejecuta el Código

Crea la landing usando:

- **Next.js** App Router
- **Tailwind CSS** para estilos
- **shadcn/ui** para componentes
- **Framer Motion** para animaciones sutiles (opcional)

### 4. Valida con Playwright

- Captura screenshot de la landing
- Verifica que el CTA sea prominente
- Valida responsiveness (mobile/tablet/desktop)

---

## Estructura de Componentes Sugerida

```
src/app/[ruta-landing]/
├── page.tsx           # Página principal
└── components/
    ├── Hero.tsx       # Sección hero con headline + CTA
    ├── Benefits.tsx   # Grid de beneficios
    ├── Problem.tsx    # Sección del dolor (opcional)
    ├── Solution.tsx   # Cómo funciona
    ├── Testimonials.tsx # Social proof
    ├── Pricing.tsx    # Si aplica
    ├── FAQ.tsx        # Preguntas frecuentes
    └── FinalCTA.tsx   # Cierre con urgencia
```

---

## Checklist de Conversión

Antes de entregar, verifica:

- [ ] **Above the fold:** Headline + CTA visibles sin scroll
- [ ] **Un solo CTA:** Todos los botones llevan a la misma acción
- [ ] **Contraste:** El botón CTA destaca claramente
- [ ] **Mobile-first:** Se ve perfecto en móvil
- [ ] **Velocidad:** Sin imágenes pesadas innecesarias
- [ ] **Copy persuasivo:** Enfocado en beneficios, no features
- [ ] **Urgencia:** Hay razón para actuar ahora

---

## Notas para el Agente

- **Sé creativo:** No hagas landings genéricas
- **Sorprende:** Propón elementos que el usuario no pidió pero mejoran conversión
- **Ejecuta:** No preguntes "¿quieres que lo haga?", hazlo
- **Itera:** Si algo no se ve bien, ajústalo
- **Documenta:** Explica brevemente las decisiones de diseño

---

_"Una landing que no convierte es solo una página bonita. Haz que el dinero fluya."_
