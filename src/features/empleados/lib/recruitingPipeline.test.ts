import { expect, test } from 'vitest'
import {
  isRecruitingAltaPipelineEmployee,
  isRecruitingBajaPipelineEmployee,
  resolveRecruitingAltaPipelineStage,
  resolveRecruitingBajaPipelineStage,
} from './recruitingPipeline'

const altaBase = {
  recruitmentSource: 'modulo_empleados_reclutamiento',
  candidateProfileSource: 'CV_GEMINI',
  workflowStage: 'PENDIENTE_IMSS_NOMINA',
  imssEstado: 'PENDIENTE_DOCUMENTOS',
  expedienteEstado: 'VALIDADO',
  adminAccessPending: false,
  onboarding: {
    accesosExternosStatus: 'CONFIRMADO',
    expedienteCompletoRecibido: true,
    contratoStatus: 'FIRMADO',
  },
} as const

test('saca del embudo de reclutamiento solo las altas cerradas definitivamente', () => {
  expect(
    isRecruitingAltaPipelineEmployee({
      ...altaBase,
      workflowStage: 'ALTA_IMSS_CERRADA',
      imssEstado: 'ALTA_IMSS',
    })
  ).toBe(false)

  expect(
    isRecruitingAltaPipelineEmployee({
      ...altaBase,
      workflowStage: 'PENDIENTE_ACCESO_ADMIN',
      imssEstado: 'ALTA_IMSS',
    })
  ).toBe(true)

  expect(
    isRecruitingAltaPipelineEmployee({
      ...altaBase,
      workflowStage: 'PENDIENTE_VALIDACION_FINAL',
      imssEstado: 'ALTA_IMSS',
    })
  ).toBe(true)
})

test('no mete expedientes historicos sin origen de reclutamiento al pipeline', () => {
  expect(
    resolveRecruitingAltaPipelineStage({
      ...altaBase,
      recruitmentSource: null,
      workflowStage: 'PENDIENTE_COORDINACION',
    })
  ).toBe(null)
})

test('no clasifica como pipeline reclutamiento solo por tener OCR de CV', () => {
  expect(
    resolveRecruitingAltaPipelineStage({
      ...altaBase,
      recruitmentSource: null,
      candidateProfileSource: 'CV_GEMINI',
      workflowStage: 'PENDIENTE_COORDINACION',
    })
  ).toBe(null)
})

test('mantiene en el embudo las etapas nuevas, expediente, gestion y onboarding', () => {
  expect(resolveRecruitingAltaPipelineStage(altaBase)).toBe('EN_GESTION')
  expect(
    resolveRecruitingAltaPipelineStage({
      ...altaBase,
      workflowStage: 'RECLUTAMIENTO_CORRECCION_ALTA',
      imssEstado: 'PENDIENTE_DOCUMENTOS',
    })
  ).toBe('CANCELADOS')
  expect(
    resolveRecruitingAltaPipelineStage({
      ...altaBase,
      workflowStage: 'SELECCION_APROBADA',
      imssEstado: 'NO_INICIADO',
      onboarding: {
        ...altaBase.onboarding,
        expedienteCompletoRecibido: false,
        contratoStatus: 'PENDIENTE',
      },
    })
  ).toBe('EXPEDIENTE')
  expect(
    resolveRecruitingAltaPipelineStage({
      ...altaBase,
      expedienteEstado: 'VALIDADO',
      workflowStage: 'PENDIENTE_VALIDACION_FINAL',
      imssEstado: 'PENDIENTE_DOCUMENTOS',
      onboarding: {
        ...altaBase.onboarding,
        expedienteCompletoRecibido: true,
        contratoStatus: 'PENDIENTE',
      },
    })
  ).toBe('ONBOARDING')
})

test('clasifica el pipeline de bajas solo con estados pendientes o devueltos', () => {
  expect(
    isRecruitingBajaPipelineEmployee({
      workflowStage: 'PENDIENTE_BAJA_IMSS',
      recruitmentSource: 'modulo_empleados_reclutamiento',
      candidateProfileSource: 'CV_GEMINI',
    })
  ).toBe(true)
  expect(
    resolveRecruitingBajaPipelineStage({
      workflowStage: 'PENDIENTE_BAJA_IMSS',
      recruitmentSource: 'modulo_empleados_reclutamiento',
      candidateProfileSource: 'CV_GEMINI',
    })
  ).toBe(
    'BAJAS_SOLICITADAS'
  )
  expect(
    resolveRecruitingBajaPipelineStage({
      workflowStage: 'RECLUTAMIENTO_CORRECCION_BAJA',
      recruitmentSource: 'modulo_empleados_reclutamiento',
      candidateProfileSource: 'CV_GEMINI',
    })
  ).toBe(
    'BAJAS_DEVUELTAS'
  )
  expect(
    resolveRecruitingBajaPipelineStage({
      workflowStage: 'BAJA_IMSS_CERRADA',
      recruitmentSource: 'modulo_empleados_reclutamiento',
      candidateProfileSource: 'CV_GEMINI',
    })
  ).toBe(null)
})
