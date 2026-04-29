# Actualización silenciosa de asignaciones por cambio de tienda

## Summary
El comportamiento correcto no debe depender de que la DC o el supervisor abran la app justo cuando el administrador cambia la asignación.  
La solución es un esquema de **publicación nocturna en servidor + sync diferencial automático en el dispositivo**.

En la práctica:
- el administrador cambia la asignación hoy;
- el backend publica la versión efectiva para mañana a las 00:00;
- cuando la DC o el supervisor abran su app, o cuando recuperen señal, la app descarga solo los cambios pendientes;
- si no hay señal en ese momento, la app sigue usando el snapshot local ya precargado y se actualiza sola cuando detecte conexión.

## Key Changes
- Mantener la UI intacta:
  - no agregar ventanas nuevas;
  - no crear un “modo offline” manual;
  - no pedir al usuario que sincronice;
  - la app debe detectar red y actuar sola.
- Convertir la asignación en una **fuente versionada**:
  - cada cambio de asignación debe generar una nueva versión efectiva;
  - el dispositivo guarda un cursor o versión de última sincronización;
  - al reconectar, pide solo los cambios posteriores a ese cursor.
- Agregar una publicación nocturna server-side:
  - a las `00:00` se materializa la asignación efectiva del día siguiente;
  - esto deja listo el snapshot que la app debe ver al abrirse por la mañana;
  - el corte debe vivir en backend, no en frontend.
- Usar el contrato que ya existe en el repo:
  - el sistema ya resuelve asignaciones efectivas diarias;
  - ya existe el backend de publicación programada de asignaciones;
  - la evolución correcta es extender eso a un **refresh diario silencioso** y no a una recarga completa.
- Precalentar solo lo necesario para campo:
  - DC y supervisor deben cargar un snapshot corto de asignación/ruta al tener señal;
  - no hace falta descargar todo el dashboard ni históricos pesados;
  - solo lo que necesitan para operar el día siguiente.
- En el dispositivo:
  - si hay señal, sincroniza automáticamente al arrancar o al volver al frente;
  - si no hay señal, usa lo último guardado localmente;
  - si la asignación cambió en servidor mientras estuvo sin conexión, la verá apenas vuelva a conectarse.
- Asegurar baja fricción de campo:
  - check-in/out y ruta deben basarse en el snapshot ya materializado;
  - el cambio de tienda de hoy para mañana debe aparecer sin acción manual del usuario.

## Test Plan
- Caso principal:
  - el administrador cambia la asignación hoy;
  - el sistema publica la asignación nueva en el corte nocturno;
  - la DC abre la app mañana sin haberla usado en la noche;
  - la app muestra la tienda correcta si ya tenía conexión o la actualiza al reconectar.
- Caso sin señal:
  - la DC abre la app sin datos;
  - la app usa el snapshot local;
  - cuando recupera señal, descarga solo el delta y corrige la asignación si hubo cambio.
- Caso de cambio tardío:
  - el administrador mueve la asignación a última hora;
  - el backend publica la nueva versión;
  - la app toma el nuevo estado al siguiente sync automático, sin intervención manual.
- Caso supervisor:
  - la misma lógica aplica para ruta/visitas y panel del supervisor;
  - no debe haber una rama especial por rol para la recarga de asignaciones.
- Validaciones técnicas mínimas:
  - pruebas de la resolución efectiva diaria;
  - pruebas del corte nocturno de publicación;
  - pruebas del delta sync al reconectar;
  - pruebas de no duplicación al sincronizar;
  - `npm run build`;
  - `npm run cf:build`;
  - `npm run docs:check-encoding`.

## Assumptions
- No se cambia la interfaz visible del usuario.
- No se agrega un botón manual de sincronización ni una pantalla nueva.
- La app no puede “adivinar” un cambio si el dispositivo nunca tuvo forma de recibirlo; por eso la garantía real viene de dos piezas:
  - snapshot precargado cuando hubo señal;
  - delta sync automático apenas vuelva la conexión.
- El corte de las `00:00` debe ser server-side, para dejar la versión lista aunque el móvil esté apagado o sin señal.
- El enfoque debe mantenerse barato: una publicación nocturna y un sync diferencial son mucho más eficientes que recargar todo el panel o consultar masivamente cada vez.
