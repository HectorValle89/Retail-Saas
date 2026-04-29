import { expect, test } from 'vitest'
import {
  buildNuevoCandidatoCoordinacionNotification,
  buildRutaSemanalAprobadaNotification,
  buildRutaSemanalEnviadaNotification,
} from './workflowCatalog'

test('centraliza la notificacion de nuevo candidato para coordinacion', () => {
  expect(
    buildNuevoCandidatoCoordinacionNotification({
      empleadoId: 'emp-123',
      nombreCompleto: 'Nelly Diana Espinoza Palomares',
    })
  ).toEqual({
    workflow: 'empleados_nuevo_candidato_coordinacion',
    title: 'Nuevo candidato pendiente de aprobacion',
    body:
      'Nelly Diana Espinoza Palomares ya quedo en la etapa Nuevos despues de subir su CV. Revisa la ficha para validar el PDV sugerido y continuar con la entrevista.',
    ctaLabel: 'Abrir candidato',
    ctaUrl: 'https://beteele-one.com/empleados',
    pushTitle: 'Nuevo candidato pendiente de aprobacion',
    pushBody: 'Nelly Diana Espinoza Palomares ya quedo en Nuevos y espera validacion de Coordinacion.',
    pushPath: '/empleados',
    pushTag: 'empleado-nuevo-coordinacion-emp-123',
    data: {
      empleadoId: 'emp-123',
      etapa: 'NUEVOS',
    },
  })
})

test('centraliza la notificacion de ruta semanal enviada', () => {
  expect(
    buildRutaSemanalEnviadaNotification({
      supervisorNombre: 'Luis Perez',
      supervisorId: 'sup-1',
      semana: '2026-04-20',
      cuentaClienteId: 'cuenta-1',
      totalTiendas: 12,
      totalDias: 5,
    })
  ).toEqual({
    workflow: 'ruta_enviada_coordinacion',
    title: 'Nueva ruta semanal de Luis Perez — semana 2026-04-20',
    body:
      'El supervisor Luis Perez envió su ruta semanal para la semana del 2026-04-20 a coordinación. Total 12 tiendas en 5 días.',
    ctaLabel: 'Revisar ruta',
    ctaUrl: 'https://beteele-one.com/ruta-semanal?supervisor=sup-1&semana=2026-04-20',
    pushTitle: 'Nueva ruta semanal de Luis Perez — semana 2026-04-20',
    pushBody:
      'El supervisor Luis Perez envió su ruta semanal para la semana del 2026-04-20 a coordinación. Total 12 tiendas en 5 días.',
    pushPath: '/ruta-semanal?supervisor=sup-1&semana=2026-04-20',
    pushTag: 'ruta-semanal-enviada-sup-1-2026-04-20',
    data: {
      supervisorId: 'sup-1',
      semana: '2026-04-20',
      cuentaClienteId: 'cuenta-1',
      totalTiendas: 12,
      totalDias: 5,
    },
  })
})

test('centraliza la notificacion de ruta semanal aprobada', () => {
  expect(
    buildRutaSemanalAprobadaNotification({
      supervisorId: 'sup-1',
      coordinadorNombre: 'Ana Gomez',
      semana: '2026-04-20',
    })
  ).toEqual({
    workflow: 'ruta_aprobada',
    title: 'Tu ruta semanal fue aprobada',
    body:
      'Tu ruta de la semana del 2026-04-20 fue aprobada por Ana Gomez. Ya puedes comenzar a ejecutarla.',
    ctaLabel: 'Ver mi ruta',
    ctaUrl: 'https://beteele-one.com/ruta-semanal',
    pushTitle: 'Tu ruta semanal fue aprobada',
    pushBody:
      'Tu ruta de la semana del 2026-04-20 fue aprobada por Ana Gomez. Ya puedes comenzar a ejecutarla.',
    pushPath: '/ruta-semanal',
    pushTag: 'ruta-semanal-aprobada-sup-1-2026-04-20',
    data: {
      supervisorId: 'sup-1',
      semana: '2026-04-20',
    },
  })
})
