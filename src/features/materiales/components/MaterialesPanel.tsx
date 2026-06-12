'use client';

import {
  Fragment,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  EvidencePreview,
  Input,
  MetricCard as SharedMetricCard,
  Select,
} from '@/components/ui';
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { ActorActual } from '@/lib/auth/session';
import { queueOfflineMaterialEntrega } from '@/lib/offline/syncQueue';
import { useScopedWidgetData } from '@/lib/ui-change/client';
import { getUiChangeScopeKeysForActor } from '@/lib/ui-change/types';
import {
  getSingleTenantAccountLabel,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant';
import {
  confirmarDistribucionMateriales,
  confirmarRecepcionMaterial,
  cancelarCapsulaUltimaMillaInvalida,
  descartarPreviewMateriales,
  guardarMaterialCatalogo,
  importarDistribucionMateriales,
  registrarEntregaPromocional,
  registrarConteoJornadaMaterial,
  registrarEvidenciaMercadeoMaterial,
  importarInventarioInicialCanjes,
} from '../actions';
import { ESTADO_MATERIAL_IMPORTACION_INICIAL, ESTADO_MATERIAL_INICIAL } from '../state';
import { AdminInventarioInicialSection } from './AdminInventarioInicialSection';
import type {
  MaterialDistributionItem,
  MaterialLastMileReceiverOption,
  MaterialLotPreviewItem,
  MaterialesPanelData,
} from '../services/materialService';
import {
  fileToDataUrl,
  isHeifLikeFile,
  stampMaterialEvidencePhoto,
} from '../lib/materialEvidenceCapture';
import { injectDirectR2Upload } from '@/lib/storage/directR2Client';

const ADMIN_ROLES = ['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA'];
const EVIDENCE_IMAGE_ACCEPT = 'image/*,.heic,.heif,.hif,image/heic,image/heif';
type InventoryCapsule = 'overview' | 'upload' | 'review' | 'reports';

type MaterialesPanelPayload = {
  data?: MaterialesPanelData;
  message?: string;
  redirectTo?: string | null;
};

interface MaterialCameraCaptureDraft {
  file: File;
  previewUrl: string;
  dataUrl: string;
  fileName: string;
  fileSize: number;
  capturedAt: string;
  targetBytes: number;
  targetMet: boolean;
}

export function MaterialesPanel({
  actor,
  data: initialData,
}: {
  actor: ActorActual;
  data: MaterialesPanelData;
}) {
  const [panelMode, setPanelMode] = useState<MaterialesPanelData['loadMode']>(initialData.loadMode);
  const [activeCapsule, setActiveCapsule] = useState<InventoryCapsule>(
    initialData.loadMode === 'upload' ||
      initialData.loadMode === 'review' ||
      initialData.loadMode === 'reports'
      ? initialData.loadMode
      : 'overview'
  );
  const [demandDataByCapsule, setDemandDataByCapsule] = useState<
    Partial<Record<InventoryCapsule, MaterialesPanelData>>
  >({});
  const [loadingCapsule, setLoadingCapsule] = useState<InventoryCapsule | null>(null);
  const [capsuleError, setCapsuleError] = useState<string | null>(null);
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor]);
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch(`/api/materiales/panel?mode=${panelMode}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      const payload = await readMaterialesPanelPayload(response);

      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? 'No fue posible refrescar el panel de materiales.');
      }

      return payload.data;
    },
    [panelMode]
  );

  const { data: liveData } = useScopedWidgetData({
    initialData,
    module: 'materiales',
    surfaces: ['panel', 'all'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 650,
  });
  const data = demandDataByCapsule[activeCapsule] ?? liveData;

  const [selectedMonth, setSelectedMonth] = useState(data.currentMonth);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [selectedTipoDispersion, setSelectedTipoDispersion] = useState('');
  const [monthlyReportRequested, setMonthlyReportRequested] = useState(false);
  const fixedAccount = resolveSingleTenantAccountOption(data.accountOptions);
  const selectedAccountId = fixedAccount?.id ?? data.accountOptions[0]?.id ?? '';
  const [catalogState, catalogAction] = useActionState(
    guardarMaterialCatalogo,
    ESTADO_MATERIAL_INICIAL
  );
  const [importState, importAction] = useActionState(
    importarDistribucionMateriales,
    ESTADO_MATERIAL_IMPORTACION_INICIAL
  );
  const [inventarioInicialState, inventarioInicialAction] = useActionState(
    importarInventarioInicialCanjes,
    ESTADO_MATERIAL_INICIAL
  );
  const [invalidCapsuleState, invalidCapsuleAction] = useActionState(
    cancelarCapsulaUltimaMillaInvalida,
    ESTADO_MATERIAL_INICIAL
  );
  const isAdminPanel = ADMIN_ROLES.includes(data.actorRole);
  const isAdminOverview = isAdminPanel && activeCapsule === 'overview';
  const isAdminUpload = isAdminPanel && activeCapsule === 'upload';
  const isAdminReview = isAdminPanel && activeCapsule === 'review';
  const isAdminReports = isAdminPanel && activeCapsule === 'reports';

  const loadCapsule = useCallback(
    async (capsule: InventoryCapsule) => {
      setActiveCapsule(capsule);
      setPanelMode(capsule);
      if (capsule === 'overview' || demandDataByCapsule[capsule]) {
        return;
      }

      setLoadingCapsule(capsule);
      setCapsuleError(null);
      try {
        const response = await fetch(`/api/materiales/panel?mode=${capsule}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const payload = await readMaterialesPanelPayload(response);
        if (!response.ok || !payload.data) {
          throw new Error(payload.message ?? 'No fue posible cargar la cápsula seleccionada.');
        }
        setDemandDataByCapsule((current) => ({ ...current, [capsule]: payload.data }));
      } catch (error) {
        setCapsuleError(
          error instanceof Error ? error.message : 'No fue posible cargar la cápsula seleccionada.'
        );
      } finally {
        setLoadingCapsule(null);
      }
    },
    [demandDataByCapsule]
  );

  const distributionById = useMemo(
    () => new Map(data.distributions.map((item) => [item.id, item])),
    [data.distributions]
  );

  const supervisorFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos los supervisores' },
      ...data.supervisorOptions.map((item) => ({ value: item.id, label: item.label })),
    ],
    [data.supervisorOptions]
  );

  const selectedSupervisorLabel = useMemo(
    () =>
      supervisorFilterOptions.find((item) => item.value === selectedSupervisorId)?.label ??
      'Todos los supervisores',
    [selectedSupervisorId, supervisorFilterOptions]
  );

  const handleMonthChange = useCallback((value: string) => {
    setSelectedMonth(value);
    setMonthlyReportRequested(false);
  }, []);

  const handleSupervisorChange = useCallback((value: string) => {
    setSelectedSupervisorId(value);
    setMonthlyReportRequested(false);
  }, []);

  const handleTipoDispersionChange = useCallback((value: string) => {
    setSelectedTipoDispersion(value);
    setMonthlyReportRequested(false);
  }, []);

  const monthDistributions = useMemo(
    () =>
      data.distributions.filter((item) => {
        if (item.mesOperacion !== selectedMonth) {
          return false;
        }
        if (selectedAccountId && item.cuentaClienteId !== selectedAccountId) {
          return false;
        }
        if (selectedSupervisorId && item.supervisorEmpleadoId !== selectedSupervisorId) {
          return false;
        }
        if (selectedTipoDispersion && item.tipoDispersion !== selectedTipoDispersion) {
          return false;
        }
        return true;
      }),
    [
      data.distributions,
      selectedAccountId,
      selectedMonth,
      selectedSupervisorId,
      selectedTipoDispersion,
    ]
  );

  const summary = useMemo(() => {
    return monthDistributions.reduce(
      (acc, item) => {
        acc.distributions += 1;
        acc.sent += item.totalEnviado;
        acc.received += item.totalRecibido;
        acc.delivered += item.totalEntregado;
        acc.remaining += item.totalDisponible;
        return acc;
      },
      {
        distributions: 0,
        sent: 0,
        received: 0,
        delivered: 0,
        remaining: 0,
      }
    );
  }, [monthDistributions]);

  const invalidLastMileCapsules = useMemo(
    () =>
      monthDistributions.filter(
        (item) =>
          ['PENDIENTE_RECEPCION', 'PENDIENTE_ACLARACION'].includes(item.estado) &&
          item.configuredPackageCount === 0 &&
          item.estadoEntregaActual === 'NO_ENTREGADO'
      ),
    [monthDistributions]
  );

  const visibleDistributionKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const item of monthDistributions) {
      if (item.pdvClaveBtl) {
        keys.add(`${item.mesOperacion}::${item.pdvClaveBtl}`);
      }
      keys.add(`${item.mesOperacion}::${item.pdvNombre}`);
    }

    return keys;
  }, [monthDistributions]);

  const monthReportRows = useMemo(() => {
    if (!monthlyReportRequested) {
      return [];
    }

    return data.reportRows.filter((item) => {
      if (item.month !== selectedMonth) {
        return false;
      }
      if (selectedTipoDispersion && item.tipoDispersion !== selectedTipoDispersion) {
        return false;
      }

      return visibleDistributionKeys.has(`${item.month}::${item.pdvClaveBtl ?? item.pdv}`);
    });
  }, [
    data.reportRows,
    monthlyReportRequested,
    selectedMonth,
    selectedTipoDispersion,
    visibleDistributionKeys,
  ]);

  if (data.actorRole === 'SUPERVISOR') {
    return (
      <div className="space-y-6">
        {!data.infraestructuraLista && (
          <Card className="border-amber-200 bg-amber-50 text-amber-900">
            <p className="font-medium">Infraestructura pendiente</p>
            <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
          </Card>
        )}

        <Card className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex min-h-10 items-center rounded-[14px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-[0_8px_18px_rgba(148,163,184,0.08)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
              >
                ← Volver
              </Link>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                Tus entregas
              </p>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">PDV bajo tu supervisión</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aquí solo aparecen las entregas de última milla y el estado de materiales de los PDV
              que tienes asignados.
            </p>
          </div>
          <div className="grid gap-3">
            <Select
              label="Mes"
              options={data.monthOptions.map((item) => ({ value: item, label: formatMonth(item) }))}
              value={selectedMonth}
              onChange={(event) => handleMonthChange(event.target.value)}
            />
            <ReadOnlyAccountField label="Cliente ISDIN" value={getSingleTenantAccountLabel()} />
          </div>
        </Card>

        <LastMileProgressDashboard items={monthDistributions} />
        <SupervisorLastMileSection actor={actor} data={data} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Catalogo activo" value={String(data.catalog.length)} />
        <MetricCard label="Dispersiones" value={String(summary.distributions)} />
        <MetricCard label="Enviado" value={String(summary.sent)} />
        <MetricCard label="Recibido" value={String(summary.received)} />
        <MetricCard label="Entregado" value={String(summary.delivered)} />
        <MetricCard label="Saldo" value={String(summary.remaining)} />
      </div>

      <Card className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Operacion mensual
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Control por PDV y material</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Toda la trazabilidad vive por mes, PDV y material: lo enviado, lo recibido formalmente
            en tienda, lo entregado al shopper y el saldo restante.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Select
            label="Mes"
            options={data.monthOptions.map((item) => ({ value: item, label: formatMonth(item) }))}
            value={selectedMonth}
            onChange={(event) => handleMonthChange(event.target.value)}
          />
          <Select
            label="Supervisor"
            options={supervisorFilterOptions}
            value={selectedSupervisorId}
            onChange={(event) => handleSupervisorChange(event.target.value)}
          />
          <Select
            label="Tipo de Dispersión"
            options={[
              { value: '', label: 'Todos los tipos' },
              { value: 'MENSUAL', label: 'Mensual (Ordinaria)' },
              { value: 'ADICIONAL', label: 'Adicional (Resurtido)' },
              { value: 'EXCLUSIVA_CANJES', label: 'Exclusiva para Canjes' },
              { value: 'EXCLUSIVA_TESTERS', label: 'Exclusiva para Testers' },
              { value: 'EXCLUSIVA_REGALOS', label: 'Exclusiva para Regalos' },
              { value: 'OTRA', label: 'Otra' },
            ]}
            value={selectedTipoDispersion}
            onChange={(event) => handleTipoDispersionChange(event.target.value)}
          />
          <ReadOnlyAccountField label="Cliente ISDIN" value={getSingleTenantAccountLabel()} />
        </div>
      </Card>

      {isAdminPanel && (
        <InventoryCapsuleNav
          activeCapsule={activeCapsule}
          loadingCapsule={loadingCapsule}
          onSelect={loadCapsule}
          error={capsuleError}
        />
      )}

      {ADMIN_ROLES.includes(data.actorRole) && isAdminOverview && (
        <>
          <LastMileProgressDashboard items={monthDistributions} />
          <InvalidLastMileCapsulesSection
            items={invalidLastMileCapsules}
            state={invalidCapsuleState}
            action={invalidCapsuleAction}
          />
          <InventoryCapsuleHint />
        </>
      )}

      {ADMIN_ROLES.includes(data.actorRole) && isAdminUpload && (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <AdminCatalogSection data={data} state={catalogState} action={catalogAction} />
            <AdminImportSection data={data} state={importState} action={importAction} />
          </div>
          <div className="mt-6">
            <AdminInventarioInicialSection
              data={data}
              state={inventarioInicialState}
              action={inventarioInicialAction}
            />
          </div>
          <DraftLotsSection data={data} importState={importState} />
        </>
      )}

      {ADMIN_ROLES.includes(data.actorRole) && isAdminReview && (
        <>
          <InvalidLastMileCapsulesSection
            items={invalidLastMileCapsules}
            state={invalidCapsuleState}
            action={invalidCapsuleAction}
          />
          <DistributionsSection
            title="Dispersión por PDV"
            items={monthDistributions}
          />
        </>
      )}

      {ADMIN_ROLES.includes(data.actorRole) && isAdminReports && (
        <>
          <MonthlyReportDemandSection
            rows={monthReportRows}
            isRequested={monthlyReportRequested}
            monthLabel={formatMonth(selectedMonth)}
            supervisorLabel={selectedSupervisorLabel}
            tipoLabel={selectedTipoDispersion ? formatTipoDispersionLabel(selectedTipoDispersion) : 'Todos los tipos'}
            onRequest={() => setMonthlyReportRequested(true)}
            onClear={() => setMonthlyReportRequested(false)}
          />
          <LastMileComparisonDemandSection
            actor={actor}
            rows={data.lastMileDeliveries}
            distributionById={distributionById}
            monthOptions={data.monthOptions}
            initialMonth={selectedMonth}
            selectedAccountId={selectedAccountId}
          />
        </>
      )}

      {data.actorRole === 'DERMOCONSEJERO' && (
        <>
          <DermoReceptionSection data={data} />
          <DermoMercadeoSection data={data} />
          <DermoDeliverySection data={data} />
          <DermoInventorySection data={data} />
        </>
      )}
    </div>
  );
}

async function readMaterialesPanelPayload(response: Response): Promise<MaterialesPanelPayload> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    return (await response.json()) as MaterialesPanelPayload;
  }

  if (response.redirected || response.url.includes('/login')) {
    return {
      message: 'Tu sesión expiró. Vuelve a iniciar sesión para cargar esta sección.',
      redirectTo: '/login',
    };
  }

  if (response.url.includes('/activacion')) {
    return {
      message: 'Debes completar la activación de tu cuenta antes de cargar esta sección.',
      redirectTo: '/activacion',
    };
  }

  if (response.url.includes('/primer-acceso')) {
    return {
      message: 'Debes completar tu primer acceso antes de cargar esta sección.',
      redirectTo: '/primer-acceso',
    };
  }

  return {
    message:
      'El servidor respondió con una página HTML en lugar de datos. Actualiza la sesión e intenta de nuevo.',
  };
}

function InventoryCapsuleNav({
  activeCapsule,
  loadingCapsule,
  onSelect,
  error,
}: {
  activeCapsule: InventoryCapsule;
  loadingCapsule: InventoryCapsule | null;
  onSelect: (capsule: InventoryCapsule) => void;
  error: string | null;
}) {
  const items: Array<{ id: InventoryCapsule; title: string; caption: string }> = [
    { id: 'overview', title: 'Avance', caption: 'Supervisores y errores' },
    { id: 'upload', title: 'Cargar dispersión', caption: 'Excel mensual y preview' },
    { id: 'review', title: 'Revisión', caption: 'PDV, paquetes y cancelaciones' },
    { id: 'reports', title: 'Reportes', caption: 'Consolidados bajo demanda' },
  ];

  return (
    <Card className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        {items.map((item) => {
          const active = activeCapsule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`min-h-20 rounded-[18px] border px-4 py-3 text-left transition ${
                active
                  ? 'border-sky-300 bg-sky-50 text-sky-950 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/60'
              }`}
            >
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {loadingCapsule === item.id ? 'Cargando cápsula...' : item.caption}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
    </Card>
  );
}

function InventoryCapsuleHint() {
  return (
    <Card className="border-sky-100 bg-sky-50">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
        Cápsulas bajo demanda
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        La entrada solo carga el tablero de avance y las dispersiones con error. Usa las cápsulas
        superiores para subir archivos, revisar detalles o generar reportes; cada sección consulta
        su información cuando la abres.
      </p>
    </Card>
  );
}

function AdminCatalogSection({
  data,
  state,
  action,
}: {
  data: MaterialesPanelData;
  state: { ok: boolean; message: string | null };
  action: (formData: FormData) => void;
}) {
  const fixedAccount = resolveSingleTenantAccountOption(data.accountOptions);

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Catalogo</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">
          Alta y control de promocionales
        </h3>
      </div>

      <form action={action} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="cuenta_cliente_id" value={fixedAccount?.id ?? ''} />
        <ReadOnlyAccountField
          label="Cliente ISDIN"
          value={getSingleTenantAccountLabel()}
          className="md:col-span-2"
        />
        <Input name="nombre" label="Nombre del articulo" placeholder="Tester Fusion Water" />
        <Input name="tipo" label="Tipo" placeholder="TESTER, MUESTRA, REGALO..." />
        <Input
          name="cantidad_default"
          type="number"
          min="1"
          defaultValue="1"
          label="Cantidad sugerida"
        />
        <div className="grid gap-3 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="requiere_ticket_compra" value="true" className="h-4 w-4" />
            Requiere ticket de compra
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="requiere_evidencia_obligatoria"
              value="true"
              defaultChecked
              className="h-4 w-4"
            />
            Requiere evidencia obligatoria
          </label>
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <SubmitButton label="Guardar material" pendingLabel="Guardando..." />
          <StateMessage ok={state.ok} message={state.message} />
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {data.catalog.slice(0, 8).map((item) => (
          <div key={item.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">{item.nombre}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                  {item.tipo}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {item.cantidadDefault} base
              </span>
            </div>
          </div>
        ))}
        {data.catalog.length === 0 && (
          <EmptyState message="Todavia no hay promocionales visibles en el catalogo." />
        )}
      </div>
    </Card>
  );
}

function AdminImportSection({
  data,
  state,
  action,
}: {
  data: MaterialesPanelData;
  state: {
    ok: boolean;
    message: string | null;
    loteId?: string | null;
    preview?: MaterialLotPreviewItem['preview'] | null;
    tipoDispersion?: string | null;
  };
  action: (formData: FormData) => void;
}) {
  const fixedAccount = resolveSingleTenantAccountOption(data.accountOptions);

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
          Dispersión mensual
        </p>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">Subir Excel y generar preview</h3>
      </div>

      <form action={action} className="grid gap-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">Plantilla oficial ISDIN</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Descarga el formato vigente para cargar dispersiones por clave BTL de tienda: fila 1
            preset + mecánica, fila 2 totales, fila 3 encabezados y fila 4 en adelante registros por
            PDV. La DC receptora se selecciona después en última milla.
          </p>
          <div className="mt-3">
            <a
              href="/api/materiales/template"
              className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-[var(--module-border)] bg-white px-4.5 py-2.5 text-sm font-medium text-[var(--module-text)] transition-colors duration-200 hover:bg-[var(--module-soft-bg)]"
            >
              Descargar plantilla ISDIN
            </a>
          </div>
        </div>
        <input type="hidden" name="cuenta_cliente_id" value={fixedAccount?.id ?? ''} />
        <ReadOnlyAccountField label="Cliente ISDIN" value={getSingleTenantAccountLabel()} />
        <label className="block text-sm text-slate-600">
          Mes de Operación
          <input
            name="mes_operacion_override"
            type="month"
            required
            defaultValue={new Date().toISOString().slice(0, 7)}
            className="mt-2 block w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
          />
        </label>
        <Select
          name="tipo_dispersion"
          label="Tipo de Dispersión"
          defaultValue="MENSUAL"
          options={[
            { value: 'MENSUAL', label: 'Mensual (Ordinaria)' },
            { value: 'ADICIONAL', label: 'Adicional (Resurtido)' },
            { value: 'EXCLUSIVA_CANJES', label: 'Exclusiva para Canjes' },
            { value: 'EXCLUSIVA_TESTERS', label: 'Exclusiva para Testers' },
            { value: 'EXCLUSIVA_REGALOS', label: 'Exclusiva para Regalos' },
            { value: 'OTRA', label: 'Otra' },
          ]}
        />
        <label className="block text-sm text-slate-600">
          Archivo Excel
          <input
            name="archivo_excel"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-2 block w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
          />
        </label>
        <div className="rounded-[18px] border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
          El archivo no crea dispersión al subirlo. Primero genera un preview por bloques para
          validar el match de PDV con ID BTL, revisar productos y detectar BTL duplicados antes de
          confirmar el lote.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label="Generar preview" pendingLabel="Analizando archivo..." />
          <StateMessage ok={state.ok} message={state.message} />
        </div>
        {state.preview && (
          <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Preview listo para revisión</p>
            <p className="mt-2">
              Mes: {formatMonth(state.preview.resolvedMonth)} · Dispersiones detectadas:{' '}
              {state.preview.pdvPackages.length} · Bloques: {state.preview.sheetSummaries.length} ·
              Productos: {state.preview.materialRules.length} · Advertencias:{' '}
              {state.preview.warnings.length}
            </p>
          </div>
        )}
      </form>
    </Card>
  );
}

function DraftLotsSection({
  data,
  importState,
}: {
  data: MaterialesPanelData;
  importState: {
    ok: boolean;
    message: string | null;
    loteId: string | null;
    preview: MaterialLotPreviewItem['preview'] | null;
    cuentaClienteId: string | null;
    tipoDispersion?: string | null;
  };
}) {
  const [state, action] = useActionState(confirmarDistribucionMateriales, ESTADO_MATERIAL_INICIAL);
  const [discardState, discardAction] = useActionState(
    descartarPreviewMateriales,
    ESTADO_MATERIAL_INICIAL
  );
  const [dismissedLotIds, setDismissedLotIds] = useState<string[]>([]);
  const [pendingDiscardLotId, setPendingDiscardLotId] = useState<string | null>(null);
  const [dismissNotice, setDismissNotice] = useState<string | null>(null);

  // React action state reports are external to this local dismissal state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissedLotIds([]);
    setDismissNotice(null);
    setPendingDiscardLotId(null);
  }, [importState.loteId]);

  useEffect(() => {
    if (!pendingDiscardLotId) {
      return;
    }

    if (discardState.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissedLotIds((current) =>
        current.includes(pendingDiscardLotId) ? current : [...current, pendingDiscardLotId]
      );
      setDismissNotice(discardState.message);
      setPendingDiscardLotId(null);
      return;
    }
  }, [discardState.message, discardState.ok, pendingDiscardLotId]);

  const visibleLots = useMemo(() => {
    if (importState.loteId && importState.preview) {
      const previewLots = [
        {
          id: importState.loteId,
          cuentaClienteId: importState.cuentaClienteId ?? '',
          cuentaCliente:
            data.accountOptions.find((item) => item.id === importState.cuentaClienteId)?.label ??
            'Cuenta actual',
          mesOperacion: importState.preview.resolvedMonth,
          estado: 'BORRADOR_PREVIEW',
          archivoNombre: 'Preview actual',
          archivoUrl: null,
          geminiStatus: 'PREVIEW',
          warningCount: importState.preview.warnings.length,
          canConfirm: importState.preview.canConfirm,
          pdvCount: importState.preview.pdvPackages.length,
          createdAt: new Date().toISOString(),
          confirmedAt: null,
          preview: importState.preview,
          geminiSummary: null,
          tipoDispersion: importState.tipoDispersion ?? 'MENSUAL',
        },
      ];
      return previewLots.filter((lot) => !dismissedLotIds.includes(lot.id));
    }
    return [];
  }, [
    data.accountOptions,
    dismissedLotIds,
    importState.cuentaClienteId,
    importState.loteId,
    importState.preview,
  ]);

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
          Preview y confirmación
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Preview actual por confirmar</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          El preview es temporal: cada archivo nuevo reemplaza el anterior y al recargar la página
          se limpia. Solo la confirmación crea el lote activo y lanza la dispersión al resto del
          sistema.
        </p>
      </div>

      {visibleLots.length === 0 ? (
        <div className="space-y-3">
          <EmptyState message="No hay un preview activo en este momento. Sube el Excel del cliente para generar uno nuevo." />
          <StateMessage ok={discardState.ok} message={dismissNotice} />
        </div>
      ) : (
        <div className="space-y-6">
          {visibleLots.map((lot) => (
            <form
              key={lot.id}
              action={action}
              className="space-y-5 rounded-[22px] border border-slate-200 p-5"
            >
              <input type="hidden" name="lote_id" value={lot.id} />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950">{lot.archivoNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {lot.cuentaCliente ?? 'Sin cuenta'} · {formatMonth(lot.mesOperacion)} · Tipo:{' '}
                    {formatTipoDispersionLabel(lot.tipoDispersion)} · {lot.pdvCount} PDVs
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Gemini: {lot.geminiStatus} · creado {formatDateTime(lot.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={lot.canConfirm ? 'emerald' : 'amber'}>
                    {lot.canConfirm ? 'Listo para confirmar' : 'Con advertencias bloqueantes'}
                  </Pill>
                  <Pill tone="slate">{lot.warningCount} advertencias</Pill>
                </div>
              </div>

              {lot.geminiSummary && (
                <div className="rounded-[18px] border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
                  <p className="font-medium">Resumen asistido por Gemini</p>
                  <p className="mt-2">{lot.geminiSummary}</p>
                </div>
              )}

              {lot.preview && (
                <>
                  {lot.preview.warnings.length > 0 && (
                    <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-medium">Advertencias detectadas</p>
                      <ul className="mt-2 space-y-1">
                        {lot.preview.warnings.slice(0, 8).map((warning) => (
                          <li key={warning.code + warning.message}>
                            {warning.sheetName ? `${warning.sheetName}: ` : ''}
                            {warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.35fr]">
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-950">Dispersiones detectadas</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {lot.preview.pdvPackages.slice(0, 8).map((pdvPackage) => (
                          <div
                            key={`${pdvPackage.sheetNames.join('-')}-${pdvPackage.rowNumbers.join('-')}-${pdvPackage.idBtl ?? pdvPackage.idPdvCadena}`}
                            className="rounded-[14px] bg-white px-3 py-2"
                          >
                            <div className="font-medium text-slate-900">
                              {pdvPackage.sucursal ?? 'Sin sucursal'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {pdvPackage.idBtl ?? 'Sin ID BTL'} ·{' '}
                              {pdvPackage.idPdvCadena ?? 'Sin ID cadena'} · Receptor en última milla
                              · {pdvPackage.sheetNames.join(', ')} ·{' '}
                              {pdvPackage.pdvMatch.matched ? 'PDV resuelto' : 'Sin match'}
                            </div>
                          </div>
                        ))}
                        {lot.preview.pdvPackages.length > 8 && (
                          <p className="text-xs text-slate-500">
                            + {lot.preview.pdvPackages.length - 8} registros más en el lote.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Input
                        name="mes_operacion_override"
                        label="Mes de operación"
                        defaultValue={lot.mesOperacion.slice(0, 7)}
                        placeholder="2026-03"
                      />
                      <div className="space-y-4">
                        {lot.preview.sheetSummaries.map((sheetSummary) => {
                          const blockRules =
                            lot.preview?.materialRules.filter(
                              (rule) =>
                                (rule.blockName ?? rule.sheetNames?.[0] ?? '') ===
                                sheetSummary.sheetName
                            ) ?? [];

                          if (blockRules.length === 0) {
                            return null;
                          }

                          return (
                            <div
                              key={sheetSummary.sheetName}
                              className="rounded-[20px] border border-slate-200 bg-white p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-950">
                                    {sheetSummary.sheetName}
                                  </p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                                    Bloque homologado del cliente
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Pill tone="sky">{sheetSummary.packageCount} dispersiones</Pill>
                                  <Pill tone="slate">{sheetSummary.productCount} productos</Pill>
                                  <Pill tone="emerald">
                                    {sheetSummary.totalAssignedQuantity} piezas
                                  </Pill>
                                </div>
                              </div>

                              <div className="mt-4 space-y-4">
                                {blockRules.map((rule) => (
                                  <div
                                    key={rule.key}
                                    className="rounded-[18px] border border-slate-200 bg-slate-50 p-4"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium text-slate-950">
                                          {rule.displayName}
                                        </p>
                                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                                          {rule.materialType} · {rule.pdvCount} PDVs ·{' '}
                                          {rule.assignedQuantityTotal} piezas
                                        </p>
                                        {rule.sourceContext ? (
                                          <p className="mt-1 text-xs text-slate-500">
                                            {rule.sourceContext}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        Total bloque:{' '}
                                        {rule.totalColumn ?? rule.assignedQuantityTotal}
                                      </div>
                                    </div>

                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                      <div className="rounded-[14px] border border-white bg-white px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                          Tipo de producto
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-slate-950">
                                          {rule.materialType}
                                        </p>
                                      </div>
                                      <div className="rounded-[14px] border border-white bg-white px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                          Mecánica de canje
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-slate-950">
                                          {rule.mecanicaCanje ?? 'Heredada de fila 1'}
                                        </p>
                                      </div>
                                      <div className="rounded-[14px] border border-white bg-white px-4 py-3 md:col-span-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                          Observación / indicaciones del producto
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {rule.indicacionesProducto ??
                                            'Sin observaciones adicionales.'}
                                        </p>
                                      </div>
                                      <div className="rounded-[14px] border border-white bg-white px-4 py-3 md:col-span-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                          Instrucciones de mercadeo
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {rule.instruccionesMercadeo ??
                                            'Sin instrucciones de mercadeo adicionales.'}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <Pill
                                        tone={
                                          rule.flags.excluirDeRegistrarEntrega ? 'slate' : 'emerald'
                                        }
                                      >
                                        {rule.flags.excluirDeRegistrarEntrega
                                          ? 'Sin entrega al shopper'
                                          : 'Entrega al shopper'}
                                      </Pill>
                                      {rule.flags.requiereTicketMes && (
                                        <Pill tone="amber">Requiere ticket</Pill>
                                      )}
                                      {rule.flags.requiereEvidenciaEntregaMes && (
                                        <Pill tone="sky">Requiere evidencia</Pill>
                                      )}
                                      {rule.flags.requiereEvidenciaMercadeo && (
                                        <Pill tone="violet">Requiere mercadeo</Pill>
                                      )}
                                      {rule.flags.esRegaloDc && (
                                        <Pill tone="slate">Regalo para DC</Pill>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton
                  label="Confirmar lote mensual"
                  pendingLabel="Confirmando lote..."
                  disabled={!lot.canConfirm}
                />
                <Button
                  type="submit"
                  variant="outline"
                  formAction={discardAction}
                  onClick={() => setPendingDiscardLotId(lot.id)}
                >
                  Descartar preview
                </Button>
                <StateMessage ok={state.ok} message={state.message} />
                <StateMessage
                  ok={discardState.ok}
                  message={pendingDiscardLotId === lot.id ? discardState.message : null}
                />
              </div>
            </form>
          ))}
        </div>
      )}
    </Card>
  );
}

function InvalidLastMileCapsulesSection({
  items,
  state,
  action,
}: {
  items: MaterialDistributionItem[];
  state: { ok: boolean; message: string | null };
  action: (formData: FormData) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Card className="space-y-5 border-amber-200 bg-amber-50">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
            Revisión requerida
          </p>
          <h2 className="mt-2 text-lg font-semibold text-amber-950">
            Cápsulas de última milla sin paquetes
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Estas dispersiones quedaron pendientes, pero no tienen detalle de materiales copiado
            desde el lote. Cancélalas para retirar el bloqueo del supervisor y poder cargar una
            dispersión corregida.
          </p>
        </div>
        <Pill tone="amber">
          {items.length} inválida{items.length === 1 ? '' : 's'}
        </Pill>
      </div>

      <div className="grid gap-3">
        {items.map((item) => (
          <form
            key={item.id}
            action={action}
            className="rounded-[18px] border border-amber-200 bg-white p-4"
          >
            <input type="hidden" name="distribucion_id" value={item.id} />
            <input
              type="hidden"
              name="motivo"
              value="Cápsula generada sin detalle de paquetes desde la dispersión; se cancela para regenerar con datos correctos."
            />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium text-slate-950">{item.pdvNombre}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {item.cadena ?? 'Sin cadena'} · {item.idPdvCadena ?? item.pdvClaveBtl ?? 'Sin ID'}{' '}
                  · {item.supervisorNombre ?? 'Sin supervisor'}
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  {formatMonth(item.mesOperacion)} · sin materiales configurados · estado{' '}
                  {formatStatus(item.estado)}
                </p>
              </div>
              <SubmitButton label="Cancelar cápsula" pendingLabel="Cancelando..." />
            </div>
          </form>
        ))}
      </div>
      <StateMessage ok={state.ok} message={state.message} />
    </Card>
  );
}

function DermoReceptionSection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(confirmarRecepcionMaterial, ESTADO_MATERIAL_INICIAL);

  if (!data.dermoContext) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <h2 className="text-lg font-semibold text-slate-950">Recepción de material</h2>
        <p className="mt-2 text-sm text-slate-600">
          Tu recepción formal se habilita cuando tengas un PDV asignado en el mes actual.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
          Recepción en tienda
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          Checklist de material esperado
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Confirma formalmente lo recibido en {data.dermoContext.pdvNombre}. La firma digital, la
          foto y las diferencias reportadas quedan como acuse oficial.
        </p>
      </div>

      {data.dermoPendingReception.length === 0 ? (
        <EmptyState message="No tienes recepciones pendientes para este mes en tu PDV actual." />
      ) : (
        <div className="space-y-5">
          {data.dermoPendingReception.map((distribution) => (
            <form
              key={distribution.id}
              action={action}
              className="space-y-5 rounded-[22px] border border-slate-200 p-5"
            >
              <input type="hidden" name="distribucion_id" value={distribution.id} />
              <input type="hidden" name="cuenta_cliente_id" value={distribution.cuentaClienteId} />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {distribution.pdvClaveBtl ?? 'Sin clave'} ·{' '}
                    {distribution.cadena ?? 'Sin cadena'} · {formatMonth(distribution.mesOperacion)}
                  </p>
                </div>
                <Pill tone={distribution.estado === 'PENDIENTE_ACLARACION' ? 'amber' : 'sky'}>
                  {formatStatus(distribution.estado)}
                </Pill>
              </div>

              <div className="grid gap-4">
                {distribution.detalles
                  .filter((detail) => detail.cantidadEnviada > 0)
                  .map((detail) => (
                    <div
                      key={detail.id}
                      className="rounded-[18px] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">{detail.materialNombre}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                            {detail.materialTipo}
                          </p>
                        </div>
                        <div className="text-right text-sm text-slate-600">
                          Esperado: {detail.cantidadEnviada}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_0.8fr_1.4fr]">
                        <Input
                          name={`cantidad_recibida__${detail.id}`}
                          label="Recibido"
                          type="number"
                          min="0"
                          defaultValue={String(detail.cantidadEnviada)}
                        />
                        <Input
                          name={`cantidad_observada__${detail.id}`}
                          label="Diferencia"
                          type="number"
                          min="0"
                          defaultValue="0"
                        />
                        <label className="block text-sm text-slate-600">
                          Observacion
                          <textarea
                            name={`observacion__${detail.id}`}
                            rows={2}
                            className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                            placeholder="Reporta faltantes o diferencias."
                          />
                        </label>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                <SignatureField name="firma_recepcion_data_url" />
                <CameraCaptureField
                  name="foto_recepcion"
                  pdvLabel={distribution.pdvNombre}
                  flowLabel="Recepcion de material"
                  title="Foto oficial en tienda"
                  description="Toma la foto desde cámara en vivo. El borrador final se sella con fecha, hora y PDV."
                  buttonLabel="Capturar recepción"
                />
              </div>

              <label className="block text-sm text-slate-600">
                Observaciones generales
                <textarea
                  name="observaciones"
                  rows={3}
                  className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Confirmar recepción" pendingLabel="Guardando..." />
                <StateMessage ok={state.ok} message={state.message} />
              </div>
            </form>
          ))}
        </div>
      )}
    </Card>
  );
}

function DermoMercadeoSection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(
    registrarEvidenciaMercadeoMaterial,
    ESTADO_MATERIAL_INICIAL
  );

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
          Evidencia de mercadeo
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          Foto única del material exhibido
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Después de la recepción, sube una sola foto por lote cuando el material requiera validar
          exhibición en el PDV. Esa evidencia cubre testers, dosis o bloques marcados para mercadeo.
        </p>
      </div>

      {!data.dermoContext || data.dermoMercadeoPending.length === 0 ? (
        <EmptyState message="No tienes lotes pendientes con evidencia de mercadeo por registrar." />
      ) : (
        <div className="space-y-5">
          {data.dermoMercadeoPending.map((distribution) => (
            <form
              key={distribution.id}
              action={action}
              className="space-y-4 rounded-[22px] border border-slate-200 p-5"
            >
              <input type="hidden" name="cuenta_cliente_id" value={distribution.cuentaClienteId} />
              <input type="hidden" name="distribucion_id" value={distribution.id} />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {distribution.pdvClaveBtl ?? 'Sin clave'} ·{' '}
                    {formatMonth(distribution.mesOperacion)}
                  </p>
                </div>
                <Pill tone="violet">Mercadeo pendiente</Pill>
              </div>
              <div className="rounded-[18px] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                <p className="font-medium">Materiales que requieren exhibición</p>
                <ul className="mt-2 space-y-1">
                  {distribution.detalles
                    .filter((detail) => detail.requiereEvidenciaMercadeo)
                    .map((detail) => (
                      <li key={detail.id}>
                        {detail.materialNombre}
                        {detail.instruccionesMercadeo ? ` · ${detail.instruccionesMercadeo}` : ''}
                      </li>
                    ))}
                </ul>
              </div>
              <CameraCaptureField
                name="foto_mercadeo"
                pdvLabel={distribution.pdvNombre}
                flowLabel="Evidencia de mercadeo"
                title="Foto de exhibición en PDV"
                description="Usa la cámara en vivo y confirma una sola foto por lote. El sistema la sella con fecha, hora y PDV."
                buttonLabel="Capturar exhibición"
              />
              <label className="block text-sm text-slate-600">
                Observaciones
                <textarea
                  name="observaciones"
                  rows={2}
                  className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Guardar evidencia" pendingLabel="Guardando..." />
                <StateMessage ok={state.ok} message={state.message} />
              </div>
            </form>
          ))}
        </div>
      )}
    </Card>
  );
}

function DermoDeliverySection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(registrarEntregaPromocional, ESTADO_MATERIAL_INICIAL);
  const [isUploadingR2, setIsUploadingR2] = useState(false);
  const selectedDetail = data.dermoDeliverableDetails[0] ?? null;

  const handleSubmit = async (formData: FormData) => {
    const uploads: Array<Promise<unknown>> = [];

    const evidenciaMaterial = formData.get('evidencia_material');
    if (evidenciaMaterial instanceof File && evidenciaMaterial.size > 0) {
      uploads.push(
        injectDirectR2Upload(formData, evidenciaMaterial, {
          modulo: 'materiales',
          removeFieldName: 'evidencia_material',
          fieldNames: {
            objectKey: 'evidencia_material_r2_object_key',
            sha256: 'evidencia_material_r2_sha256',
            fileName: 'evidencia_material_r2_file_name',
            contentType: 'evidencia_material_r2_type',
            size: 'evidencia_material_r2_size',
          },
        }).then(() => {
          formData.delete('evidencia_material_data_url');
        })
      );
    }

    const evidenciaPdv = formData.get('evidencia_pdv');
    if (evidenciaPdv instanceof File && evidenciaPdv.size > 0) {
      uploads.push(
        injectDirectR2Upload(formData, evidenciaPdv, {
          modulo: 'materiales',
          removeFieldName: 'evidencia_pdv',
          fieldNames: {
            objectKey: 'evidencia_pdv_r2_object_key',
            sha256: 'evidencia_pdv_r2_sha256',
            fileName: 'evidencia_pdv_r2_file_name',
            contentType: 'evidencia_pdv_r2_type',
            size: 'evidencia_pdv_r2_size',
          },
        }).then(() => {
          formData.delete('evidencia_pdv_data_url');
        })
      );
    }

    const ticketCompra = formData.get('ticket_compra');
    if (ticketCompra instanceof File && ticketCompra.size > 0) {
      uploads.push(
        injectDirectR2Upload(formData, ticketCompra, {
          modulo: 'materiales',
          removeFieldName: 'ticket_compra',
          fieldNames: {
            objectKey: 'ticket_compra_r2_object_key',
            sha256: 'ticket_compra_r2_sha256',
            fileName: 'ticket_compra_r2_file_name',
            contentType: 'ticket_compra_r2_type',
            size: 'ticket_compra_r2_size',
          },
        }).then(() => {
          formData.delete('ticket_compra_data_url');
        })
      );
    }

    if (uploads.length > 0) {
      setIsUploadingR2(true);
      try {
        await Promise.all(uploads);
      } catch (error) {
        console.error('No fue posible subir evidencias de materiales a R2.', error);
      } finally {
        setIsUploadingR2(false);
      }
    }

    const submit = action as unknown as (payload: FormData) => void;
    submit(formData);
  };

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Entregar promocional
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          Salida de muestras, testers y regalos
        </h2>
      </div>

      {!data.dermoContext || data.dermoDeliverableDetails.length === 0 ? (
        <EmptyState message="Aun no tienes saldo disponible de promocionales para registrar en tu tienda." />
      ) : (
        <form action={handleSubmit} className="grid gap-4 xl:grid-cols-2">
          <input
            type="hidden"
            name="cuenta_cliente_id"
            value={data.dermoContext.cuentaClienteId ?? ''}
          />
          <input type="hidden" name="pdv_id" value={data.dermoContext.pdvId} />
          <input
            type="hidden"
            name="distribucion_id"
            value={selectedDetail?.distribucionId ?? ''}
          />
          <input type="hidden" name="distribucion_detalle_id" value={selectedDetail?.id ?? ''} />
          <input
            type="hidden"
            name="material_catalogo_id"
            value={selectedDetail?.materialCatalogoId ?? ''}
          />
          <ReadOnlyAccountField
            label="Promocional"
            value={
              selectedDetail
                ? `${selectedDetail.materialNombre} · saldo ${selectedDetail.saldoDisponible}`
                : 'Sin promocional disponible'
            }
            className="xl:col-span-2"
          />
          <Input
            name="cantidad_entregada"
            label="Piezas entregadas"
            type="number"
            min="1"
            max={selectedDetail?.saldoDisponible ?? 1}
            defaultValue="1"
          />
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-950">
              {selectedDetail?.materialNombre ?? 'Sin material'}
            </p>
            <p className="mt-2">Saldo disponible: {selectedDetail?.saldoDisponible ?? 0}</p>
            <p className="mt-1">Recibido: {selectedDetail?.cantidadRecibida ?? 0}</p>
            <p className="mt-1">Entregado: {selectedDetail?.cantidadEntregada ?? 0}</p>
          </div>
          <CameraCaptureField
            key={`material-${selectedDetail?.id ?? 'sin-detalle'}`}
            name="evidencia_material"
            pdvLabel={data.dermoContext.pdvNombre}
            flowLabel="Entrega de material"
            title="Foto del material entregado"
            description="Captura desde cámara en vivo el material entregado. La evidencia se sella con fecha, hora y PDV."
            buttonLabel="Capturar material"
          />
          <CameraCaptureField
            key={`pdv-${selectedDetail?.id ?? 'sin-detalle'}`}
            name="evidencia_pdv"
            pdvLabel={data.dermoContext.pdvNombre}
            flowLabel="Evidencia en PDV"
            title="Foto dentro del PDV"
            description="Captura la evidencia dentro del punto de venta con sello visible de fecha, hora y PDV."
            buttonLabel="Capturar PDV"
          />

          {selectedDetail?.requiereTicketCompra && (
            <div className="xl:col-span-2">
              <CameraCaptureField
                key={`ticket-${selectedDetail?.id ?? 'sin-detalle'}`}
                name="ticket_compra"
                pdvLabel={data.dermoContext.pdvNombre}
                flowLabel="Ticket de compra"
                title="Ticket de compra"
                description="Cuando el material requiera ticket, súbelo como foto desde cámara en vivo sellada."
                buttonLabel="Capturar ticket"
              />
            </div>
          )}

          <label className="block text-sm text-slate-600 xl:col-span-2">
            Observaciones
            <textarea
              name="observaciones"
              rows={3}
              className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <div className="xl:col-span-2 flex flex-wrap items-center gap-3">
            <SubmitButton
              label={isUploadingR2 ? 'Subiendo evidencias...' : 'Guardar entrega'}
              pendingLabel="Guardando..."
            />
            <StateMessage ok={state.ok} message={state.message} />
          </div>
        </form>
      )}
    </Card>
  );
}

function DermoInventorySection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(registrarConteoJornadaMaterial, ESTADO_MATERIAL_INICIAL);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
          Conteo de jornada
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          Apertura y cierre del inventario inventariable
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Este conteo solo toma materiales inventariables. Si la apertura no coincide contra el
          cierre previo, el sistema pedirá explicación y clasificará la diferencia.
        </p>
      </div>

      {!data.dermoContext || data.dermoInventoryItems.length === 0 ? (
        <EmptyState message="Todavía no tienes inventario vivo en el PDV para registrar conteo de jornada." />
      ) : (
        <form action={action} className="space-y-5">
          <input
            type="hidden"
            name="cuenta_cliente_id"
            value={data.dermoContext.cuentaClienteId ?? ''}
          />
          <input type="hidden" name="pdv_id" value={data.dermoContext.pdvId} />
          <input type="hidden" name="momento" value="CIERRE" />
          <input type="hidden" name="clasificacion_diferencia" value="" />

          <div className="grid gap-4 md:grid-cols-3">
            <Input
              name="fecha_operacion"
              label="Fecha de operación"
              type="date"
              defaultValue={today}
            />
            <ReadOnlyAccountField label="Momento" value="Cierre" />
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-950">Último cierre registrado</p>
              <p className="mt-2">
                {data.latestCloseDate ? formatDate(data.latestCloseDate) : 'Sin cierre previo'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.dermoInventoryItems.map((item) => (
              <div
                key={item.materialCatalogoId}
                className="rounded-[18px] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{item.materialNombre}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {item.materialTipo}
                    </p>
                  </div>
                  <Pill tone="slate">Saldo {item.balanceActual}</Pill>
                </div>
                <Input
                  name={`conteo__${item.materialCatalogoId}`}
                  label="Cantidad contada"
                  type="number"
                  min="0"
                  defaultValue={String(Math.max(item.balanceActual, 0))}
                  className="mt-4"
                />
              </div>
            ))}
          </div>

          <label className="block text-sm text-slate-600">
            Explicación de diferencia
            <textarea
              name="observacion_diferencia"
              rows={3}
              className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder="Solo se vuelve obligatoria si la apertura difiere del cierre previo."
            />
          </label>

          <label className="block text-sm text-slate-600">
            Observaciones generales
            <textarea
              name="observaciones"
              rows={2}
              className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton label="Guardar conteo" pendingLabel="Guardando..." />
            <StateMessage ok={state.ok} message={state.message} />
          </div>
        </form>
      )}
    </Card>
  );
}

function getCurrentGpsPosition() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve<{
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
    }>({
      latitude: null,
      longitude: null,
      accuracy: null,
    });
  }

  return new Promise<{
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
  }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => resolve({ latitude: null, longitude: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

function SupervisorLastMileSection({
  actor,
  data,
}: {
  actor: ActorActual;
  data: MaterialesPanelData;
}) {
  const router = useRouter();
  const offline = useOfflineSync();

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Última milla
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">
            Entrega real a dermoconsejero
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Selecciona una dispersión pendiente, valida las cantidades reales y captura las
            evidencias obligatorias. El registro se guarda localmente y se sincroniza cuando haya
            conexión.
          </p>
        </div>
        <Pill tone={offline.isOnline ? 'emerald' : 'amber'}>
          {offline.isOnline ? 'Online' : 'Offline'}
        </Pill>
      </div>

      {data.supervisorLastMileDistributions.length === 0 ? (
        <EmptyState message="No tienes entregas de última milla pendientes en el periodo operativo." />
      ) : (
        <div className="space-y-5">
          {data.supervisorLastMileDistributions.map((distribution) => (
            <SupervisorLastMileForm
              key={distribution.id}
              actor={actor}
              distribution={distribution}
              onQueued={async () => {
                await offline.refreshSummary();
                router.refresh();
              }}
              syncNow={offline.syncNow}
              isOnline={offline.isOnline}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function normalizeReceiverSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function SearchableReceiverSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: MaterialLastMileReceiverOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeReceiverSearch(query);
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      normalizeReceiverSearch(option.nombre).includes(normalizedQuery)
    );
  }, [options, query]);

  const selectedOption = options.find((option) => option.id === value) ?? null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="min-h-11 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-left text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 flex items-center justify-between"
      >
        <span className="truncate pr-4">
          {selectedOption ? selectedOption.nombre : 'Seleccionar receptor...'}
        </span>
        <svg
          className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-[18px] border border-slate-200 bg-white p-3 shadow-xl space-y-2.5">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre..."
            autoFocus
            className="min-h-10 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
          />
          <div className="max-h-60 overflow-y-auto rounded-[12px] border border-slate-100 bg-white p-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500 text-center">No hay coincidencias.</p>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.id === value;

                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`min-h-10 w-full rounded-[9px] px-3 py-1.5 text-left text-xs transition ${
                      isSelected
                        ? 'bg-sky-50 font-semibold text-sky-800'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      onChange(option.id);
                      setQuery('');
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{option.nombre}</span>
                      {option.scope && (
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          option.scope === 'ASIGNADO_PDV'
                            ? 'bg-emerald-50 text-emerald-700'
                            : option.scope === 'POR_CUBRIR'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {option.scope === 'ASIGNADO_PDV'
                            ? 'Asignada'
                            : option.scope === 'POR_CUBRIR'
                              ? 'Resguardo'
                              : 'Cobertura'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SupervisorLastMileForm({
  actor,
  distribution,
  onQueued,
  syncNow,
  isOnline,
}: {
  actor: ActorActual;
  distribution: MaterialDistributionItem;
  onQueued: () => Promise<void>;
  syncNow: () => Promise<void>;
  isOnline: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [deliveryPhoto, setDeliveryPhoto] = useState<MaterialCameraCaptureDraft | null>(null);
  const [acusePhotos, setAcusePhotos] = useState<MaterialCameraCaptureDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const receiverOptions = distribution.receptorOptions;
  const [selectedReceiverId, setSelectedReceiverId] = useState(receiverOptions[0]?.id ?? '');
  const selectedReceiver = receiverOptions.find((r) => r.id === selectedReceiverId) ?? null;
  const isPdvPorCubrir = selectedReceiver?.scope === 'POR_CUBRIR';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!selectedReceiver) {
      setMessage({
        ok: false,
        text: 'Selecciona la dermoconsejera o marca el PDV como por cubrir.',
      });
      return;
    }

    if (distribution.detalles.length === 0) {
      setMessage({
        ok: false,
        text: 'Esta dispersión no tiene paquetes configurados. Pide a administración regenerar los detalles del lote antes de registrar la entrega.',
      });
      return;
    }

    if (!deliveryPhoto) {
      setMessage({ ok: false, text: 'Captura la foto de entrega física antes de finalizar.' });
      return;
    }

    if (!isPdvPorCubrir && acusePhotos.length === 0) {
      setMessage({ ok: false, text: 'Captura al menos un acuse firmado antes de finalizar.' });
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData(event.currentTarget);
      const detalles = distribution.detalles
        .filter((detail) => detail.cantidadEnviada > 0)
        .map((detail) => {
          const rawReal = String(formData.get(`cantidad_real__${detail.id}`) ?? '').trim();
          const cantidadReal = Number(rawReal);

          if (!Number.isInteger(cantidadReal) || cantidadReal < 0) {
            throw new Error(`Captura una cantidad real válida para ${detail.materialNombre}.`);
          }

          const estadoItem: 'COMPLETO' | 'CON_DISCREPANCIA' =
            cantidadReal === detail.cantidadEnviada ? 'COMPLETO' : 'CON_DISCREPANCIA';

          return {
            distribucion_detalle_id: detail.id,
            material_catalogo_id: detail.materialCatalogoId,
            cantidad_teorica: detail.cantidadEnviada,
            estado_item: estadoItem,
            cantidad_real_recibida: cantidadReal,
            observaciones: String(formData.get(`observacion__${detail.id}`) ?? '').trim() || null,
          };
        });
      const gps = await getCurrentGpsPosition();
      const id = crypto.randomUUID();
      const offlineClientId = `material-ultima-milla-${id}`;

      await queueOfflineMaterialEntrega({
        id,
        cuenta_cliente_id: distribution.cuentaClienteId,
        distribucion_id: distribution.id,
        pdv_id: distribution.pdvId,
        cadena_id: null,
        supervisor_empleado_id: actor.empleadoId,
        dermoconsejero_empleado_id: isPdvPorCubrir ? null : selectedReceiver.id,
        pdv_snapshot: {
          id: distribution.pdvId,
          nombre: distribution.pdvNombre,
          clave_btl: distribution.pdvClaveBtl,
          id_cadena: distribution.idPdvCadena,
        },
        cadena_snapshot: {
          nombre: distribution.cadena,
        },
        dermoconsejero_snapshot: {
          id: isPdvPorCubrir ? null : selectedReceiver.id,
          nombre: selectedReceiver.nombre,
          username: selectedReceiver.username,
          id_nomina: selectedReceiver.idNomina,
          seleccion_origen: selectedReceiver.scope,
          estado_operativo: isPdvPorCubrir ? 'POR_CUBRIR' : 'ASIGNADA',
        },
        correccion_solicitada: {},
        latitud: gps.latitude,
        longitud: gps.longitude,
        gps_accuracy_metros: gps.accuracy,
        capturado_en: new Date().toISOString(),
        offline_client_id: offlineClientId,
        observaciones: String(formData.get('observaciones') ?? '').trim() || null,
        metadata: {
          capturado_desde: 'supervisor_ultima_milla',
          pdv_label: distribution.pdvNombre,
          cadena_label: distribution.cadena,
          receptor_label: selectedReceiver.label,
          receptor_origen: selectedReceiver.scope,
          modo_entrega: isPdvPorCubrir ? 'POR_CUBRIR' : 'ENTREGA_DC',
        },
        detalles,
        evidencia_entrega_fisica: {
          file: deliveryPhoto.file,
          fileName: deliveryPhoto.fileName,
          mimeType: deliveryPhoto.file.type,
          fileSize: deliveryPhoto.fileSize,
          capturedAt: deliveryPhoto.capturedAt,
          localHash: null,
          evidenceRole: isPdvPorCubrir ? 'PRODUCTO_EN_RESGUARDO' : 'ENTREGA_FISICA',
        },
        evidencias_acuse_firmado: isPdvPorCubrir
          ? []
          : acusePhotos.map((photo) => ({
              file: photo.file,
              fileName: photo.fileName,
              mimeType: photo.file.type,
              fileSize: photo.fileSize,
              capturedAt: photo.capturedAt,
              localHash: null,
              evidenceRole: 'ACUSE_FIRMADO',
            })),
      });

      if (typeof navigator !== 'undefined' && navigator.onLine && isOnline) {
        await syncNow();
        await onQueued();
        setDeliveryPhoto(null);
        setAcusePhotos([]);
        setMessage({ ok: true, text: 'Entrega sincronizada. Estado: entrega realizada.' });
        return;
      }

      setDeliveryPhoto(null);
      setAcusePhotos([]);
      setMessage({
        ok: true,
        text: 'Entrega guardada sin conexión. Se sincronizará al recuperar internet.',
      });
      await onQueued();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'No fue posible guardar la entrega.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <div
        className="rounded-[22px] border border-slate-200 bg-white p-5 cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors shadow-sm"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
            <p className="mt-1 text-sm text-slate-600">
              {distribution.detalles.length} paquete{distribution.detalles.length !== 1 ? 's' : ''}{' '}
              para entrega ·{' '}
              {isPdvPorCubrir
                ? 'PDV por cubrir'
                : `Asignado: ${selectedReceiver?.nombre ?? 'Sin asignar'}`}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Pill tone="sky">{formatMonth(distribution.mesOperacion)}</Pill>
            <span className="text-sm font-medium text-sky-600 ml-2">Abrir cápsula</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[22px] border border-slate-200 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
          <p className="mt-1 text-sm text-slate-600">
            {distribution.pdvClaveBtl ?? 'Sin clave'} · {distribution.cadena ?? 'Sin cadena'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="sky">{formatMonth(distribution.mesOperacion)}</Pill>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Contraer
          </Button>
        </div>
      </div>

      <input type="hidden" name="dermoconsejero_empleado_id" value={selectedReceiverId} />
      {receiverOptions.length > 0 ? (
        <SearchableReceiverSelect
          label="Dermoconsejera receptora"
          options={receiverOptions}
          value={selectedReceiverId}
          onChange={setSelectedReceiverId}
        />
      ) : (
        <ReadOnlyAccountField
          label="Dermoconsejera receptora"
          value="Sin dermoconsejera disponible"
        />
      )}

      <div className="grid gap-2.5">
        {distribution.detalles.length === 0 ? (
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-medium">Paquetes pendientes de configurar</p>
            <p className="mt-1">
              Esta cápsula existe, pero todavía no tiene materiales copiados desde la dispersión. No
              se puede registrar una entrega real hasta que el lote tenga detalle de paquetes.
            </p>
          </div>
        ) : (
          distribution.detalles
            .filter((detail) => detail.cantidadEnviada > 0)
            .map((detail) => {
              return (
                <div
                  key={detail.id}
                  className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-[13px] font-semibold leading-tight text-slate-950">
                        {detail.materialNombre}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {detail.materialTipo}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                      Teórico {detail.cantidadEnviada}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-[104px_minmax(0,1fr)] gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Recibida
                      </span>
                      <input
                        name={`cantidad_real__${detail.id}`}
                        type="number"
                        min="0"
                        defaultValue={String(detail.cantidadEnviada)}
                        className="h-9 w-full rounded-[11px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Obs.
                      </span>
                      <input
                        name={`observacion__${detail.id}`}
                        type="text"
                        className="h-9 w-full rounded-[11px] border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100"
                      />
                    </label>
                  </div>
                </div>
              );
            })
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <LastMileCameraField
          title={isPdvPorCubrir ? 'Foto de producto en resguardo' : 'Foto de entrega física'}
          description={
            isPdvPorCubrir
              ? 'Captura el producto resguardado mientras el PDV queda por cubrir.'
              : 'Captura una sola foto del supervisor con el dermoconsejero.'
          }
          buttonLabel={isPdvPorCubrir ? 'Capturar resguardo' : 'Capturar entrega'}
          pdvLabel={distribution.pdvNombre}
          flowLabel="Ultima milla"
          drafts={deliveryPhoto ? [deliveryPhoto] : []}
          onChange={(drafts) => setDeliveryPhoto(drafts[0] ?? null)}
        />
        {!isPdvPorCubrir && (
          <LastMileCameraField
            title="Acuses firmados"
            description="Captura uno o más acuses de recibo firmados en papel."
            buttonLabel="Capturar acuse"
            pdvLabel={distribution.pdvNombre}
            flowLabel="Acuse firmado"
            multiple
            drafts={acusePhotos}
            onChange={setAcusePhotos}
          />
        )}
      </div>

      <label className="block text-sm text-slate-600">
        Observaciones generales
        <textarea
          name="observaciones"
          rows={3}
          className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          isLoading={isSaving}
          disabled={isSaving || receiverOptions.length === 0 || distribution.detalles.length === 0}
        >
          {isSaving ? 'Guardando...' : 'Guardar y sincronizar entrega'}
        </Button>
        {message && <StateMessage ok={message.ok} message={message.text} />}
      </div>
    </form>
  );
}

function LastMileProgressDashboard({ items }: { items: MaterialDistributionItem[] }) {
  const summary = useMemo(() => {
    const grouped = new Map<
      string,
      {
        supervisorNombre: string;
        pdvs: number;
        dispersado: number;
        entregado: number;
      }
    >();

    let dispersado = 0;
    let entregado = 0;
    let pdvs = 0;
    let entregasCompletas = 0;

    for (const item of items) {
      const key = item.supervisorEmpleadoId ?? 'sin-supervisor';
      const current = grouped.get(key) ?? {
        supervisorNombre: item.supervisorNombre ?? 'Sin supervisor asignado',
        pdvs: 0,
        dispersado: 0,
        entregado: 0,
      };

      current.pdvs += 1;
      current.dispersado += item.totalEnviado;
      current.entregado += item.totalEntregado;
      grouped.set(key, current);

      pdvs += 1;
      dispersado += item.totalEnviado;
      entregado += item.totalEntregado;
      if (item.estadoEntregaActual === 'ENTREGADO') {
        entregasCompletas += 1;
      }
    }

    const avance = dispersado > 0 ? Math.min(100, Math.round((entregado / dispersado) * 100)) : 0;
    const pendiente = Math.max(dispersado - entregado, 0);
    const supervisors = Array.from(grouped.values())
      .map((item) => ({
        ...item,
        pendiente: Math.max(item.dispersado - item.entregado, 0),
        avance:
          item.dispersado > 0
            ? Math.min(100, Math.round((item.entregado / item.dispersado) * 100))
            : 0,
      }))
      .sort(
        (left, right) =>
          right.dispersado - left.dispersado ||
          left.supervisorNombre.localeCompare(right.supervisorNombre)
      );

    const pendingPdvs = items
      .filter((item) => item.estadoEntregaActual !== 'ENTREGADO')
      .map((item) => ({
        id: item.id,
        pdvNombre: item.pdvNombre,
        pdvClaveBtl: item.pdvClaveBtl,
        cadena: item.cadena,
        sucursal: item.sucursal,
        totalEnviado: item.totalEnviado,
        totalEntregado: item.totalEntregado,
        totalDisponible: item.totalDisponible,
        supervisorNombre: item.supervisorNombre || 'Sin supervisor asignado',
      }))
      .sort((a, b) => b.totalDisponible - a.totalDisponible);

    return {
      avance,
      dispersado,
      entregado,
      pendiente,
      pdvs,
      entregasCompletas,
      supervisors,
      pendingPdvs,
    };
  }, [items]);

  return (
    <Card className="space-y-6">
      {/* Sección Superior: Acelerómetro + Métricas y Tiendas Pendientes */}
      <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] items-stretch">
        {/* Acelerómetro Compacto y Elegante */}
        <div className="flex flex-col items-center justify-center rounded-[24px] bg-slate-950 p-5 text-white shadow-md">
          <div
            className="relative grid h-36 w-36 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#10b981 ${summary.avance * 3.6}deg, #334155 0deg)`,
            }}
            aria-label={`Avance de ultima milla ${summary.avance}%`}
          >
            <div className="grid h-28 w-28 place-items-center rounded-full bg-slate-950 ring-1 ring-white/10">
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200 leading-none">
                  Avance
                </p>
                <p className="mt-1.5 text-4xl font-bold leading-none">{summary.avance}%</p>
                <p className="mt-1 text-[10px] text-slate-400 leading-none">última milla</p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-xl bg-white/5 px-2 py-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                Dispersado
              </p>
              <p className="mt-0.5 text-base font-semibold">{summary.dispersado}</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 px-2 py-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-400">
                Entregado
              </p>
              <p className="mt-0.5 text-base font-semibold text-emerald-400">{summary.entregado}</p>
            </div>
          </div>
        </div>

        {/* Métricas Generales y Tiendas Pendientes */}
        <div className="flex flex-col justify-between space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Avance general
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Entregas vs dispersión</h2>
          </div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <LastMileSummaryTile label="PDV con dispersión" value={summary.pdvs} />
            <LastMileSummaryTile
              label="Entregas cerradas"
              value={summary.entregasCompletas}
              tone="emerald"
            />
            <LastMileSummaryTile
              label="Tiendas pendientes"
              value={summary.pendingPdvs.length}
              tone={summary.pendingPdvs.length === 0 ? 'emerald' : 'amber'}
            />
          </div>

          {/* Listado Inteligente de Tiendas Pendientes */}
          {summary.pendingPdvs.length > 0 && (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50/30 p-3">
              <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <span>⚠️ Tiendas con entregas pendientes:</span>
              </p>
              <div className="mt-2 max-h-32 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {summary.pendingPdvs.map((pdv) => (
                  <div
                    key={pdv.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs py-2 px-3 rounded-[12px] bg-white/80 shadow-sm border border-slate-100 transition-colors hover:bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-800 block truncate">
                        {pdv.pdvClaveBtl ? `[${pdv.pdvClaveBtl}] ` : ''}
                        {pdv.pdvNombre}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                        {pdv.cadena} {pdv.sucursal ? `· ${pdv.sucursal}` : ''} • Sup:{' '}
                        {pdv.supervisorNombre}
                      </span>
                    </div>
                    <div className="shrink-0">
                      <span className="text-[10px] bg-amber-100 text-amber-900 font-semibold px-2 py-0.5 rounded-full">
                        Pendientes: {pdv.totalDisponible} pzs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Separador Visual */}
      <div className="border-t border-slate-100" />

      {/* Sección Inferior: Avance por Supervisor en Grid Compacto */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Avance por supervisor
        </h3>

        {summary.supervisors.length === 0 ? (
          <EmptyState message="No hay dispersiones visibles para calcular avance." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.supervisors.map((supervisor) => (
              <div
                key={supervisor.supervisorNombre}
                className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {supervisor.supervisorNombre}
                    </p>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {supervisor.avance}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{supervisor.pdvs} PDV a cargo</p>
                </div>

                <div className="mt-3">
                  <div className="flex gap-1.5 text-[10px] font-bold mb-1.5 text-slate-500 justify-between">
                    <span>Dispersado: {supervisor.dispersado}</span>
                    <span className="text-emerald-600">Entregado: {supervisor.entregado}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${supervisor.avance}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function LastMileSummaryTile({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 ring-amber-100'
        : 'bg-slate-50 text-slate-900 ring-slate-100';

  return (
    <div className={`rounded-[18px] px-4 py-3 ring-1 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-none">{value}</p>
    </div>
  );
}

function DistributionsSection({
  title,
  items,
  filters,
}: {
  title: string;
  items: MaterialDistributionItem[];
  filters?: {
    monthOptions: string[];
    monthValue: string;
    onMonthChange: (value: string) => void;
    supervisorOptions: { value: string; label: string }[];
    supervisorValue: string;
    onSupervisorChange: (value: string) => void;
  };
}) {
  const [expandedSupervisor, setExpandedSupervisor] = useState<string | null>(null);
  const [expandedPdv, setExpandedPdv] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredItems = useMemo(() => {
    if (statusFilter === 'ALL') return items;
    if (statusFilter === 'PENDING')
      return items.filter(
        (i) => i.estado === 'PENDIENTE_RECEPCION' || i.estadoEntregaActual !== 'ENTREGADO'
      );
    if (statusFilter === 'DELIVERED')
      return items.filter((i) => i.estadoEntregaActual === 'ENTREGADO');
    return items;
  }, [items, statusFilter]);

  const groupedBySupervisor = useMemo(() => {
    const groups = new Map<
      string,
      {
        supervisorNombre: string;
        items: MaterialDistributionItem[];
        totalEnviado: number;
        totalDisponible: number;
        totalPDVs: number;
      }
    >();
    for (const item of filteredItems) {
      const key = item.supervisorEmpleadoId ?? 'unassigned';
      const name = item.supervisorNombre ?? 'Sin supervisor asignado';
      const current = groups.get(key) ?? {
        supervisorNombre: name,
        items: [],
        totalEnviado: 0,
        totalDisponible: 0,
        totalPDVs: 0,
      };
      current.items.push(item);
      current.totalEnviado += item.totalEnviado;
      current.totalDisponible += item.totalDisponible;
      current.totalPDVs += 1;
      groups.set(key, current);
    }
    return Array.from(groups.entries()).sort((a, b) =>
      a[1].supervisorNombre.localeCompare(b[1].supervisorNombre)
    );
  }, [filteredItems]);

  return (
    <Card className="space-y-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Trazabilidad
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-[14px] border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-colors ${statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-colors ${statusFilter === 'PENDING' ? 'bg-amber-100 text-amber-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Pendientes
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('DELIVERED')}
              className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-colors ${statusFilter === 'DELIVERED' ? 'bg-emerald-100 text-emerald-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Entregados
            </button>
          </div>
        </div>
        {filters ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Select
              label="Mes"
              options={filters.monthOptions.map((item) => ({
                value: item,
                label: formatMonth(item),
              }))}
              value={filters.monthValue}
              onChange={(event) => filters.onMonthChange(event.target.value)}
            />
            <Select
              label="Supervisor"
              options={filters.supervisorOptions}
              value={filters.supervisorValue}
              onChange={(event) => filters.onSupervisorChange(event.target.value)}
            />
            <ReadOnlyAccountField label="Cliente ISDIN" value={getSingleTenantAccountLabel()} />
          </div>
        ) : null}
      </div>

      {groupedBySupervisor.length === 0 ? (
        <EmptyState message="No hay dispersiones visibles con el filtro actual." />
      ) : (
        <div className="space-y-4">
          {groupedBySupervisor.map(([supId, supData]) => (
            <div
              key={supId}
              className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => setExpandedSupervisor(expandedSupervisor === supId ? null : supId)}
                className="flex w-full items-center justify-between bg-slate-50 px-6 py-5 text-left transition-colors hover:bg-slate-100"
              >
                <div>
                  <p className="font-semibold text-slate-950">{supData.supervisorNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">{supData.totalPDVs} PDVs a cargo</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden items-center gap-2 sm:flex">
                    <Pill tone="slate">Env: {supData.totalEnviado}</Pill>
                    <Pill tone={supData.totalDisponible === 0 ? 'emerald' : 'sky'}>
                      Saldo: {supData.totalDisponible}
                    </Pill>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xl text-slate-400 shadow-sm">
                    {expandedSupervisor === supId ? '−' : '+'}
                  </span>
                </div>
              </button>

              {expandedSupervisor === supId && (
                <div className="border-t border-slate-200 p-5 space-y-4 bg-slate-50/50">
                  {supData.items.map((distribution) => (
                    <div
                      key={distribution.id}
                      className="overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPdv(expandedPdv === distribution.id ? null : distribution.id)
                        }
                        className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-slate-50"
                      >
                        <div>
                          <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {distribution.pdvClaveBtl ?? 'Sin clave'} ·{' '}
                            {distribution.cadena ?? 'Sin cadena'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill
                            tone={distribution.estado.includes('OBSERVACIONES') ? 'amber' : 'sky'}
                          >
                            {formatStatus(distribution.estado)}
                          </Pill>
                          <Pill
                            tone={
                              distribution.estadoEntregaActual === 'ENTREGADO' ? 'emerald' : 'amber'
                            }
                          >
                            {formatDeliveryStatus(distribution.estadoEntregaActual)}
                          </Pill>
                        </div>
                      </button>

                      {expandedPdv === distribution.id && (
                        <div className="grid gap-4 border-t border-slate-100 bg-slate-50/30 p-4 lg:grid-cols-[1.2fr_0.8fr]">
                          <div className="space-y-3">
                            {distribution.detalles
                              .filter((detail) => detail.cantidadEnviada > 0)
                              .map((detail) => (
                                <div
                                  key={detail.id}
                                  className="rounded-[14px] border border-slate-200 bg-white p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-slate-950">
                                        {detail.materialNombre}
                                      </p>
                                      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                                        {detail.materialTipo}
                                      </p>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-600">
                                      <MiniNumber label="Env." value={detail.cantidadEnviada} />
                                      <MiniNumber label="Rec." value={detail.cantidadRecibida} />
                                      <MiniNumber label="Ent." value={detail.cantidadEntregada} />
                                      <MiniNumber label="Saldo" value={detail.saldoDisponible} />
                                    </div>
                                  </div>
                                  {detail.observaciones && (
                                    <p className="mt-3 text-xs text-amber-800">
                                      {detail.observaciones}
                                    </p>
                                  )}
                                </div>
                              ))}
                          </div>

                          <div className="space-y-3">
                            <div className="rounded-[14px] border border-slate-200 bg-white p-4">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Evidencias oficiales
                              </p>
                              <div className="mt-3 space-y-3">
                                <EvidencePreview
                                  url={distribution.firmaRecepcionUrl}
                                  hash={distribution.id}
                                  label="Firma de recepción"
                                  emptyLabel="Sin firma"
                                />
                                <EvidencePreview
                                  url={distribution.fotoRecepcionUrl}
                                  hash={distribution.id}
                                  label="Foto de recepción"
                                  emptyLabel="Sin foto"
                                />
                                <EvidencePreview
                                  url={distribution.mercadeoEvidence?.fotoUrl ?? null}
                                  hash={distribution.mercadeoEvidence?.fotoHash ?? distribution.id}
                                  label="Evidencia de mercadeo"
                                  emptyLabel="Sin mercadeo cargado"
                                />
                              </div>
                            </div>
                            {distribution.observaciones && (
                              <div className="rounded-[14px] border border-slate-200 bg-white p-4 text-xs text-slate-600">
                                <p className="font-medium text-slate-950">Observaciones</p>
                                <p className="mt-1">{distribution.observaciones}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MonthlyReportDemandSection({
  rows,
  isRequested,
  monthLabel,
  supervisorLabel,
  tipoLabel,
  onRequest,
  onClear,
}: {
  rows: MaterialesPanelData['reportRows'];
  isRequested: boolean;
  monthLabel: string;
  supervisorLabel: string;
  tipoLabel: string;
  onRequest: () => void;
  onClear: () => void;
}) {
  if (isRequested) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-sky-100 bg-sky-50 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
              Reporte generado bajo demanda
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Filtro activo: {monthLabel} · {supervisorLabel} · {tipoLabel} · Cliente ISDIN
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onClear}>
            Ocultar reporte
          </Button>
        </div>
        <ReportSection rows={rows} />
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Reporte mensual
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">
            Vista consolidada bajo demanda
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            El detalle agrupado por PDV no se carga visualmente hasta que lo solicites. Se generará
            con el filtro actual: {monthLabel} · {supervisorLabel} · {tipoLabel} · Cliente ISDIN.
          </p>
        </div>
        <Button type="button" onClick={onRequest}>
          Generar reporte filtrado
        </Button>
      </div>
    </Card>
  );
}

function ReportSection({ rows }: { rows: MaterialesPanelData['reportRows'] }) {
  const [expandedPdv, setExpandedPdv] = useState<string | null>(null);

  const groupedByPdv = useMemo(() => {
    const groups = new Map<
      string,
      {
        pdv: string;
        pdvClaveBtl: string | null;
        chain: string | null;
        rows: typeof rows;
        totalEnviado: number;
        totalRecibido: number;
        totalEntregado: number;
        totalRestante: number;
      }
    >();
    for (const row of rows) {
      const key = `${row.pdvClaveBtl}-${row.pdv}`;
      const current = groups.get(key) ?? {
        pdv: row.pdv,
        pdvClaveBtl: row.pdvClaveBtl,
        chain: row.chain,
        rows: [],
        totalEnviado: 0,
        totalRecibido: 0,
        totalEntregado: 0,
        totalRestante: 0,
      };
      current.rows.push(row);
      current.totalEnviado += row.enviado;
      current.totalRecibido += row.recibido;
      current.totalEntregado += row.entregado;
      current.totalRestante += row.restante;
      groups.set(key, current);
    }
    return Array.from(groups.values()).sort((a, b) => a.pdv.localeCompare(b.pdv));
  }, [rows]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Reporte mensual
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">
            Vista consolidada agrupada por PDV
          </h2>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-6 py-4 font-medium">PDV / Cadena</th>
              <th className="px-6 py-4 font-medium">Promocionales</th>
              <th className="px-6 py-4 font-medium">Enviado</th>
              <th className="px-6 py-4 font-medium">Recibido</th>
              <th className="px-6 py-4 font-medium">Entregado</th>
              <th className="px-6 py-4 font-medium">Saldo</th>
              <th className="px-6 py-4 font-medium text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupedByPdv.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                  No hay datos del reporte para el mes filtrado.
                </td>
              </tr>
            ) : (
              groupedByPdv.map((group) => (
                <Fragment key={`${group.pdvClaveBtl}-${group.pdv}`}>
                  <tr
                    className="cursor-pointer bg-white transition-colors hover:bg-slate-50"
                    onClick={() =>
                      setExpandedPdv(expandedPdv === group.pdvClaveBtl ? null : group.pdvClaveBtl)
                    }
                  >
                    <td className="px-6 py-4 text-slate-700">
                      <div className="font-medium text-slate-900">{group.pdv}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {group.pdvClaveBtl ?? 'Sin clave'} · {group.chain ?? 'Sin cadena'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{group.rows.length} items</td>
                    <td className="px-6 py-4 font-medium">{group.totalEnviado}</td>
                    <td className="px-6 py-4 font-medium">{group.totalRecibido}</td>
                    <td className="px-6 py-4 font-medium">{group.totalEntregado}</td>
                    <td className="px-6 py-4 font-medium text-emerald-700">
                      {group.totalRestante}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
                        {expandedPdv === group.pdvClaveBtl ? '−' : '+'}
                      </span>
                    </td>
                  </tr>
                  {expandedPdv === group.pdvClaveBtl && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 p-0">
                        <div className="px-6 py-4 shadow-inner">
                          <table className="min-w-full text-xs">
                            <thead className="text-left text-slate-500 border-b border-slate-200">
                              <tr>
                                <th className="pb-3 font-medium">Material</th>
                                <th className="pb-3 font-medium">Estado</th>
                                <th className="pb-3 font-medium text-center">Env</th>
                                <th className="pb-3 font-medium text-center">Rec</th>
                                <th className="pb-3 font-medium text-center">Ent</th>
                                <th className="pb-3 font-medium text-center">Saldo</th>
                                <th className="pb-3 font-medium">Evidencias</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.rows.map((row) => (
                                <tr key={row.material}>
                                  <td className="py-3">
                                    <p className="font-medium text-slate-900">{row.material}</p>
                                    <p className="mt-1 text-[10px] text-slate-500 uppercase">
                                      {row.materialTipo}
                                    </p>
                                  </td>
                                  <td className="py-3">
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${row.estadoEntregaActual === 'ENTREGADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
                                    >
                                      {formatDeliveryStatus(row.estadoEntregaActual)}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center text-slate-600">{row.enviado}</td>
                                  <td className="py-3 text-center text-slate-600">
                                    {row.recibido}
                                  </td>
                                  <td className="py-3 text-center text-slate-600">
                                    {row.entregado}
                                  </td>
                                  <td className="py-3 text-center font-medium text-emerald-700">
                                    {row.restante}
                                  </td>
                                  <td className="py-3">
                                    <div className="flex gap-2">
                                      {row.evidencias > 0 && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{' '}
                                          Recep.
                                        </span>
                                      )}
                                      {row.mercadeo && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                                          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />{' '}
                                          Merc.
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LastMileComparisonDemandSection({
  actor,
  rows,
  distributionById,
  monthOptions,
  initialMonth,
  selectedAccountId,
}: {
  actor: ActorActual;
  rows: MaterialesPanelData['lastMileDeliveries'];
  distributionById: Map<string, MaterialDistributionItem>;
  monthOptions: string[];
  initialMonth: string;
  selectedAccountId: string;
}) {
  const [isRequested, setIsRequested] = useState(false);
  const [month, setMonth] = useState(initialMonth);
  const [pdvId, setPdvId] = useState('');
  const [receiver, setReceiver] = useState('');
  const [supervisorId, setSupervisorId] = useState('');

  const scopedRows = useMemo(
    () =>
      rows.filter((row) => {
        const distribution = distributionById.get(row.distribucionId);
        if (!distribution) {
          return row.capturadoEn.slice(0, 7) === month;
        }
        if (selectedAccountId && distribution.cuentaClienteId !== selectedAccountId) {
          return false;
        }
        return distribution.mesOperacion === month;
      }),
    [distributionById, month, rows, selectedAccountId]
  );

  const pdvOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of scopedRows) {
      options.set(row.pdvId, row.pdvNombre);
    }
    return [
      { value: '', label: 'Todos los PDV' },
      ...Array.from(options.entries())
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [scopedRows]);

  const receiverOptions = useMemo(() => {
    const options = new Set<string>();
    for (const row of scopedRows) {
      if (row.receptor) {
        options.add(row.receptor);
      }
    }
    return [
      { value: '', label: 'Todos los receptores' },
      ...Array.from(options)
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({ value, label: value })),
    ];
  }, [scopedRows]);

  const supervisorOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of scopedRows) {
      options.set(row.supervisorEmpleadoId, row.supervisorNombre ?? 'Sin supervisor');
    }
    return [
      { value: '', label: 'Todos los supervisores' },
      ...Array.from(options.entries())
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [scopedRows]);

  const filteredRows = useMemo(() => {
    if (!isRequested) {
      return [];
    }

    return scopedRows.filter((row) => {
      if (pdvId && row.pdvId !== pdvId) {
        return false;
      }
      if (receiver && row.receptor !== receiver) {
        return false;
      }
      if (supervisorId && row.supervisorEmpleadoId !== supervisorId) {
        return false;
      }
      return true;
    });
  }, [isRequested, pdvId, receiver, scopedRows, supervisorId]);

  const handleFilterChange = (setter: (value: string) => void, value: string) => {
    setter(value);
    setIsRequested(false);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Última milla
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">
              Comparativa de entregas supervisor a DC
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              La comparativa se genera solo bajo demanda y con filtros activos para mantener el
              panel ligero.
            </p>
          </div>
          {isRequested ? (
            <Button type="button" variant="outline" onClick={() => setIsRequested(false)}>
              Ocultar comparativa
            </Button>
          ) : (
            <Button type="button" onClick={() => setIsRequested(true)}>
              Generar comparativa filtrada
            </Button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Mes"
            options={monthOptions.map((item) => ({ value: item, label: formatMonth(item) }))}
            value={month}
            onChange={(event) => handleFilterChange(setMonth, event.target.value)}
          />
          <Select
            label="PDV"
            options={pdvOptions}
            value={pdvId}
            onChange={(event) => handleFilterChange(setPdvId, event.target.value)}
          />
          <Select
            label="Receptor"
            options={receiverOptions}
            value={receiver}
            onChange={(event) => handleFilterChange(setReceiver, event.target.value)}
          />
          <Select
            label="Supervisor"
            options={supervisorOptions}
            value={supervisorId}
            onChange={(event) => handleFilterChange(setSupervisorId, event.target.value)}
          />
        </div>

        {!isRequested ? (
          <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
            Selecciona filtros y genera la comparativa cuando necesites revisar el detalle.
          </div>
        ) : null}
      </Card>
      {isRequested ? <LastMileReportSection actor={actor} rows={filteredRows} /> : null}
    </div>
  );
}

function LastMileReportSection({
  actor,
  rows,
}: {
  actor: ActorActual;
  rows: MaterialesPanelData['lastMileDeliveries'];
}) {
  const [correctionRowId, setCorrectionRowId] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const router = useRouter();
  const offline = useOfflineSync();
  const canCorrect = ['SUPERVISOR', 'ADMINISTRADOR', 'LOGISTICA', 'COORDINADOR'].includes(
    actor.puesto
  );

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
          Última milla
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          Comparativa de entregas supervisor a DC
        </h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Todavía no hay entregas de última milla sincronizadas." />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const entrega = row.evidencias.find((item) => item.tipo === 'ENTREGA_FISICA');
            const acuses = row.evidencias.filter((item) => item.tipo === 'ACUSE_FIRMADO');
            const hasCorrection = Object.keys(row.correccionSolicitada).length > 0;
            const isExpanded = expandedRowId === row.id;
            const isCorrecting = correctionRowId === row.id;

            return (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-white">
                <button
                  type="button"
                  className="w-full rounded-2xl p-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  onClick={() => {
                    const nextExpanded = isExpanded ? null : row.id;
                    setExpandedRowId(nextExpanded);
                    if (!nextExpanded || correctionRowId !== row.id) {
                      setCorrectionRowId(null);
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{row.pdvNombre}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {row.idPdvCadena ?? row.pdvClaveBtl ?? 'Sin ID'} ·{' '}
                        {row.cadena ?? 'Sin cadena'}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-sky-700">
                      {isExpanded ? 'Cerrar' : 'Abrir'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Pill
                      tone={
                        row.estado === 'CON_DISCREPANCIA' || hasCorrection ? 'amber' : 'emerald'
                      }
                    >
                      {formatStatus(row.estado)}
                    </Pill>
                    {hasCorrection && <Pill tone="amber">Corrección propuesta</Pill>}
                    <span className="text-sm text-slate-500">
                      {formatDateTime(row.capturadoEn)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-2 text-center">
                    <CompactLastMileMetric label="Teórico" value={row.totalTeorico} />
                    <CompactLastMileMetric label="Real" value={row.totalReal} />
                    <CompactLastMileMetric
                      label="Dif."
                      value={row.diferenciaTotal}
                      tone={row.diferenciaTotal === 0 ? 'emerald' : 'amber'}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <LastMileDetail label="Captura" value={formatDateTime(row.capturadoEn)} />
                      <LastMileDetail label="Receptor" value={row.receptor ?? 'Sin receptor'} />
                      <LastMileDetail label="Ítems" value={String(row.totalItems)} />
                      <LastMileDetail
                        label="GPS"
                        value={
                          row.latitud && row.longitud
                            ? `${row.latitud.toFixed(5)}, ${row.longitud.toFixed(5)} · ±${row.gpsAccuracyMetros ? Math.round(row.gpsAccuracyMetros) : '?'} m`
                            : 'Sin GPS'
                        }
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <EvidencePreview
                        url={entrega?.thumbnailUrl ?? entrega?.url ?? null}
                        hash={row.id}
                        label="Entrega"
                        emptyLabel="Sin entrega"
                      />
                      <EvidencePreview
                        url={acuses[0]?.thumbnailUrl ?? acuses[0]?.url ?? null}
                        hash={row.id}
                        label={`Acuses (${acuses.length})`}
                        emptyLabel="Sin acuse"
                      />
                    </div>

                    {canCorrect && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setCorrectionRowId(isCorrecting ? null : row.id)}
                      >
                        {isCorrecting ? 'Cerrar corrección' : 'Corregir entrega'}
                      </Button>
                    )}

                    {canCorrect && isCorrecting && (
                      <div className="rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100 sm:p-4">
                        <LastMileCorrectionForm
                          actor={actor}
                          row={row}
                          isOnline={offline.isOnline}
                          syncNow={offline.syncNow}
                          onDone={async () => {
                            await offline.refreshSummary();
                            setCorrectionRowId(null);
                            router.refresh();
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function CompactLastMileMetric({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-slate-900';

  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 truncate text-sm font-semibold leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}

function LastMileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function LastMileCorrectionForm({
  actor,
  row,
  isOnline,
  syncNow,
  onDone,
}: {
  actor: ActorActual;
  row: MaterialesPanelData['lastMileDeliveries'][number];
  isOnline: boolean;
  syncNow: () => Promise<void>;
  onDone: () => Promise<void>;
}) {
  const [deliveryPhoto, setDeliveryPhoto] = useState<MaterialCameraCaptureDraft | null>(null);
  const [acusePhotos, setAcusePhotos] = useState<MaterialCameraCaptureDraft[]>([]);
  const receiverOptions = useMemo(() => {
    if (
      !row.dermoconsejeroEmpleadoId ||
      row.receptorOptions.some((option) => option.id === row.dermoconsejeroEmpleadoId)
    ) {
      return row.receptorOptions;
    }

    return [
      {
        id: row.dermoconsejeroEmpleadoId,
        nombre: row.receptor ?? 'Receptor actual',
        username: null,
        idNomina: null,
        scope: 'TODOS' as const,
        label: row.receptor ?? 'Receptor actual',
      },
      ...row.receptorOptions,
    ];
  }, [row.dermoconsejeroEmpleadoId, row.receptor, row.receptorOptions]);
  const [selectedReceiverId, setSelectedReceiverId] = useState(
    row.dermoconsejeroEmpleadoId ?? receiverOptions[0]?.id ?? ''
  );
  const selectedReceiver =
    receiverOptions.find((option) => option.id === selectedReceiverId) ?? null;
  const isPdvPorCubrir = selectedReceiver?.scope === 'POR_CUBRIR';
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const entrega = row.evidencias.find((item) => item.tipo === 'ENTREGA_FISICA');
  const acuses = row.evidencias.filter((item) => item.tipo === 'ACUSE_FIRMADO');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsSaving(true);

    try {
      if (receiverOptions.length > 0 && !selectedReceiver) {
        throw new Error('Selecciona la dermoconsejera receptora corregida.');
      }

      const formData = new FormData(event.currentTarget);
      const detalles = row.detalles.map((detail) => {
        const rawReal = String(
          formData.get(`correccion_cantidad_real__${detail.distribucionDetalleId}`) ?? ''
        ).trim();
        const cantidadReal = Number(rawReal);

        if (!Number.isInteger(cantidadReal) || cantidadReal < 0) {
          throw new Error(`Captura una cantidad real válida para ${detail.materialNombre}.`);
        }

        const estadoItem: 'COMPLETO' | 'CON_DISCREPANCIA' =
          cantidadReal === detail.cantidadTeorica ? 'COMPLETO' : 'CON_DISCREPANCIA';

        return {
          distribucion_detalle_id: detail.distribucionDetalleId,
          material_catalogo_id: detail.materialCatalogoId,
          cantidad_teorica: detail.cantidadTeorica,
          estado_item: estadoItem,
          cantidad_real_recibida: cantidadReal,
          observaciones:
            String(
              formData.get(`correccion_observacion__${detail.distribucionDetalleId}`) ?? ''
            ).trim() || null,
        };
      });

      const gps = await getCurrentGpsPosition();
      const id = crypto.randomUUID();
      const correctionClientId = `material-ultima-milla-correccion-${id}`;

      await queueOfflineMaterialEntrega({
        id,
        modo: 'CORRECCION',
        correccion_entrega_id: row.id,
        correccion_client_id: correctionClientId,
        cuenta_cliente_id: row.cuentaClienteId,
        distribucion_id: row.distribucionId,
        pdv_id: row.pdvId,
        cadena_id: row.cadenaId,
        supervisor_empleado_id: row.supervisorEmpleadoId,
        dermoconsejero_empleado_id: isPdvPorCubrir ? null : (selectedReceiver?.id ?? row.dermoconsejeroEmpleadoId),
        pdv_snapshot: {
          id: row.pdvId,
          nombre: row.pdvNombre,
          clave_btl: row.pdvClaveBtl,
          id_cadena: row.idPdvCadena,
        },
        cadena_snapshot: {
          nombre: row.cadena,
        },
        dermoconsejero_snapshot: {
          id: isPdvPorCubrir ? null : (selectedReceiver?.id ?? row.dermoconsejeroEmpleadoId),
          nombre: isPdvPorCubrir ? null : (selectedReceiver?.nombre ?? row.receptor),
          username: isPdvPorCubrir ? null : (selectedReceiver?.username ?? null),
          id_nomina: isPdvPorCubrir ? null : (selectedReceiver?.idNomina ?? null),
          seleccion_origen: isPdvPorCubrir ? 'POR_CUBRIR' : (selectedReceiver?.scope ?? null),
        },
        correccion_solicitada: {},
        latitud: gps.latitude,
        longitud: gps.longitude,
        gps_accuracy_metros: gps.accuracy,
        capturado_en: new Date().toISOString(),
        offline_client_id: correctionClientId,
        observaciones: String(formData.get('correccion_observaciones') ?? '').trim() || null,
        metadata: {
          capturado_desde: 'supervisor_ultima_milla_correccion',
          entrega_original_id: row.id,
          pdv_label: row.pdvNombre,
          receptor_label: isPdvPorCubrir ? 'Por cubrir' : (selectedReceiver?.nombre ?? row.receptor),
          receptor_anterior_label: row.receptor,
          corregido_por_empleado_id: actor.empleadoId,
          receptor_origen: isPdvPorCubrir ? 'POR_CUBRIR' : (selectedReceiver?.scope ?? null),
          modo_entrega: isPdvPorCubrir ? 'POR_CUBRIR' : 'ENTREGA_DC',
        },
        detalles,
        evidencia_entrega_fisica: deliveryPhoto
          ? {
              file: deliveryPhoto.file,
              fileName: deliveryPhoto.fileName,
              mimeType: deliveryPhoto.file.type,
              fileSize: deliveryPhoto.fileSize,
              capturedAt: deliveryPhoto.capturedAt,
              localHash: null,
              evidenceRole: isPdvPorCubrir ? 'PRODUCTO_EN_RESGUARDO' : 'ENTREGA_FISICA',
            }
          : null,
        evidencias_acuse_firmado: isPdvPorCubrir
          ? []
          : acusePhotos.map((photo) => ({
              file: photo.file,
              fileName: photo.fileName,
              mimeType: photo.file.type,
              fileSize: photo.fileSize,
              capturedAt: photo.capturedAt,
              localHash: null,
              evidenceRole: 'ACUSE_FIRMADO',
            })),
      });

      if (typeof navigator !== 'undefined' && navigator.onLine && isOnline) {
        await syncNow();
        await onDone();
        setDeliveryPhoto(null);
        setAcusePhotos([]);
        setMessage({ ok: true, text: 'Corrección sincronizada.' });
        return;
      }

      setDeliveryPhoto(null);
      setAcusePhotos([]);
      setMessage({
        ok: true,
        text: 'Corrección guardada sin conexión. Se sincronizará al recuperar internet.',
      });
      await onDone();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'No fue posible guardar la corrección.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[18px] border border-sky-200 bg-white p-5"
    >
      <div>
        <p className="font-medium text-slate-950">Corregir recepción de última milla</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Ajusta cantidades u observaciones. Si capturas una nueva entrega física o nuevos acuses,
          reemplazarán a las fotos actuales.
        </p>
      </div>

      {receiverOptions.length > 0 ? (
        <SearchableReceiverSelect
          label="Dermoconsejera receptora"
          options={receiverOptions}
          value={selectedReceiverId}
          onChange={setSelectedReceiverId}
        />
      ) : (
        <ReadOnlyAccountField
          label="Dermoconsejera receptora"
          value={row.receptor ?? 'Sin receptor'}
        />
      )}

      <div className="grid gap-2.5">
        {row.detalles.map((detail) => (
          <div
            key={detail.id}
            className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-[13px] font-semibold leading-tight text-slate-950">
                  {detail.materialNombre}
                </p>
                <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {detail.materialTipo}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                Teórico {detail.cantidadTeorica}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-[104px_minmax(0,1fr)] gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Recibida
                </span>
                <input
                  name={`correccion_cantidad_real__${detail.distribucionDetalleId}`}
                  type="number"
                  min="0"
                  defaultValue={String(detail.cantidadRealRecibida)}
                  className="h-9 w-full rounded-[11px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Obs.
                </span>
                <input
                  name={`correccion_observacion__${detail.distribucionDetalleId}`}
                  type="text"
                  defaultValue={detail.observaciones ?? ''}
                  className="h-9 w-full rounded-[11px] border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="flex gap-3">
            <EvidencePreview
              url={entrega?.thumbnailUrl ?? entrega?.url ?? null}
              hash={row.id}
              label={isPdvPorCubrir ? "Resguardo actual" : "Entrega actual"}
              emptyLabel={isPdvPorCubrir ? "Sin resguardo" : "Sin entrega"}
            />
          </div>
          <LastMileCameraField
            title={isPdvPorCubrir ? "Nueva foto de producto en resguardo" : "Nueva foto de entrega física"}
            description={isPdvPorCubrir ? "Opcional. Captura el producto resguardado en tienda." : "Opcional. Si capturas una nueva foto, reemplaza la foto actual."}
            buttonLabel={isPdvPorCubrir ? "Reemplazar resguardo" : "Reemplazar entrega"}
            pdvLabel={row.pdvNombre}
            flowLabel="Ultima milla"
            drafts={deliveryPhoto ? [deliveryPhoto] : []}
            onChange={(drafts) => setDeliveryPhoto(drafts[0] ?? null)}
          />
        </div>
        {!isPdvPorCubrir && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <EvidencePreview
                url={acuses[0]?.thumbnailUrl ?? acuses[0]?.url ?? null}
                hash={row.id}
                label={`Acuses actuales (${acuses.length})`}
                emptyLabel="Sin acuse"
              />
            </div>
            <LastMileCameraField
              title="Nuevos acuses firmados"
              description="Opcional. Si agregas acuses nuevos, reemplazan todos los acuses actuales."
              buttonLabel="Reemplazar acuse"
              pdvLabel={row.pdvNombre}
              flowLabel="Acuse firmado"
              multiple
              drafts={acusePhotos}
              onChange={setAcusePhotos}
            />
          </div>
        )}
      </div>

      <label className="block text-sm text-slate-600">
        Observaciones generales de corrección
        <textarea
          name="correccion_observaciones"
          rows={3}
          className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" isLoading={isSaving} disabled={isSaving || row.detalles.length === 0}>
          {isSaving ? 'Guardando...' : 'Guardar corrección'}
        </Button>
        {message && <StateMessage ok={message.ok} message={message.text} />}
      </div>
    </form>
  );
}

function CameraCaptureField({
  name,
  pdvLabel,
  flowLabel,
  title,
  description,
  buttonLabel,
}: {
  name:
    | 'foto_recepcion'
    | 'foto_mercadeo'
    | 'evidencia_material'
    | 'evidencia_pdv'
    | 'ticket_compra';
  pdvLabel: string;
  flowLabel:
    | 'Recepcion de material'
    | 'Ultima milla'
    | 'Acuse firmado'
    | 'Evidencia de mercadeo'
    | 'Entrega de material'
    | 'Evidencia en PDV'
    | 'Ticket de compra';
  title: string;
  description: string;
  buttonLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<MaterialCameraCaptureDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (draft?.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl);
      }
    };
  }, [draft]);

  const handleCapture = async (file: File) => {
    const capturedAt = new Date().toISOString();
    const stamped = await stampMaterialEvidencePhoto(file, {
      capturedAt,
      pdvLabel,
      flowLabel,
    });
    const dataUrl = await fileToDataUrl(stamped.file);

    setError(null);
    setDraft((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return {
        file: stamped.file,
        previewUrl: URL.createObjectURL(stamped.file),
        dataUrl,
        fileName: stamped.file.name,
        fileSize: stamped.file.size,
        capturedAt,
        targetBytes: stamped.targetBytes,
        targetMet: stamped.targetMet,
      };
    });
  };

  return (
    <div className="space-y-4 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (draft.previewUrl) {
                  URL.revokeObjectURL(draft.previewUrl);
                }
                setDraft(null);
                setError(null);
              }}
            >
              Limpiar
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
            {draft ? 'Tomar de nuevo' : buttonLabel}
          </Button>
        </div>
      </div>

      <input type="hidden" name={`${name}_data_url`} value={draft?.dataUrl ?? ''} />
      <input type="hidden" name={`${name}_capturada_en`} value={draft?.capturedAt ?? ''} />

      {draft ? (
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
          <img src={draft.previewUrl} alt={title} className="aspect-[4/5] w-full object-cover" />
          <div className="grid gap-3 px-4 py-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-950">Captura lista</p>
              <p className="mt-1 break-all">{draft.fileName}</p>
              <p className="mt-1">Hora: {new Date(draft.capturedAt).toLocaleString('es-MX')}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-950">Sello aplicado</p>
              <p className="mt-1">PDV: {pdvLabel}</p>
              <p className="mt-1">
                Peso final: {(draft.fileSize / 1024).toFixed(1)} KB ·{' '}
                {draft.targetMet ? 'objetivo cumplido' : 'compresión máxima aplicada'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-[16px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
          La cámara en vivo generará un borrador sellado con fecha, hora y PDV antes de enviar la
          evidencia.
        </p>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <NativeCameraSelfieDialog
        open={isOpen}
        title={title}
        description={description}
        facingMode="environment"
        captureLabel={buttonLabel}
        onClose={() => setIsOpen(false)}
        onCapture={async (file) => {
          try {
            await handleCapture(file);
          } catch (captureError) {
            setError(
              captureError instanceof Error
                ? captureError.message
                : 'No fue posible preparar la captura sellada.'
            );
            throw captureError;
          }
        }}
      />
    </div>
  );
}

function LastMileCameraField({
  title,
  description,
  buttonLabel,
  pdvLabel,
  flowLabel,
  multiple,
  drafts,
  onChange,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  pdvLabel: string;
  flowLabel: 'Ultima milla' | 'Acuse firmado';
  multiple?: boolean;
  drafts: MaterialCameraCaptureDraft[];
  onChange: (drafts: MaterialCameraCaptureDraft[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const draftsRef = useRef(drafts);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    return () => {
      draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
    };
  }, []);

  const prepareEvidenceDraft = async (file: File) => {
    const capturedAt = new Date().toISOString();
    const stamped = await stampMaterialEvidencePhoto(file, {
      capturedAt,
      pdvLabel,
      flowLabel,
    });
    const dataUrl = await fileToDataUrl(stamped.file);
    return {
      file: stamped.file,
      previewUrl: URL.createObjectURL(stamped.file),
      dataUrl,
      fileName: stamped.file.name,
      fileSize: stamped.file.size,
      capturedAt,
      targetBytes: stamped.targetBytes,
      targetMet: stamped.targetMet,
    } satisfies MaterialCameraCaptureDraft;
  };

  const applyDrafts = (newDrafts: MaterialCameraCaptureDraft[]) => {
    setError(null);
    if (multiple) {
      onChange([...drafts, ...newDrafts]);
      return;
    }

    drafts.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    onChange(newDrafts.slice(0, 1));
  };

  const handleCapture = async (file: File) => {
    applyDrafts([await prepareEvidenceDraft(file)]);
  };

  const handleGallerySelection = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []).filter(
      (file) => file.type.startsWith('image/') || isHeifLikeFile(file)
    );

    if (selectedFiles.length === 0) {
      return;
    }

    try {
      const preparedDrafts = [];
      for (const file of selectedFiles) {
        preparedDrafts.push(await prepareEvidenceDraft(file));
      }
      applyDrafts(preparedDrafts);
    } catch (galleryError) {
      setError(
        galleryError instanceof Error
          ? galleryError.message
          : 'No fue posible preparar la imagen seleccionada.'
      );
    } finally {
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
            {buttonLabel}
          </Button>
          <Button type="button" variant="outline" onClick={() => galleryInputRef.current?.click()}>
            Subir desde galería
          </Button>
        </div>
      </div>
      <input
        ref={galleryInputRef}
        type="file"
        accept={EVIDENCE_IMAGE_ACCEPT}
        multiple={Boolean(multiple)}
        className="sr-only"
        onChange={(event) => void handleGallerySelection(event.target.files)}
      />

      {drafts.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
          Sin evidencia todavía. Puedes tomar una foto o seleccionar una imagen de la galería.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {drafts.map((draft, index) => (
            <div
              key={`${draft.capturedAt}-${index}`}
              className="overflow-hidden rounded-[16px] border border-slate-200 bg-white"
            >
              <img
                src={draft.previewUrl}
                alt={`${title} ${index + 1}`}
                className="aspect-[4/5] w-full object-cover"
              />
              <div className="space-y-1 px-3 py-3 text-xs text-slate-600">
                <p className="font-medium text-slate-950">{formatDateTime(draft.capturedAt)}</p>
                <p>{(draft.fileSize / 1024).toFixed(1)} KB</p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    URL.revokeObjectURL(draft.previewUrl);
                    onChange(drafts.filter((_, draftIndex) => draftIndex !== index));
                  }}
                >
                  Quitar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <NativeCameraSelfieDialog
        open={isOpen}
        title={title}
        description={description}
        facingMode="environment"
        captureLabel={buttonLabel}
        onClose={() => setIsOpen(false)}
        onCapture={async (file) => {
          try {
            await handleCapture(file);
          } catch (captureError) {
            setError(
              captureError instanceof Error
                ? captureError.message
                : 'No fue posible preparar la captura.'
            );
            throw captureError;
          }
        }}
      />
    </div>
  );
}

function SignatureField({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    let drawing = false;

    const getPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    const handleDown = (event: PointerEvent) => {
      drawing = true;
      const point = getPoint(event);
      context.beginPath();
      context.moveTo(point.x, point.y);
    };

    const handleMove = (event: PointerEvent) => {
      if (!drawing) {
        return;
      }
      const point = getPoint(event);
      context.lineTo(point.x, point.y);
      context.stroke();
      setDataUrl(canvas.toDataURL('image/png'));
    };

    const handleUp = () => {
      if (!drawing) {
        return;
      }
      drawing = false;
      setDataUrl(canvas.toDataURL('image/png'));
    };

    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-950">Firma digital</p>
        <p className="mt-1 text-sm text-slate-600">
          Firma con tu dedo o cursor. Esto queda como acuse oficial.
        </p>
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={220}
        className="w-full rounded-[18px] border border-slate-300 bg-white touch-none"
      />
      <input type="hidden" name={name} value={dataUrl} />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const canvas = canvasRef.current;
          const context = canvas?.getContext('2d');
          if (!canvas || !context) {
            return;
          }
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          setDataUrl('');
        }}
      >
        Limpiar firma
      </Button>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />;
}

function MiniNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'emerald' | 'amber' | 'sky' | 'slate' | 'violet';
}) {
  const className =
    tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : tone === 'violet'
          ? 'bg-violet-100 text-violet-800'
          : tone === 'sky'
            ? 'bg-sky-100 text-sky-800'
            : 'bg-slate-100 text-slate-700';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{children}</span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-500">
      {message}
    </div>
  );
}

function StateMessage({ ok, message }: { ok: boolean; message: string | null }) {
  if (!message) {
    return null;
  }

  return <p className={`text-sm ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message}</p>;
}

function ReadOnlyAccountField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 block text-sm font-medium text-foreground">{label}</p>
      <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
        {value}
      </div>
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" isLoading={pending} disabled={disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function formatMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
}

function formatTipoDispersionLabel(value?: string | null) {
  const map: Record<string, string> = {
    MENSUAL: 'Mensual (Ordinaria)',
    ADICIONAL: 'Adicional',
    EXCLUSIVA_CANJES: 'Exclusiva Canjes',
    EXCLUSIVA_TESTERS: 'Exclusiva Testers',
    EXCLUSIVA_REGALOS: 'Exclusiva Regalos',
    OTRA: 'Otra',
  };
  return map[value ?? ''] ?? value ?? 'Mensual (Ordinaria)';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  );
}

function formatStatus(value: string) {
  if (value === 'SINCRONIZADA') {
    return 'Entrega realizada';
  }

  return value.replaceAll('_', ' ');
}

function formatDeliveryStatus(value: 'ENTREGADO' | 'NO_ENTREGADO') {
  return value === 'ENTREGADO' ? 'Entrega realizada' : 'No entregado';
}
