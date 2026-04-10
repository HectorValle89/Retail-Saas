'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import type { RankingDcItem, RankingPanelData, RankingPdvItem, RankingQuotaZonaItem, RankingSupervisorItem, RankingZonaItem } from '../services/rankingService'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

function buildHref(data: RankingPanelData, overrides: Record<string, string>) {
  const params = new URLSearchParams({
    periodo: data.filtros.periodo,
    corte: data.filtros.corte,
    zona: data.filtros.zona,
    supervisorId: data.filtros.supervisorId,
    ...overrides,
  })

  for (const [key, value] of Array.from(params.entries())) {
    if (!value) {
      params.delete(key)
    }
  }

  return `/ranking?${params.toString()}`
}

export function RankingsPanel({ data }: { data: RankingPanelData }) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-slate-50">
        <form action="/ranking" method="get" className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-[1fr_180px_180px_220px_auto] xl:items-end">
          <Field label="Periodo" htmlFor="periodo"><input id="periodo" name="periodo" type="month" defaultValue={data.filtros.periodo} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" /></Field>
          <Field label="Corte" htmlFor="corte"><select id="corte" name="corte" defaultValue={data.filtros.corte} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"><option value="SEMANA">Semana</option><option value="MES">Mes</option><option value="ACUMULADO">Acumulado</option></select></Field>
          <Field label="Zona" htmlFor="zona"><select id="zona" name="zona" defaultValue={data.filtros.zona} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"><option value="">Todas</option>{data.opcionesFiltro.zonas.map((zona) => <option key={zona} value={zona}>{zona}</option>)}</select></Field>
          <Field label="Supervisor" htmlFor="supervisorId"><select id="supervisorId" name="supervisorId" defaultValue={data.filtros.supervisorId} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"><option value="">Todos</option>{data.opcionesFiltro.supervisores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></Field>
          <div className="flex gap-3"><Button type="submit">Aplicar</Button></div>
        </form>
      </Card>

      {!data.infraestructuraLista && <Card className="border-amber-200 bg-amber-50 text-amber-900"><p className="font-medium">Infraestructura pendiente</p><p className="mt-2 text-sm">{data.mensajeInfraestructura}</p></Card>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="DCs visibles" value={String(data.resumen.totalDcs)} />
        <MetricCard label="Supervisores visibles" value={String(data.resumen.totalSupervisores)} />
        <MetricCard label="Zonas visibles" value={String(data.resumen.totalZonas)} />
        <MetricCard label="PDVs visibles" value={String(data.resumen.totalPdvs)} />
        <MetricCard label="Mi posicion ventas" value={data.resumen.miPosicionVentas ? `#${data.resumen.miPosicionVentas}` : 'Sin posicion'} />
        <MetricCard label="Mi posicion LOVE" value={data.resumen.miPosicionLove ? `#${data.resumen.miPosicionLove}` : 'Sin posicion'} />
      </div>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">Ranking operativo</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{data.scopeLabel}</h2>
            <p className="mt-1 text-sm text-slate-600">{data.rangoEtiqueta}. TTL del snapshot agregado: 15 minutos.</p>
          </div>
          <p className="text-xs text-slate-500">Generado {data.generatedAt ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt)) : 'sin timestamp'}</p>
        </div>
      </Card>

      <CompactRankingCards title="Top ventas" items={data.ventasDcs} metricLabel="monto" renderMetric={(item) => formatCurrency(item.montoConfirmado)} hrefBuilder={(item) => buildHref(data, { supervisorId: item.supervisorId ?? '', zona: item.zona })} />
      <DesktopRankingSection title="Ranking de ventas por DC" description="Top de colaboradoras por monto confirmado, cierres y volumen en el corte seleccionado." headers={['#', 'Colaboradora', 'Supervisor', 'Zona', 'Volumen', 'Monto']} rows={data.ventasDcs.map((item) => ({ key: item.empleadoId, cells: [<strong key="pos" className="text-slate-950">#{item.posicion}</strong>, <DcIdentity key="dc" item={item} />, <span key="sup" className="text-slate-600">{item.supervisorNombre}</span>, <span key="zona" className="text-slate-600">{item.zona}</span>, <div key="vol" className="text-slate-600"><div>{item.ventasConfirmadas} cierres</div><div className="mt-1 text-xs text-slate-400">{item.unidadesConfirmadas} uds</div></div>, <span key="monto" className="font-medium text-emerald-700">{formatCurrency(item.montoConfirmado)}</span>] }))} emptyMessage="Sin ventas confirmadas en este corte." />

      <CompactRankingCards title="Top LOVE ISDIN" items={data.loveDcs} metricLabel="cumplimiento" renderMetric={(item) => `${item.afiliacionesLove}/${item.loveObjetivo} · ${item.cumplimientoLovePct.toFixed(0)}%`} hrefBuilder={(item) => buildHref(data, { supervisorId: item.supervisorId ?? '', zona: item.zona })} />
      <DesktopRankingSection title="Ranking LOVE ISDIN por DC" description="Afiliaciones por colaboradora contra objetivo operativo del corte." headers={['#', 'Colaboradora', 'Supervisor', 'Zona', 'Afiliaciones', 'Meta', 'Cumplimiento', 'Validas']} rows={data.loveDcs.map((item) => ({ key: `${item.empleadoId}-love`, cells: [<strong key="pos" className="text-slate-950">#{item.posicion}</strong>, <DcIdentity key="dc" item={item} />, <span key="sup" className="text-slate-600">{item.supervisorNombre}</span>, <span key="zona" className="text-slate-600">{item.zona}</span>, <span key="af" className="text-slate-600">{item.afiliacionesLove}</span>, <span key="meta" className="text-sky-700">{item.loveObjetivo}</span>, <span key="cumplimiento" className="font-medium text-slate-900">{item.cumplimientoLovePct.toFixed(2)}%</span>, <span key="val" className="font-medium text-sky-700">{item.validasLove}</span>] }))} emptyMessage="Sin afiliaciones LOVE en este corte." />

      <CompactPdvCards items={data.pdvs} />
      <DesktopRankingSection title="Ranking de PDVs por volumen de ventas" description="Comparativo por punto de venta usando monto confirmado, cierres, unidades y colaboradoras activas." headers={['#', 'PDV', 'Zona', 'DCs', 'Cierres', 'Unidades', 'Monto']} rows={data.pdvs.map((item) => ({ key: item.pdvId, cells: [<strong key="pos" className="text-slate-950">#{item.posicion}</strong>, <div key="pdv" className="text-slate-600"><div className="font-medium text-slate-900">{item.pdv}</div><div className="mt-1 text-xs text-slate-400">{item.claveBtl ?? 'sin clave'} / {item.cuentaCliente ?? 'Sin cliente'}</div></div>, <span key="zona" className="text-slate-600">{item.zona}</span>, <span key="dcs" className="text-slate-600">{item.dcsActivos}</span>, <span key="cierres" className="text-slate-600">{item.ventasConfirmadas}</span>, <span key="unidades" className="text-slate-600">{item.unidadesConfirmadas}</span>, <span key="monto" className="font-medium text-emerald-700">{formatCurrency(item.montoConfirmado)}</span>] }))} emptyMessage="Sin PDVs con ventas confirmadas en este corte." />

      <div className="grid gap-6 xl:grid-cols-3">
        <CompactSupervisorCards items={data.supervisores} />
        <CompactZonaCards items={data.zonas} />
        <CompactQuotaZonaCards items={data.cuotasZonas} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DesktopRankingSection title="Ranking por supervisor" description="Posicion consolidada por jefe de equipo usando monto confirmado y cumplimiento LOVE del corte." headers={['#', 'Supervisor', 'Zona', 'DCs', 'Ventas', 'LOVE', 'Meta', 'Cumplimiento', 'Score']} rows={data.supervisores.map((item) => ({ key: item.supervisorId, cells: [<strong key="pos" className="text-slate-950">#{item.posicion}</strong>, <div key="sup" className="text-slate-600"><div className="font-medium text-slate-900">{item.supervisorNombre}</div><div className="mt-1 text-xs text-slate-400">{item.cuentaCliente ?? 'Sin cliente'}{item.esActorActual ? ' / tu equipo' : ''}</div></div>, <span key="zona" className="text-slate-600">{item.zona}</span>, <span key="dcs" className="text-slate-600">{item.dcsActivos}</span>, <div key="ventas" className="text-slate-600"><div>{item.ventasConfirmadas} cierres</div><div className="mt-1 text-xs text-slate-400">{formatCurrency(item.montoConfirmado)}</div></div>, <span key="love" className="text-slate-600">{item.afiliacionesLove}</span>, <span key="meta" className="text-sky-700">{item.loveObjetivo}</span>, <span key="cumplimiento" className="font-medium text-slate-900">{item.cumplimientoLovePct.toFixed(2)}%</span>, <span key="score" className="font-medium text-slate-900">{item.scoreMixto.toFixed(2)}</span>] }))} emptyMessage="Sin supervisores visibles en este corte." />
        <DesktopRankingSection title="Ranking por zona" description="Comparativo compacto por zona con avance LOVE contra objetivo." headers={['#', 'Zona', 'DCs', 'Supervisores', 'Ventas', 'LOVE', 'Meta', 'Cumplimiento', 'Score']} rows={data.zonas.map((item) => ({ key: item.zona, cells: [<strong key="pos" className="text-slate-950">#{item.posicion}</strong>, <div key="zona" className="text-slate-600"><div className="font-medium text-slate-900">{item.zona}</div><div className="mt-1 text-xs text-slate-400">{item.cuentaCliente ?? 'Sin cliente'}</div></div>, <span key="dcs" className="text-slate-600">{item.dcsActivos}</span>, <span key="sup" className="text-slate-600">{item.supervisoresActivos}</span>, <div key="ventas" className="text-slate-600"><div>{item.ventasConfirmadas} cierres</div><div className="mt-1 text-xs text-slate-400">{formatCurrency(item.montoConfirmado)}</div></div>, <span key="love" className="text-slate-600">{item.afiliacionesLove}</span>, <span key="meta" className="text-sky-700">{item.loveObjetivo}</span>, <span key="cumplimiento" className="font-medium text-slate-900">{item.cumplimientoLovePct.toFixed(2)}%</span>, <span key="score" className="font-medium text-slate-900">{item.scoreMixto.toFixed(2)}</span>] }))} emptyMessage="Sin zonas visibles en este corte." />
        <DesktopRankingSection title="Cuotas por zona" description="Cumplimiento promedio y zonas en riesgo para supervisor y coordinacion en el periodo seleccionado." headers={['#', 'Zona', 'DCs', 'Supervisores', 'Cuotas', 'Cumplidas', 'Riesgo', 'Cumplimiento']} rows={data.cuotasZonas.map((item) => ({ key: `${item.zona}-${item.cuentaCliente ?? 'sin-cuenta'}`, cells: [<strong key="pos" className="text-slate-950">#{item.posicion}</strong>, <div key="zona" className="text-slate-600"><div className="font-medium text-slate-900">{item.zona}</div><div className="mt-1 text-xs text-slate-400">{item.cuentaCliente ?? 'Sin cliente'}</div></div>, <span key="dcs" className="text-slate-600">{item.dcsActivos}</span>, <span key="sup" className="text-slate-600">{item.supervisoresActivos}</span>, <span key="cuotas" className="text-slate-600">{item.cuotasTotales}</span>, <span key="cumplidas" className="font-medium text-emerald-700">{item.cuotasCumplidas}</span>, <span key="riesgo" className="font-medium text-rose-700">{item.cuotasEnRiesgo}</span>, <span key="cumplimiento" className="font-medium text-slate-900">{item.cumplimientoPromedio.toFixed(2)}%</span>] }))} emptyMessage="Sin cuotas visibles en este corte." />
      </div>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <div><label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-900">{label}</label>{children}</div>
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
}

function DcIdentity({ item }: { item: RankingDcItem }) {
  return <div className="text-slate-600"><div className="font-medium text-slate-900">{item.empleado}{item.esActorActual ? ' · tu posicion' : ''}</div><div className="mt-1 text-xs text-slate-400">{item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'} / {item.cuentaCliente ?? 'Sin cliente'}</div></div>
}

function CompactRankingCards({ title, items, metricLabel, renderMetric, hrefBuilder }: { title: string; items: RankingDcItem[]; metricLabel: string; renderMetric: (item: RankingDcItem) => string; hrefBuilder: (item: RankingDcItem) => string }) {
  return <section className="space-y-3 lg:hidden"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-950">{title}</h3><span className="text-xs uppercase tracking-[0.18em] text-slate-400">Vista compacta</span></div>{items.length === 0 ? <Card className="border-slate-200 bg-white text-sm text-slate-500">Sin datos visibles.</Card> : items.slice(0, 5).map((item) => <Link key={`${title}-${item.empleadoId}`} href={hrefBuilder(item)} prefetch={false} className="block"><Card className="border-slate-200 bg-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">#{item.posicion}</p><p className="mt-2 text-base font-semibold text-slate-950">{item.empleado}</p><p className="mt-1 text-xs text-slate-500">{item.supervisorNombre} · {item.zona}</p></div><div className="text-right"><p className="text-xs text-slate-500">{metricLabel}</p><p className="mt-2 text-lg font-semibold text-slate-950">{renderMetric(item)}</p></div></div></Card></Link>)}</section>
}

function CompactSupervisorCards({ items }: { items: RankingSupervisorItem[] }) {
  return <section className="space-y-3 lg:hidden"><h3 className="text-lg font-semibold text-slate-950">Supervisores</h3>{items.length === 0 ? <Card className="border-slate-200 bg-white text-sm text-slate-500">Sin supervisores visibles.</Card> : items.slice(0, 5).map((item) => <Card key={item.supervisorId} className="border-slate-200 bg-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">#{item.posicion}</p><p className="mt-2 text-base font-semibold text-slate-950">{item.supervisorNombre}</p><p className="mt-1 text-xs text-slate-500">{item.zona} · {item.dcsActivos} DCs</p></div><div className="text-right text-sm text-slate-600"><p>{formatCurrency(item.montoConfirmado)}</p><p className="mt-1 text-xs text-slate-400">LOVE {item.afiliacionesLove}/{item.loveObjetivo} · {item.cumplimientoLovePct.toFixed(0)}%</p></div></div></Card>)}</section>
}

function CompactZonaCards({ items }: { items: RankingZonaItem[] }) {
  return <section className="space-y-3 lg:hidden"><h3 className="text-lg font-semibold text-slate-950">Zonas</h3>{items.length === 0 ? <Card className="border-slate-200 bg-white text-sm text-slate-500">Sin zonas visibles.</Card> : items.slice(0, 5).map((item) => <Card key={item.zona} className="border-slate-200 bg-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">#{item.posicion}</p><p className="mt-2 text-base font-semibold text-slate-950">{item.zona}</p><p className="mt-1 text-xs text-slate-500">{item.dcsActivos} DCs · {item.supervisoresActivos} supervisores</p></div><div className="text-right text-sm text-slate-600"><p>{formatCurrency(item.montoConfirmado)}</p><p className="mt-1 text-xs text-slate-400">LOVE {item.afiliacionesLove}/{item.loveObjetivo} · {item.cumplimientoLovePct.toFixed(0)}%</p></div></div></Card>)}</section>
}

function CompactQuotaZonaCards({ items }: { items: RankingQuotaZonaItem[] }) {
  return <section className="space-y-3 lg:hidden"><h3 className="text-lg font-semibold text-slate-950">Cuotas por zona</h3>{items.length === 0 ? <Card className="border-slate-200 bg-white text-sm text-slate-500">Sin cuotas visibles.</Card> : items.slice(0, 5).map((item) => <Card key={`${item.zona}-${item.cuentaCliente ?? 'sin-cuenta'}`} className="border-slate-200 bg-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">#{item.posicion}</p><p className="mt-2 text-base font-semibold text-slate-950">{item.zona}</p><p className="mt-1 text-xs text-slate-500">{item.dcsActivos} DCs · {item.supervisoresActivos} supervisores</p></div><div className="text-right text-sm text-slate-600"><p>{item.cumplimientoPromedio.toFixed(2)}%</p><p className="mt-1 text-xs text-slate-400">Cumplidas {item.cuotasCumplidas} · Riesgo {item.cuotasEnRiesgo}</p></div></div></Card>)}</section>
}

function CompactPdvCards({ items }: { items: RankingPdvItem[] }) {
  return <section className="space-y-3 lg:hidden"><h3 className="text-lg font-semibold text-slate-950">PDVs</h3>{items.length === 0 ? <Card className="border-slate-200 bg-white text-sm text-slate-500">Sin PDVs visibles.</Card> : items.slice(0, 5).map((item) => <Card key={item.pdvId} className="border-slate-200 bg-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">#{item.posicion}</p><p className="mt-2 text-base font-semibold text-slate-950">{item.pdv}</p><p className="mt-1 text-xs text-slate-500">{item.zona} · {item.dcsActivos} DCs</p></div><div className="text-right text-sm text-slate-600"><p>{formatCurrency(item.montoConfirmado)}</p><p className="mt-1 text-xs text-slate-400">{item.ventasConfirmadas} cierres · {item.unidadesConfirmadas} uds</p></div></div></Card>)}</section>
}

function DesktopRankingSection({ title, description, headers, rows, emptyMessage }: { title: string; description: string; headers: string[]; rows: Array<{ key: string; cells: ReactNode[] }>; emptyMessage: string }) {
  return <Card className="hidden overflow-hidden p-0 lg:block"><div className="border-b border-slate-200 px-6 py-4"><h3 className="text-lg font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-6 py-3 font-medium">{header}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-6 py-8 text-center text-slate-500">{emptyMessage}</td></tr> : rows.map((row) => <tr key={row.key} className="border-t border-slate-100 align-top">{row.cells.map((cell, index) => <td key={`${row.key}-${index}`} className="px-6 py-4">{cell}</td>)}</tr>)}</tbody></table></div></Card>
}
