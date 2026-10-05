import { useState, useMemo, useEffect, useRef } from 'react';
import { obtenerTodosPdvsConDcVigente, obtenerReceptoresPdv, obtenerPlantillaActivaDermos, guardarSupervisorEvidencia } from '@/features/evidencias/actions';
import { uploadFileDirectToR2 } from '@/lib/storage/directR2Client';
import { SearchableCombobox, type ComboboxOption } from './SearchableCombobox';
import type { FotoEvidencia } from '@/features/evidencias/types';
import type { ActorActual } from '@/lib/auth/session';
import type { MaterialesPanelData, MaterialDistributionItem } from '@/features/materiales/services/materialService';

interface SupervisorLastMileFormProps {
  actor?: ActorActual;
  materialesData?: MaterialesPanelData | null;
  selectedMonth: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onCancel?: () => void;
}

export function SupervisorLastMileForm({
  actor,
  materialesData,
  selectedMonth,
  onSuccess,
  onError,
  onCancel,
}: SupervisorLastMileFormProps) {
  const [selectedDistribucionId, setSelectedDistribucionId] = useState<string>('');
  const [modoEntrega, setModoEntrega] = useState<'ENTREGADO_DC' | 'POR_CUBRIR'>('ENTREGADO_DC');
  const [nombreReceptor, setNombreReceptor] = useState<string>('');
  const [puestoReceptor, setPuestoReceptor] = useState<string>('Dermoconsejera');
  const [observaciones, setObservaciones] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // PDVs & Receptores fetched from database actions
  const [pdvList, setPdvList] = useState<Array<{ id: string; nombre: string; claveBtl: string; cadena: string; nombreDc?: string }>>([]);
  const [receptoresPdv, setReceptoresPdv] = useState<Array<{ id: string; nombreCompleto: string; puesto: string }>>([]);
  const [plantillaDermos, setPlantillaDermos] = useState<Array<{ id: string; nombreCompleto: string }>>([]);

  // File states for the 2 vertical photo slots
  const [fotoAcuse, setFotoAcuse] = useState<File | null>(null);
  const [fotoEntrega, setFotoEntrega] = useState<File | null>(null);
  const [fotoAcusePreview, setFotoAcusePreview] = useState<string | null>(null);
  const [fotoEntregaPreview, setFotoEntregaPreview] = useState<string | null>(null);

  // File input refs
  const cameraAcuseRef = useRef<HTMLInputElement>(null);
  const galleryAcuseRef = useRef<HTMLInputElement>(null);
  const cameraEntregaRef = useRef<HTMLInputElement>(null);
  const galleryEntregaRef = useRef<HTMLInputElement>(null);

  // Load all active PDVs & Full Active Plantilla Dermos for the selected operating month
  useEffect(() => {
    void (async () => {
      const [pdvs, dermos] = await Promise.all([
        obtenerTodosPdvsConDcVigente(selectedMonth),
        obtenerPlantillaActivaDermos(),
      ]);
      if (pdvs && pdvs.length > 0) setPdvList(pdvs);
      if (dermos && dermos.length > 0) setPlantillaDermos(dermos);
    })();
  }, [selectedMonth]);

  const distributions: MaterialDistributionItem[] = useMemo(() => {
    if (!materialesData?.distributions) return [];
    return materialesData.distributions.filter(
      (d) => d.mesOperacion === selectedMonth || !selectedMonth
    );
  }, [materialesData?.distributions, selectedMonth]);

  // Combine active PDVs catalog and distributions so every active store is selectable without duplicates
  const pdvSelectOptions = useMemo(() => {
    const distByPdvId = new Map<string, MaterialDistributionItem>();
    distributions.forEach((d) => {
      if (d.pdvId) distByPdvId.set(d.pdvId, d);
    });

    const seenIds = new Set<string>();
    const result: Array<{
      id: string;
      pdvId: string;
      label: string;
      nombreDc: string;
      cadena: string;
      distribution?: MaterialDistributionItem;
    }> = [];

    if (pdvList.length > 0) {
      for (const p of pdvList) {
        if (!p.id || seenIds.has(p.id)) continue;
        seenIds.add(p.id);

        const dist = distByPdvId.get(p.id);
        result.push({
          id: p.id,
          pdvId: p.id,
          label: p.nombre,
          nombreDc: p.nombreDc || dist?.nombreDc || '',
          cadena: p.cadena || '',
          distribution: dist,
        });
      }
      return result;
    }

    for (const d of distributions) {
      const pdvId = d.pdvId || d.id;
      if (!pdvId || seenIds.has(pdvId)) continue;
      seenIds.add(pdvId);

      result.push({
        id: pdvId,
        pdvId: pdvId,
        label: d.pdvNombre,
        nombreDc: d.nombreDc || '',
        cadena: (d as any).cadena || '',
        distribution: d,
      });
    }

    return result;
  }, [distributions, pdvList]);

  const [pdvSearchText, setPdvSearchText] = useState<string>('');

  const selectedOption = useMemo(() => {
    return pdvSelectOptions.find((opt) => opt.id === selectedDistribucionId);
  }, [pdvSelectOptions, selectedDistribucionId]);

  const selectedDistribucion = selectedOption?.distribution;

  // Quantities state per detail item
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // ═══════════════════════════════════════════════════════════════════
  // HANDLER: When the user picks a different PDV from the combobox
  // ═══════════════════════════════════════════════════════════════════
  const handleDistribucionChange = (id: string) => {
    setSelectedDistribucionId(id);

    const opt = pdvSelectOptions.find((o) => o.id === id);
    if (opt) {
      setPdvSearchText(opt.label);
    }

    // Pre-fill quantities from distribution if available
    const dist = opt?.distribution;
    if (dist?.detalles) {
      const initial: Record<string, number> = {};
      dist.detalles.forEach((det) => {
        initial[det.id] = det.cantidadEnviada;
      });
      setQuantities(initial);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // EFFECT 1: Auto-select only when single monthly distribution exists
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (distributions.length === 1 && !selectedDistribucionId) {
      const first = pdvSelectOptions[0];
      if (first) {
        setSelectedDistribucionId(first.id);
        setPdvSearchText(first.label);
      }
    }
  }, [distributions.length, pdvSelectOptions, selectedDistribucionId]);

  // ═══════════════════════════════════════════════════════════════════
  // EFFECT 2: When PDV changes → fetch receptors from DB and auto-fill
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!selectedDistribucionId) return;

    const opt = pdvSelectOptions.find((o) => o.id === selectedDistribucionId);
    const targetPdvId = opt?.pdvId || selectedDistribucionId;

    if (modoEntrega === 'POR_CUBRIR') {
      setPuestoReceptor('Supervisor');
      setNombreReceptor(actor?.nombreCompleto || 'Supervisor');
      void (async () => {
        const data = await obtenerReceptoresPdv(targetPdvId, selectedMonth);
        setReceptoresPdv(data);
      })();
      return;
    }

    // Mode: ENTREGADO_DC
    setPuestoReceptor('Dermoconsejera');

    // Step A: Immediately set from effective assignment data if available
    const localDcName = opt?.nombreDc || opt?.distribution?.nombreDc || '';

    if (localDcName) {
      setNombreReceptor(localDcName);
    } else {
      // Clear immediately while fetching so previous store's name doesn't linger
      setNombreReceptor('');
    }

    // Step B: Fetch from DB — check if DB has a specifically assigned DC for this month
    void (async () => {
      try {
        const data = await obtenerReceptoresPdv(targetPdvId, selectedMonth);
        setReceptoresPdv(data);

        // Find if there is a DC explicitly assigned to THIS store for this month
        const assignedInDb = data.find((r) => (r as any).esAsignadoPdv && r.puesto !== 'SUPERVISOR');
        if (assignedInDb?.nombreCompleto) {
          setNombreReceptor(assignedInDb.nombreCompleto);
        } else if (!localDcName) {
          // Store has no assigned DC — keep field clean
          setNombreReceptor('');
        }
      } catch (err) {
        console.error('Error fetching receptores:', err);
      }
    })();
  }, [selectedDistribucionId, selectedMonth, modoEntrega]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTED: List of available DC names for the receptor combobox
  // ═══════════════════════════════════════════════════════════════════
  const availableDcOptions = useMemo(() => {
    const setNames = new Set<string>();

    // 1. The assigned DC for this PDV goes first
    const currentAssigned = selectedOption?.nombreDc || selectedDistribucion?.nombreDc;
    if (currentAssigned) {
      setNames.add(currentAssigned);
    }

    // 2. Receptors fetched from DB
    receptoresPdv.forEach((r) => {
      if (r.nombreCompleto && r.puesto !== 'SUPERVISOR') {
        setNames.add(r.nombreCompleto);
      }
    });

    // 3. Full active plantilla
    plantillaDermos.forEach((p) => {
      if (p.nombreCompleto) {
        setNames.add(p.nombreCompleto);
      }
    });

    // 4. Distribution receptor options
    if (selectedDistribucion?.receptorOptions) {
      selectedDistribucion.receptorOptions.forEach((ropt: any) => {
        if (ropt.nombre && ropt.scope !== 'SUPERVISOR' && ropt.scope !== 'POR_CUBRIR') {
          setNames.add(ropt.nombre);
        }
      });
    }

    // 5. DC names from all distributions
    if (materialesData?.distributions) {
      materialesData.distributions.forEach((d) => {
        if (d.nombreDc) setNames.add(d.nombreDc);
      });
    }

    return Array.from(setNames).sort((a, b) => a.localeCompare(b));
  }, [selectedOption?.nombreDc, selectedDistribucion, receptoresPdv, plantillaDermos, materialesData?.distributions]);

  const handleAcuseFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoAcuse(file);
      setFotoAcusePreview(URL.createObjectURL(file));
    }
  };

  const handleEntregaFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoEntrega(file);
      setFotoEntregaPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetPdvId = selectedOption?.pdvId || selectedDistribucion?.pdvId || selectedDistribucionId;

    if (!targetPdvId) {
      onError('Por favor selecciona el Punto de Venta / Sucursal a entregar.');
      return;
    }

    if (!nombreReceptor.trim()) {
      onError('Por favor ingresa el nombre de la persona que recibe el paquete.');
      return;
    }

    if (!fotoAcuse) {
      onError('La foto del acuse de recibo firmado es obligatoria.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upload photos directly to R2 Storage (exact same pipeline as Evidencias de Campo)
      const uploadedPhotos: FotoEvidencia[] = [];

      const acuseUploaded = await uploadFileDirectToR2(fotoAcuse, 'supervisor_evidencia');
      uploadedPhotos.push({
        originalKey: acuseUploaded.objectKey,
        sha256: acuseUploaded.sha256,
        url: `/api/storage/r2?key=${encodeURIComponent(acuseUploaded.objectKey)}`,
        size: acuseUploaded.size,
        contentType: acuseUploaded.contentType,
        capturedAt: new Date().toISOString(),
        orientation: 'portrait',
        label: '1. Acuse de recibo firmado',
      });

      if (fotoEntrega) {
        const entregaUploaded = await uploadFileDirectToR2(fotoEntrega, 'supervisor_evidencia');
        uploadedPhotos.push({
          originalKey: entregaUploaded.objectKey,
          sha256: entregaUploaded.sha256,
          url: `/api/storage/r2?key=${encodeURIComponent(entregaUploaded.objectKey)}`,
          size: entregaUploaded.size,
          contentType: entregaUploaded.contentType,
          capturedAt: new Date().toISOString(),
          orientation: 'portrait',
          label: '2. Foto de entrega en tienda',
        });
      }

      // 2. Primary Database Save (table: supervisor_evidencia)
      const evFormData = new FormData();
      evFormData.set('pdv_id', targetPdvId);
      evFormData.set('tipo_evidencia', 'ULTIMA_MILLA');
      evFormData.set('mes_entrega', selectedMonth || new Date().toISOString().slice(0, 7));
      evFormData.set('observaciones', observaciones.trim());
      evFormData.set('fotos_metadata', JSON.stringify(uploadedPhotos));
      evFormData.set(
        'checklist',
        JSON.stringify({
          modo_entrega: modoEntrega,
          nombre_receptor: nombreReceptor.trim(),
          puesto_receptor: puestoReceptor.trim(),
          detalles: quantities,
        })
      );

      const dbResult = await guardarSupervisorEvidencia({ ok: false, message: '' }, evFormData);

      if (!dbResult.ok) {
        throw new Error(dbResult.message || 'No fue posible guardar la evidencia en la base de datos.');
      }

      // 3. Optional background sync to materials module endpoint
      try {
        const offlineClientId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const payloadObj = {
          modo: 'REGISTRO_NUEVO',
          distribucion_id: selectedDistribucionId || 'virtual',
          pdv_id: targetPdvId,
          cuenta_cliente_id: selectedDistribucion?.cuentaClienteId || actor?.cuentaClienteId || '',
          supervisor_empleado_id: actor?.empleadoId || '',
          offline_client_id: offlineClientId,
          modo_entrega: modoEntrega,
          nombre_receptor: nombreReceptor.trim(),
          puesto_receptor: puestoReceptor.trim(),
          mes_operacion: selectedMonth,
          observaciones: observaciones.trim(),
          detalles: Object.entries(quantities).map(([distribucion_detalle_id, cantidad_real_recibida]) => ({
            distribucion_detalle_id,
            cantidad_real_recibida,
          })),
        };

        const syncFormData = new FormData();
        syncFormData.append('payload', JSON.stringify(payloadObj));
        syncFormData.append('acuse_firmado_files', fotoAcuse);
        syncFormData.append('evidencia_0', fotoAcuse);
        if (fotoEntrega) {
          syncFormData.append('evidencia_entrega_fisica_file', fotoEntrega);
          syncFormData.append('evidencia_1', fotoEntrega);
        } else {
          syncFormData.append('evidencia_entrega_fisica_file', fotoAcuse);
        }

        await fetch('/api/materiales/ultima-milla/sync', {
          method: 'POST',
          body: syncFormData,
        });
      } catch (syncErr) {
        console.warn('Sincronización secundaria de inventario (opcional):', syncErr);
      }

      const pdvNombre = selectedOption?.label || selectedDistribucion?.pdvNombre || 'el punto de venta seleccionado';
      onSuccess(`✅ Se ha registrado exitosamente la evidencia para el punto de venta: ${pdvNombre}.`);
      if (onCancel) onCancel();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al registrar la entrega.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pdvComboboxOptions: ComboboxOption[] = useMemo(() => {
    return pdvSelectOptions.map((opt) => ({
      id: opt.id,
      label: opt.label,
      sublabel: opt.cadena || undefined,
    }));
  }, [pdvSelectOptions]);

  const dcComboboxOptions: ComboboxOption[] = useMemo(() => {
    return availableDcOptions.map((dcName) => ({
      id: dcName,
      label: dcName,
    }));
  }, [availableDcOptions, selectedDistribucion?.nombreDc]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">📦 Registrar Entrega de Última Milla (Dispersión)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Selecciona el PDV, el modo de entrega (resguardo o Dermoconsejera) y sube las evidencias fotográficas.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* PASO 1 & PASO 2: PDV Y ESTADO/MODO DE ENTREGA */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1. Punto de Venta / Sucursal (Combobox Interactivo Fluido) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">1. Punto de Venta / Sucursal *</label>
          <SearchableCombobox
            options={pdvComboboxOptions}
            value={selectedDistribucionId}
            onChange={(id) => handleDistribucionChange(id)}
            placeholder="Escribe o selecciona el Punto de Venta..."
            required
          />
        </div>

        {/* 2. Estado / Modo de Entrega */}
        <div>
          <label className="block text-xs font-bold text-slate-700">2. Estado / Modo de Entrega *</label>
          <select
            value={modoEntrega}
            onChange={(e) => setModoEntrega(e.target.value as 'ENTREGADO_DC' | 'POR_CUBRIR')}
            className="mt-1.5 w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none"
          >
            <option value="ENTREGADO_DC">✅ Entregado a la Dermoconsejera</option>
            <option value="POR_CUBRIR">📦 En Resguardo en Tienda (Falta DC)</option>
          </select>
        </div>
      </div>

      {/* PASO 3 & PASO 4: DATOS DEL RECEPTOR AUTO-COMPLETADOS DINÁMICAMENTE */}
      <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
        {/* 3. Puesto / Cargo */}
        <div>
          <label className="block text-xs font-bold text-slate-700">3. Puesto / Cargo *</label>
          <select
            value={puestoReceptor}
            onChange={(e) => setPuestoReceptor(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none"
          >
            <option value="Dermoconsejera">Dermoconsejera</option>
            <option value="Supervisor">Supervisor</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            {modoEntrega === 'POR_CUBRIR'
              ? '⚡ Seleccionado automáticamente como "Supervisor" por resguardo.'
              : '⚡ Seleccionado automáticamente como "Dermoconsejera".'}
          </p>
        </div>

        {/* 4. Nombre de quien recibe */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            4. Nombre de quien recibe *
          </label>

          {modoEntrega === 'POR_CUBRIR' ? (
            <input
              type="text"
              value={nombreReceptor}
              onChange={(e) => setNombreReceptor(e.target.value)}
              placeholder={actor?.nombreCompleto || 'Jacqueline (Supervisor)'}
              required
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none"
            />
          ) : (
            <SearchableCombobox
              options={dcComboboxOptions}
              value={nombreReceptor}
              onChange={(id, opt) => setNombreReceptor(opt?.label || id)}
              allowCustomText
              onCustomTextChange={(text) => setNombreReceptor(text)}
              placeholder="Buscar o escribir nombre de la Dermoconsejera..."
              helperText={
                nombreReceptor
                  ? `⭐️ Dermoconsejera asignada a este PDV. Puedes buscar o seleccionar a cualquier otra de la plantilla.`
                  : 'ℹ️ Tienda sin Dermoconsejera asignada. Busca o selecciona una receptora de la plantilla activa.'
              }
            />
          )}
        </div>
      </div>

      {/* SKUs esperados en el paquete */}
      {selectedDistribucion && selectedDistribucion.detalles.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-sky-900">
            Detalle del Paquete ({selectedDistribucion.pdvNombre})
          </h3>
          <div className="space-y-2">
            {selectedDistribucion.detalles.map((det) => (
              <div key={det.id} className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-xs">
                <div>
                  <p className="text-xs font-bold text-slate-900">{det.materialNombre}</p>
                  <p className="text-[11px] text-slate-500">Esperado: {det.cantidadEnviada} pzas</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Recibido:</span>
                  <input
                    type="number"
                    min="0"
                    value={quantities[det.id] ?? det.cantidadEnviada}
                    onChange={(e) =>
                      setQuantities({ ...quantities, [det.id]: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-center text-xs font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fotografías requeridas de última milla */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Fotografías Requeridas (Última Milla)
          </h3>
          <p className="text-xs text-slate-500">
            Puedes tomar la foto con la cámara del celular o seleccionar de tu galería.
          </p>
        </div>

        {/* Hidden inputs for Acuse */}
        <input
          ref={cameraAcuseRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleAcuseFileSelect}
          className="hidden"
        />
        <input
          ref={galleryAcuseRef}
          type="file"
          accept="image/*"
          onChange={handleAcuseFileSelect}
          className="hidden"
        />

        {/* Hidden inputs for Entrega */}
        <input
          ref={cameraEntregaRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleEntregaFileSelect}
          className="hidden"
        />
        <input
          ref={galleryEntregaRef}
          type="file"
          accept="image/*"
          onChange={handleEntregaFileSelect}
          className="hidden"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Foto 1: Acuse */}
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">1. Acuse de recibo firmado *</span>
              {fotoAcuse && <span className="text-xs font-bold text-emerald-600">✓ Cargada</span>}
            </div>

            {fotoAcusePreview ? (
              <div className="relative aspect-3/4 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoAcusePreview} alt="Acuse preview" className="h-full w-full object-cover" />
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Formato vertical de la hoja o remisión firmada.</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cameraAcuseRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100"
              >
                📷 Cámara
              </button>
              <button
                type="button"
                onClick={() => galleryAcuseRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                🖼️ Galería
              </button>
            </div>
          </div>

          {/* Foto 2: Entrega en Tienda */}
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">2. Foto de entrega / colaboradora</span>
              {fotoEntrega && <span className="text-xs font-bold text-emerald-600">✓ Cargada</span>}
            </div>

            {fotoEntregaPreview ? (
              <div className="relative aspect-3/4 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoEntregaPreview} alt="Entrega preview" className="h-full w-full object-cover" />
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Formato vertical entregando la caja o paquete en PDV.</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cameraEntregaRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100"
              >
                📷 Cámara
              </button>
              <button
                type="button"
                onClick={() => galleryEntregaRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                🖼️ Galería
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div>
        <label className="block text-xs font-bold text-slate-700">Observaciones / Notas de Entrega (Opcional)</label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Escribe incidencias, paquete sellado, observaciones del estado de la caja, etc."
          className="mt-1.5 w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none"
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-700 px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-sky-800 disabled:opacity-50"
        >
          {isSubmitting ? 'Guardando entrega...' : '🚀 Registrar Entrega de Última Milla'}
        </button>
      </div>
    </form>
  );
}
