'use client'

import { Card } from '@/components/ui/card'
import type { RankingPublicDcItem, RankingPublicPanelData, RankingPublicPdvItem } from '../services/rankingService'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

export function PublicRankingsPanel({ data }: { data: RankingPublicPanelData }) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">Muro publico</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">{data.scopeLabel}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {data.rangoEtiqueta}. Vista abierta sin IDs internos, cuentas cliente ni supervisores.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Actualizado {data.generatedAt ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt)) : 'sin timestamp'}
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <PublicSection
          title="Top ventas"
          description="Colaboradoras lideres por monto confirmado."
          emptyMessage="Sin ventas publicas visibles."
          items={data.ventasDcs}
          renderMeta={(item) => `${item.zona} · ${item.unidadesConfirmadas} uds`}
          renderValue={(item) => formatCurrency(item.montoConfirmado)}
        />
        <PublicSection
          title="Top LOVE ISDIN"
          description="Afiliaciones visibles sin exponer datos sensibles."
          emptyMessage="Sin afiliaciones publicas visibles."
          items={data.loveDcs}
          renderMeta={(item) => `${item.zona} · ${formatCurrency(item.montoConfirmado)}`}
          renderValue={(item) => `${item.afiliacionesLove} afiliaciones`}
        />
        <PublicPdvSection items={data.pdvs} />
      </div>
    </div>
  )
}

function PublicSection({
  title,
  description,
  emptyMessage,
  items,
  renderMeta,
  renderValue,
}: {
  title: string
  description: string
  emptyMessage: string
  items: RankingPublicDcItem[]
  renderMeta: (item: RankingPublicDcItem) => string
  renderValue: (item: RankingPublicDcItem) => string
}) {
  return (
    <Card className="border-slate-200 bg-white">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.posicion}-${item.colaboradora}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">#{item.posicion}</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{item.colaboradora}</p>
                  <p className="mt-1 text-xs text-slate-500">{renderMeta(item)}</p>
                </div>
                <p className="text-right text-base font-semibold text-slate-950">{renderValue(item)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function PublicPdvSection({ items }: { items: RankingPublicPdvItem[] }) {
  return (
    <Card className="border-slate-200 bg-white">
      <h2 className="text-lg font-semibold text-slate-950">Top PDVs</h2>
      <p className="mt-1 text-sm text-slate-500">Puntos de venta con mayor volumen confirmado.</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Sin PDVs publicos visibles.</p>
        ) : (
          items.map((item) => (
            <div key={item.pdv} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">#{item.posicion}</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{item.pdv}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.zona} · {item.ventasConfirmadas} cierres</p>
                </div>
                <p className="text-right text-base font-semibold text-slate-950">{formatCurrency(item.montoConfirmado)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
