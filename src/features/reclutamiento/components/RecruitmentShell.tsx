'use client'

import { useState } from 'react'
import { RecruitmentDashboard } from './RecruitmentDashboard'
import { ModalPanel } from '@/components/ui/modal-panel'
import type { EmpleadosPanelData, EmpleadoListadoItem } from '@/features/empleados/services/empleadoService'
import { EmpleadoDetailModal } from '@/features/empleados/components/EmpleadosPanel' // Reusing for now
import { CrearEmpleadoForm } from '@/features/empleados/components/EmpleadosPanel' // Reusing for now
import type { Puesto } from '@/types/database'

interface RecruitmentShellProps {
  data: EmpleadosPanelData
  actorPuesto: Puesto
}

export function RecruitmentShell({ data, actorPuesto }: RecruitmentShellProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [recruitingCreateOpen, setRecruitingCreateOpen] = useState(false)

  const selectedEmployee = data.empleados.find((e) => e.id === selectedEmployeeId) ?? null

  return (
    <>
      <RecruitmentDashboard
        data={data}
        onOpen={(empleado) => setSelectedEmployeeId(empleado.id)}
        onCreateCandidate={() => setRecruitingCreateOpen(true)}
      />

      {selectedEmployee && (
        <EmpleadoDetailModal
          key={selectedEmployee.id}
          open
          onClose={() => setSelectedEmployeeId(null)}
          empleado={selectedEmployee}
          data={data}
          actorPuesto={actorPuesto}
        />
      )}

      <ModalPanel
        open={recruitingCreateOpen}
        onClose={() => setRecruitingCreateOpen(false)}
        title="Nuevo candidato"
        subtitle="Carga el CV filtrado, el PDV sugerido y deja listo el envio automático a Coordinación."
        maxWidthClassName="max-w-6xl"
      >
        <div className="space-y-4 p-1">
          <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold text-slate-950">Alta inicial desde Reclutamiento</p>
              <p className="mt-1 max-w-3xl">
                Aqui arranca el proceso. Solo cargas el CV ya filtrado, verificas los datos minimos y propones el PDV sugerido obligatorio para el candidato.
              </p>
            </div>
            <div className="text-sm text-slate-500">
              <p>
                Coordinadores activos:{' '}
                <span className="font-semibold text-slate-900">{data.coordinators.length}</span>
              </p>
              <p className="mt-1">
                OCR provider:{' '}
                <span className="font-semibold text-slate-900">{data.ocrProvider ?? 'sin configurar'}</span>
              </p>
            </div>
          </div>
          <CrearEmpleadoForm data={data} />
        </div>
      </ModalPanel>
    </>
  )
}
