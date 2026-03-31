import { expect, test } from '@playwright/test'
import {
  buildEmpleadoOcrSnapshot,
  deriveYearsFromAgencyStartDate,
} from '../src/features/empleados/lib/ocrMapping'

test('normaliza snapshot OCR de empleados en mayusculas y no usa fecha de ingreso OCR para altas', () => {
  const snapshot = buildEmpleadoOcrSnapshot({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    status: 'needs_review',
    documentTypeExpected: 'EXPEDIENTE_COMPLETO',
    documentTypeDetected: 'EXPEDIENTE_COMPLETO',
    employeeName: 'Sara Luz Ramirez del Toro',
    curp: 'rats981105mjcMRR06',
    rfc: 'rats981105fp7',
    nss: '53169825675',
    address: 'Jesús Urueta #1357, Colonia El Mirador, Guadalajara, Jalisco.',
    postalCode: '44370',
    phoneNumber: '3318574552',
    email: 'RamirezSaraL98@Gmail.com',
    birthDate: '1998-11-05',
    employmentStartDate: '2016-11-24',
    age: 27,
    yearsWorking: 9,
    sex: 'Femenino',
    maritalStatus: 'Soltero',
    originPlace: 'Guadalajara, Jalisco',
    dailyBaseSalary: 333.33,
    addressSourceDocumentType: 'comprobante_domicilio',
    employer: null,
    position: 'Dermoconsejero',
    documentNumber: null,
    keyDates: [],
    extractedText: null,
    confidenceSummary: null,
    mismatchHints: [],
    observations: [],
    errorMessage: null,
    extractedAt: '2026-03-20T00:00:00.000Z',
    usage: null,
  })

  expect(snapshot).toMatchObject({
    nombreCompleto: 'SARA LUZ RAMIREZ DEL TORO',
    curp: 'RATS981105MJCMRR06',
    rfc: 'RATS981105FP7',
    nss: '53169825675',
    direccion: 'JESÚS URUETA #1357, COLONIA EL MIRADOR, GUADALAJARA, JALISCO.',
    correoElectronico: 'ramirezsaral98@gmail.com',
    fechaIngreso: null,
    aniosLaborando: 0,
    sexo: 'FEMENINO',
    estadoCivil: 'SOLTERO',
    originario: 'GUADALAJARA, JALISCO',
    fuenteDireccion: 'COMPROBANTE_DOMICILIO',
  })
})

test('calcula anios laborando desde la fecha operativa de ingreso', () => {
  const today = new Date().toISOString().slice(0, 10)

  expect(deriveYearsFromAgencyStartDate(today)).toBe(0)
  expect(deriveYearsFromAgencyStartDate(null)).toBeNull()
})
