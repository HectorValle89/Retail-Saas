import { expect, test } from 'vitest'
import { buildNuevoCandidatoCoordinacionNotification } from './recruitmentNotifications'

test('construye la notificacion de nuevo candidato para coordinacion', () => {
  expect(
    buildNuevoCandidatoCoordinacionNotification({
      empleadoId: 'emp-123',
      nombreCompleto: 'Nelly Diana Espinoza Palomares',
    })
  ).toEqual({
    puestosDestino: ['COORDINADOR'],
    workflow: 'empleados_nuevo_candidato_coordinacion',
    title: 'Nuevo candidato pendiente de aprobacion',
    body:
      'Nelly Diana Espinoza Palomares ya quedo en la etapa Nuevos despues de subir su CV. Revisa la ficha para validar el PDV sugerido y continuar con la entrevista.',
    path: 'https://beteele-one.com/empleados',
    tag: 'empleado-nuevo-coordinacion-emp-123',
    auditAction: 'notificar_coordinacion_nuevo_candidato',
    pushTitle: 'Nuevo candidato pendiente de aprobacion',
    pushBody:
      'Nelly Diana Espinoza Palomares ya quedo en Nuevos y espera validacion de Coordinacion.',
    pushPath: '/empleados',
    pushTag: 'empleado-nuevo-coordinacion-emp-123',
    data: {
      empleadoId: 'emp-123',
      etapa: 'NUEVOS',
    },
  })
})
