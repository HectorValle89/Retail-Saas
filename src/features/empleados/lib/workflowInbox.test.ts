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
      nombreCompleto: 'Seleccion Aprobada',
      workflowStage: 'SELECCION_APROBADA',
    },
    baseEmployee,
    {
      ...baseEmployee,
      id: 'emp-2',
      nombreCompleto: 'Baja Devuelta',
      workflowStage: 'RECLUTAMIENTO_CORRECCION_BAJA',
      fechaBaja: '2026-03-15',
      imssObservaciones: 'Falta finiquito firmado',
    },
  ])

  expect(inbox.find((lane) => lane.key === 'altas-nuevas')?.items).toHaveLength(2)
  expect(inbox.find((lane) => lane.key === 'bajas-devueltas')?.items).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'bajas-devueltas')?.items[0]?.lastObservation).toBe(
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
      workflowCancelFromStage: 'EN_FLUJO_IMSS',
      workflowCancelAt: '2026-03-20T10:30:00.000Z',
      imssObservaciones: null,
      expedienteObservaciones: null,
    },
  ])

  const lane = inbox.find((item) => item.key === 'cancelados')
  expect(lane?.items).toHaveLength(1)
  expect(lane?.items[0]?.statusLabel).toBe('Alta cancelada')
  expect(lane?.items[0]?.lastObservation).toBe('Declino la oferta antes del alta IMSS')
})

test('agrupa bandeja de nomina por altas, bajas y cerradas', () => {
  const inbox = buildPayrollInbox([
    {
      ...baseEmployee,
      id: 'emp-0',
      nombreCompleto: 'Seleccion Aprobada',
      workflowStage: 'SELECCION_APROBADA',
    },
    baseEmployee,
    {
      ...baseEmployee,
      id: 'emp-2',
      workflowStage: 'EN_FLUJO_IMSS',
      imssEstado: 'EN_PROCESO',
    },
    {
      ...baseEmployee,
      id: 'emp-3',
      workflowStage: 'PENDIENTE_BAJA_IMSS',
      fechaBaja: '2026-03-15',
    },
    {
      ...baseEmployee,
      id: 'emp-4',
      workflowStage: 'PENDIENTE_ACCESO_ADMIN',
      imssEstado: 'ALTA_IMSS',
    },
  ])

  expect(inbox.find((lane) => lane.key === 'altas-imss')?.items).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'altas-en-proceso')?.items).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'bajas-pendientes')?.items).toHaveLength(1)
  expect(inbox.find((lane) => lane.key === 'cerradas')?.items).toHaveLength(2)
})
