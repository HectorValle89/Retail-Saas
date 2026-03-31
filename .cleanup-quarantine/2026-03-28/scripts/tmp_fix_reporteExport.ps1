$path='D:\IA\Retail\src\features\reportes\services\reporteExport.ts'
$content=Get-Content -Path $path -Raw -Encoding utf8
$pattern='(?s)async function collectOperationalCalendarExportPayload\(.*?\n\nexport async function collectReportExportPayload'
$replacement=@'
async function collectOperationalCalendarExportPayload(
  supabase: SupabaseClient,
  periodo: string
): Promise<ReportExportPayload> {
  const calendar = await getMaterializedMonthlyCalendar({ month: periodo }, supabase as never)
  const headers = buildOperationalCalendarHeaders(calendar.dias)

  if (calendar.empleados.length === 0) {
    return {
      filenameBase: `calendario-operativo-${periodo}`,
      headers,
      rows: [],
      sheetName: 'calendario',
      xlsx: {
        leadingRows: buildOperationalCalendarLeadingRows(periodo, calendar.dias),
        theme: 'operational_calendar',
        calendar: {
          staticColumnCount: CALENDAR_STATIC_HEADERS.length,
          dayColumnCount: calendar.dias.length,
          summaryColumnCount: 7,
          dayDates: calendar.dias,
        },
        columnWidths: buildOperationalCalendarColumnWidths(calendar.dias),
      },
    }
  }

  const employeeIds = calendar.empleados.map((item) => item.empleadoId)
  const fechaInicio = startOfMonth(periodo)
  const fechaFin = endOfMonth(periodo)

  const [employeesResult, assignmentsResult, attendancesResult] = await Promise.all([
    supabase.from('empleado').select('id, id_nomina, nombre_completo, puesto, zona').in('id', employeeIds),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, cuenta_cliente_id, fecha_inicio, fecha_fin, dias_laborales, dia_descanso, horario_referencia, naturaleza, prioridad, estado_publicacion')
      .in('empleado_id', employeeIds)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', fechaFin)
      .or(`fecha_fin.is.null,fecha_fin.gte.${fechaInicio}`),
    supabase
      .from('asistencia')
      .select('empleado_id, fecha_operacion, estatus, check_in_utc')
      .in('empleado_id', employeeIds)
      .gte('fecha_operacion', fechaInicio)
      .lte('fecha_operacion', fechaFin),
  ])

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message)
  }
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message)
  }
  if (attendancesResult.error) {
    throw new Error(attendancesResult.error.message)
  }

  const employees = (employeesResult.data ?? []) as ExportEmployeeRow[]
  const assignments = (assignmentsResult.data ?? []) as ExportAssignmentRow[]
  const attendances = (attendancesResult.data ?? []) as ExportAttendanceRow[]

  const referenceAssignmentByEmployee = new Map<string, ExportAssignmentRow | null>()
  const referencePdvIds = new Set<string>()
  const referenceCuentaIds = new Set<string>()

  for (const empleadoId of employeeIds) {
    const reference = chooseReferenceAssignment(assignments.filter((item) => item.empleado_id === empleadoId))
    referenceAssignmentByEmployee.set(empleadoId, reference)
    if (reference?.pdv_id) {
      referencePdvIds.add(reference.pdv_id)
    }
    if (reference?.cuenta_cliente_id) {
      referenceCuentaIds.add(reference.cuenta_cliente_id)
    }
  }

  const [pdvsResult, cuentasResult] = await Promise.all([
    referencePdvIds.size > 0
      ? supabase
          .from('pdv')
          .select('id, nombre, clave_btl, horario_entrada, horario_salida, cadena:cadena_id(id, nombre), ciudad:ciudad_id(id, nombre, estado)')
          .in('id', Array.from(referencePdvIds))
      : Promise.resolve({ data: [], error: null }),
    referenceCuentaIds.size > 0
      ? supabase.from('cuenta_cliente').select('id, nombre').in('id', Array.from(referenceCuentaIds))
      : Promise.resolve({ data: [], error: null }),
  ])

  if (pdvsResult.error) {
    throw new Error(pdvsResult.error.message)
  }
  if (cuentasResult.error) {
    throw new Error(cuentasResult.error.message)
  }

  const employeeById = new Map(employees.map((item) => [item.id, item]))
  const attendanceByEmployeeDate = new Map(attendances.map((item) => [`${item.empleado_id}::${item.fecha_operacion}`, item]))
  const pdvById = new Map(((pdvsResult.data ?? []) as ExportPdvRow[]).map((item) => [item.id, item]))
  const cuentaById = new Map(((cuentasResult.data ?? []) as ExportCuentaClienteRow[]).map((item) => [item.id, item.nombre]))
  const today = getMexicoToday()

  const rows = calendar.empleados.map((employee) => {
    const employeeRecord = employeeById.get(employee.empleadoId)
    const referenceAssignment = referenceAssignmentByEmployee.get(employee.empleadoId) ?? null
    const referencePdv = referenceAssignment?.pdv_id ? pdvById.get(referenceAssignment.pdv_id) ?? null : null
    const codes: string[] = []
    const specialDays = {
      descanso: [] as string[],
      incapacidad: [] as string[],
      vacaciones: [] as string[],
      formacion: [] as string[],
      justificada: [] as string[],
      falta: [] as string[],
      cumpleanos: [] as string[],
      sinAsignacion: [] as string[],
    }

    const dayCells = employee.dias.map((day) => {
      const attendance = attendanceByEmployeeDate.get(`${employee.empleadoId}::${day.fecha}`) ?? null
      const code = buildCalendarCellCode({ day, referenceAssignment, attendance, today })
      codes.push(code)

      if (code === 'DES') {
        specialDays.descanso.push(day.fecha)
      } else if (code === 'INC') {
        specialDays.incapacidad.push(day.fecha)
      } else if (code === 'VAC') {
        specialDays.vacaciones.push(day.fecha)
      } else if (code === 'FOR') {
        specialDays.formacion.push(day.fecha)
      } else if (code === 'JUS') {
        specialDays.justificada.push(day.fecha)
      } else if (code === 'FAL') {
        specialDays.falta.push(day.fecha)
      } else if (code === 'SIN') {
        specialDays.sinAsignacion.push(day.fecha)
      }

      if (Boolean(day.flags?.cumpleanos)) {
        specialDays.cumpleanos.push(day.fecha)
      }

      return code
    })

    const firstDayWithSchedule = employee.dias.find((day) => day.horarioInicio || day.horarioFin)
    const horario = referenceAssignment?.horario_referencia
      ?? (referencePdv?.horario_entrada && referencePdv?.horario_salida
        ? `${referencePdv.horario_entrada} a ${referencePdv.horario_salida}`
        : firstDayWithSchedule
          ? `${firstDayWithSchedule.horarioInicio ?? ''}${firstDayWithSchedule.horarioFin ? ` a ${firstDayWithSchedule.horarioFin}` : ''}`.trim()
          : '')

    return [
      cuentaById.get(referenceAssignment?.cuenta_cliente_id ?? '') ?? 'Sin cuenta',
      referencePdv?.clave_btl ?? employee.dias.find((day) => day.pdvClaveBtl)?.pdvClaveBtl ?? '',
      referencePdv?.nombre ?? employee.dias.find((day) => day.pdvNombre)?.pdvNombre ?? '',
      employeeRecord?.nombre_completo ?? employee.nombreCompleto,
      employeeRecord?.id_nomina ?? '',
      employeeRecord?.puesto ?? 'DERMOCONSEJERO',
      employee.supervisorNombre ?? 'Sin supervisor',
      employee.coordinadorNombre ?? 'Sin coordinador',
      obtenerPrimero(referencePdv?.ciudad)?.nombre ?? '',
      obtenerPrimero(referencePdv?.ciudad)?.estado ?? '',
      horario,
      formatWeekdays(referenceAssignment?.dias_laborales ?? null),
      String(referenceAssignment?.dia_descanso ?? '').trim().toUpperCase(),
      buildObservationSummary(specialDays),
      ...dayCells,
      countCodes(codes, ['1', 'RET', 'PEND']),
      countCodes(codes, ['INC']),
      countCodes(codes, ['VAC']),
      countCodes(codes, ['FOR']),
      countCodes(codes, ['JUS']),
      countCodes(codes, ['FAL']),
      countCodes(codes, ['SIN']),
    ]
  })

  const staticWidth = CALENDAR_STATIC_HEADERS.length
  const monthTitleStartColumn = staticWidth + 1
  const monthTitleEndColumn = staticWidth + Math.max(calendar.dias.length, 1)

  return {
    filenameBase: `calendario-operativo-${periodo}`,
    headers,
    rows,
    sheetName: 'calendario',
    xlsx: {
      leadingRows: buildOperationalCalendarLeadingRows(periodo, calendar.dias),
      merges: calendar.dias.length > 0
        ? [`${toColumnName(monthTitleStartColumn)}1:${toColumnName(monthTitleEndColumn)}1`]
        : [],
      freezeCell: `${toColumnName(staticWidth + 1)}4`,
      columnWidths: buildOperationalCalendarColumnWidths(calendar.dias),
      theme: 'operational_calendar',
      calendar: {
        staticColumnCount: CALENDAR_STATIC_HEADERS.length,
        dayColumnCount: calendar.dias.length,
        summaryColumnCount: 7,
        dayDates: calendar.dias,
      },
    },
  }
}

export async function collectReportExportPayload
