import { expect, test } from 'vitest'
import { buildPayrollInbox, buildRecruitingInbox } from './workflowInbox'

const baseEmployee = {
  id: 'emp-1',
  nombreCompleto: 'Ana Demo',
  nss: '12345678901',
  curp: 'AAAA000101MDFXXX01',
  puesto: 'DERMOCONSEJERO',
  zona: 'CENTRO',
  supervisor: 'Supervisor Demo',
  fechaAlta: '2026-03-01',
  fechaBaja: null,
  expedienteEstado: 'VALIDADO',
  expedienteObservaciones: null,
  imssEstado: 'PENDIENTE_DOCUMENTOS',
  imssObservaciones: null,
  workflowStage: 'PENDIENTE_IMSS_NOMINA',
  recruitmentSource: 'modulo_empleados_reclutamiento',
  candidateProfileSource: 'CV_GEMINI',
  onboarding: {
    accesosExternosStatus: 'CONFIRMADO',
    expedienteCompletoRecibido: true,
    contratoStatus: 'FIRMADO',
  },
  documentosCount: 2,
  documentos: [],
  adminAccessPending: false,
  estadoCuenta: null,
  workflowCancelReason: null,
  workflowCancelAt: null,
  workflowCancelFromStage: null,
} as const

test('agrupa bandeja de reclutamiento por etapas operativas', () => {
  const inbox = buildRecruitingInbox([
    {
      ...baseEmployee,
      id: 'emp-0',
      nombreCompleto: 'Cancelada real',
      workflowStage: 'ALTA_CANCELADA',
      workflowCancelReason: 'No continio con el proceso',
      expedienteEstado: 'OBSERVADO',
      onboarding: {
        accesosExternosStatus: 'CONFIRMADO',
        expedienteCompletoRecibido: false,
        contratoStatus: 'PENDIENTE',
      },
    },
    {
      ...baseEmployee,
      id: 'emp-1',
      nombreCompleto: 'Devuelto historico',
      workflowStage: 'RECLUTAMIENTO_CORRECCION_ALTA',
      workflowCancelReason: 'Faltan documentos firmados',
      onboarding: {
        accesosExternosStatus: 'PENDIENTE',
        expedienteCompletoRecibido: false,
        contratoStatus: 'PENDIENTE',
      },
    },
    {
      ...baseEmployee,
      id: 'emp-2',
      nombreCompleto: 'Baja Devuelta',
      workflowStage: 'RECLUTAMIENTO_CORRECCION_BAJA',
      fechaBaja: '2026-03-15',
      imssObservaciones: 'Falta finiquito firmado',
    },
  ])

  expect(inbox).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'cancelados-devueltos')?.items).toHaveLength(3)
  expect(inbox.reduce((total, lane) => total + lane.items.length, 0)).toBe(3)
  expect(inbox.find((lane) => lane.key === 'cancelados-devueltos')?.items[2]?.lastObservation).toBe(
    'Falta finiquito firmado'
  )
})

test('manda altas canceladas a la bandeja de cancelados con trazabilidad', () => {
  const inbox = buildRecruitingInbox([
    {
      ...baseEmployee,
      id: 'emp-cancelado',
      nombreCompleto: 'Candidata Cancelada',
      workflowStage: 'ALTA_CANCELADA',
      workflowCancelReason: 'Declino la oferta antes del alta IMSS',
      workflowCancelFromStage: 'EN_GESTION',
      workflowCancelAt: '2026-03-20T10:30:00.000Z',
      imssObservaciones: null,
      expedienteObservaciones: null,
    },
  ])

  const lane = inbox.find((item) => item.key === 'cancelados-devueltos')
  expect(lane?.items).toHaveLength(1)
  expect(lane?.items[0]?.statusLabel).toBe('Alta cancelada')
  expect(lane?.items[0]?.lastObservation).toBe('Declino la oferta antes del alta IMSS')
})

test('agrupa bandeja de nomina por altas pendientes, bajas, devoluciones separadas y cerradas', () => {
  const inbox = buildPayrollInbox([
    {
      ...baseEmployee,
      id: 'emp-0',
      nombreCompleto: 'En gestion',
      workflowStage: 'EN_GESTION',
    },
    {
      ...baseEmployee,
      id: 'emp-1',
      workflowStage: 'PENDIENTE_IMSS_NOMINA',
    },
    {
      ...baseEmployee,
      id: 'emp-2',
      workflowStage: 'EN_FLUJO_IMSS',
      imssEstado: 'EN_PROCESO',
    },
    {
      ...baseEmployee,
      id: 'emp-3',
      workflowStage: 'RECLUTAMIENTO_CORRECCION_ALTA',
      expedienteObservaciones: 'Falta corregir NSS',
      imssObservaciones: null,
    },
    {
      ...baseEmployee,
      id: 'emp-4',
      workflowStage: 'RECLUTAMIENTO_CORRECCION_BAJA',
      fechaBaja: '2026-03-20',
      imssObservaciones: 'Falta comprobante institucional',
    },
    {
      ...baseEmployee,
      id: 'emp-5',
      workflowStage: 'PENDIENTE_BAJA_IMSS',
      fechaBaja: '2026-03-15',
    },
    {
      ...baseEmployee,
      id: 'emp-6',
      workflowStage: 'ONBOARDING',
      imssEstado: 'ALTA_IMSS',
    },
    {
      ...baseEmployee,
      id: 'emp-7',
      workflowStage: 'ALTA_IMSS_CERRADA',
      imssEstado: 'ALTA_IMSS',
    },
    {
      ...baseEmployee,
      id: 'emp-8',
      workflowStage: 'BAJA_IMSS_CERRADA',
      fechaBaja: '2026-03-21',
      imssObservaciones: 'Baja ya cerrada',
    },
  ])

  expect(inbox.find((lane) => lane.key === 'altas-imss')?.items).toHaveLength(3)
  expect(inbox.find((lane) => lane.key === 'bajas-pendientes')?.items).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'bajas-devueltas')?.items).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'devueltas-a-reclutamiento')?.items).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'cerradas')?.items).toHaveLength(2)
  expect(inbox.find((lane) => lane.key === 'bajas-devueltas')?.items[0]?.statusLabel).toBe(
    'Baja devuelta'
  )
  expect(
    inbox
      .find((lane) => lane.key === 'cerradas')
      ?.items.find((item) => item.employee.id === 'emp-6')?.statusLabel
  ).toBe('Onboarding')
  expect(
    inbox
      .find((lane) => lane.key === 'cerradas')
      ?.items.find((item) => item.employee.id === 'emp-7')?.statusLabel
  ).toBe('Alta finalizada')
  expect(inbox.flatMap((lane) => lane.items).some((item) => item.employee.id === 'emp-8')).toBe(false)
})
