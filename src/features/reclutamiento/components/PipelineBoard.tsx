import { type ReactNode, useRef } from 'react'
import type { EmpleadoListadoItem } from '@/features/empleados/services/empleadoService'
import { StatusPill } from '@/components/ui/status-pill'

export interface PipelineBoardItem<TStage extends string> {
  id: string
  stageKey: TStage
  title: string
  line1: string
  line2: string
  empleado: EmpleadoListadoItem
}


export function ScrollablePipelineBoard<TStage extends string>({
  title,
  subtitle,
  stageOrder,
  items,
  getStageMeta,
  onOpen,
  emptyFooterLabel,
}: {
  title: string
  subtitle: string
  stageOrder: TStage[]
  items: Array<PipelineBoardItem<TStage>>
  getStageMeta: (stageKey: TStage) => { label: string; description: string; tone: string }
  onOpen: (empleado: EmpleadoListadoItem) => void
  emptyFooterLabel: string
}) {
  const boardScrollRef = useRef<HTMLDivElement | null>(null)
  const boardDragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
  })

  function handleBoardMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (!boardScrollRef.current) {
      return
    }

    boardDragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: boardScrollRef.current.scrollLeft,
    }
  }

  function handleBoardMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!boardDragRef.current.active || !boardScrollRef.current) {
      return
    }

    const delta = event.clientX - boardDragRef.current.startX
    if (Math.abs(delta) > 4) {
      boardDragRef.current.moved = true
    }

    boardScrollRef.current.scrollLeft = boardDragRef.current.scrollLeft - delta
  }

  function stopBoardDrag() {
    boardDragRef.current.active = false
  }

  function handleBoardClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!boardDragRef.current.moved) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    boardDragRef.current.moved = false
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div
        ref={boardScrollRef}
        className="cursor-grab overflow-x-auto pb-2 active:cursor-grabbing"
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={stopBoardDrag}
        onMouseLeave={stopBoardDrag}
        onClickCapture={handleBoardClickCapture}
      >
        <div className="flex min-w-max gap-4">
          {stageOrder.map((stageKey) => {
            const stageMeta = getStageMeta(stageKey)
            const stageItems = items.filter((item) => item.stageKey === stageKey)

            return (
              <div
                key={stageKey}
                className="flex w-[214px] shrink-0 flex-col rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
              >
                <div className="px-4 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-slate-950">
                      {stageMeta.label}
                    </p>
                    <StatusPill label={String(stageItems.length)} className={stageMeta.tone} />
                  </div>
                </div>

                <div className="flex-1 space-y-3 p-4">
                  {stageItems.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 text-center">
                      <p className="text-xs text-slate-400">{emptyFooterLabel}</p>
                    </div>
                  ) : (
                    stageItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpen(item.empleado)}
                        className="group w-full rounded-[20px] border border-slate-200 bg-white p-3 text-left transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
                      >
                        <p className="line-clamp-2 text-[13px] font-semibold text-slate-900 group-hover:text-[var(--module-text)]">
                          {item.title}
                        </p>
                        <div className="mt-2 space-y-1">
                          <p className="truncate text-[11px] text-slate-500">{item.line1}</p>
                          <p className="truncate text-[11px] text-slate-400">{item.line2}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
