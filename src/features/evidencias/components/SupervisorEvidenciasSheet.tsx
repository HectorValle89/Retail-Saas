'use client';

import { useState, useEffect, useTransition, useRef, useMemo } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog';
import { uploadFileDirectToR2 } from '@/lib/storage/directR2Client';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { compressImageForUpload } from '@/lib/storage/clientImageCompression';
import {
  obtenerPdvsSupervisor,
  obtenerTodosPdvsConDcVigente,
  guardarSupervisorEvidencia,
  type EvidenciaActionState,
} from '../actions';
import {
  SearchableCombobox,
  type ComboboxOption,
} from '@/features/materiales/components/SearchableCombobox';
import type { TipoEvidencia, FotoEvidencia } from '../types';

const MESES_OPCIONES = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

interface SupervisorEvidenciasSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  inline?: boolean;
}

interface PhotoSlot {
  id: string;
  label: string;
  forcedOrientation: 'portrait' | 'landscape';
  topAlertMessage?: string;
  file: File | null;
}

export function SupervisorEvidenciasSheet({
  open,
  onClose,
  onSuccess,
  onError,
  inline = false,
}: SupervisorEvidenciasSheetProps) {
  const offline = useOfflineSync();
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);

  const [pdvs, setPdvs] = useState<
    Array<{ id: string; nombre: string; claveBtl: string; cadena: string; nombreDc?: string }>
  >([]);
  const [selectedPdvId, setSelectedPdvId] = useState<string>('');
  const [tipoEvidencia, setTipoEvidencia] = useState<TipoEvidencia>('MATERIAL_POP');
  const [observaciones, setObservaciones] = useState<string>('');

  // Mes de entrega state (default to current month YYYY-MM)
  const [mesEntrega, setMesEntrega] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  });

  // Gallery input reference and target slot
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [galleryTargetSlotId, setGalleryTargetSlotId] = useState<string | null>(null);

  // Vanity Bag block selection
  const [vanityBlock, setVanityBlock] = useState<'BLOQUE_1' | 'BLOQUE_2'>('BLOQUE_1');

  // Checklist states
  const [popGoodState, setPopGoodState] = useState<boolean | null>(null);
  const [popCorrectPlace, setPopCorrectPlace] = useState<boolean | null>(null);

  const [spCajas, setSpCajas] = useState<boolean>(false);
  const [spVisible, setSpVisible] = useState<boolean>(false);
  const [spPrecios, setSpPrecios] = useState<boolean>(false);
  const [spPop, setSpPop] = useState<boolean>(false);

  // Photo slots state
  const [slots, setSlots] = useState<PhotoSlot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  // Load all active PDVs (permite elegir cualquier PDV como en Última Milla)
  useEffect(() => {
    if (open) {
      void (async () => {
        try {
          const data = await obtenerTodosPdvsConDcVigente(mesEntrega);
          if (data && data.length > 0) {
            setPdvs(data);
            if (!selectedPdvId || !data.some((p) => p.id === selectedPdvId)) {
              setSelectedPdvId(data[0].id);
            }
            return;
          }
        } catch (e) {
          console.error('Error cargando PDVs con DC vigente:', e);
        }
        const fallback = await obtenerPdvsSupervisor();
        setPdvs(fallback);
        if (fallback.length > 0 && (!selectedPdvId || !fallback.some((p) => p.id === selectedPdvId))) {
          setSelectedPdvId(fallback[0].id);
        }
      })();
    }
  }, [open, mesEntrega]);

  const pdvComboboxOptions: ComboboxOption[] = useMemo(() => {
    return pdvs.map((p) => ({
      id: p.id,
      label: p.nombre,
      sublabel: [p.cadena, p.nombreDc ? `DC: ${p.nombreDc}` : null].filter(Boolean).join(' • ') || undefined,
    }));
  }, [pdvs]);

  // Dynamically update photo slots based on selected TipoEvidencia / Vanity Block
  useEffect(() => {
    let newSlots: PhotoSlot[] = [];

    switch (tipoEvidencia) {
      case 'MATERIAL_POP':
        newSlots = [
          {
            id: 'acuse',
            label: '1. Acuse de recibo firmado',
            forcedOrientation: 'portrait',
            topAlertMessage:
              'La fotografía del Acuse de recibo debe estar COMPLETA. No se aceptan imágenes recortadas.',
            file: null,
          },
          {
            id: 'pop_cerca',
            label: '2. De cerca - Display/POP colocado',
            forcedOrientation: 'landscape',
            file: null,
          },
          {
            id: 'pop_lejos',
            label: '3. De lejos - Lineal completo Isdin',
            forcedOrientation: 'landscape',
            file: null,
          },
        ];
        break;

      case 'CAMPANA_ESTACIONAL':
        newSlots = [
          {
            id: 'acuse',
            label: '1. Acuse de recibo firmado',
            forcedOrientation: 'portrait',
            topAlertMessage:
              'La fotografía del Acuse de recibo debe estar COMPLETA. No se aceptan imágenes recortadas.',
            file: null,
          },
          {
            id: 'dc_cuerpo_completo',
            label: '2. DC de cuerpo completo en piso con accesorio',
            forcedOrientation: 'landscape',
            file: null,
          },
        ];
        break;

      case 'MALETA_VANITY':
        if (vanityBlock === 'BLOQUE_1') {
          newSlots = [
            {
              id: 'vanity_abierta',
              label: '1. Maleta Vanity abierta con todos los testers',
              forcedOrientation: 'landscape',
              file: null,
            },
            {
              id: 'acuse',
              label: '2. Acuse de recibo firmado',
              forcedOrientation: 'portrait',
              topAlertMessage:
                'La fotografía del Acuse de recibo debe estar COMPLETA. No se aceptan imágenes recortadas.',
              file: null,
            },
            {
              id: 'dc_silla',
              label: '3. DC con uniforme completo y silla al lado',
              forcedOrientation: 'landscape',
              file: null,
            },
          ];
        } else {
          newSlots = [
            {
              id: 'vanity_cerrada',
              label: '1. Maleta Vanity cerrada y acomodada para resguardo',
              forcedOrientation: 'landscape',
              file: null,
            },
            {
              id: 'foto_grupal',
              label: '2. Foto grupal - DC con la maleta al cierre',
              forcedOrientation: 'landscape',
              file: null,
            },
          ];
        }
        break;

      case 'ADOPTADO_SAN_PABLO':
        newSlots = [
          {
            id: 'acuse',
            label: '1. Acuse de recibo firmado',
            forcedOrientation: 'portrait',
            topAlertMessage:
              'La fotografía del Acuse de recibo debe estar COMPLETA. No se aceptan imágenes recortadas.',
            file: null,
          },
          {
            id: 'mini_botiquines',
            label: '2. Mini botiquines acomodados por supervisor',
            forcedOrientation: 'landscape',
            file: null,
          },
          {
            id: 'botiquin_mano',
            label: '3. De cerca - Mini botiquín en mano/mostrador',
            forcedOrientation: 'landscape',
            file: null,
          },
        ];
        break;

      case 'EVENTO_ESPECIAL':
        newSlots = [
          {
            id: 'exhibicion_botadero',
            label: '1. Exhibición adicional / Botadero completo',
            forcedOrientation: 'landscape',
            file: null,
          },
          {
            id: 'exhibicion_pop',
            label: '2. De cerca - Material POP de la exhibición',
            forcedOrientation: 'landscape',
            file: null,
          },
          {
            id: 'exhibicion_vista_general',
            label: '3. De lejos - Vista general de la tienda',
            forcedOrientation: 'landscape',
            file: null,
          },
        ];
        break;

      case 'PRODUCTO_MES_LIVERPOOL':
        newSlots = [
          {
            id: 'lista_asistencia',
            label: '1. Registro/Lista de asistencia firmada por DCs',
            forcedOrientation: 'portrait',
            topAlertMessage:
              'La fotografía del registro de asistencia debe estar COMPLETA. No se aceptan imágenes recortadas.',
            file: null,
          },
          {
            id: 'formador_explicando',
            label: '2. De cerca - Formador Isdin explicando producto',
            forcedOrientation: 'landscape',
            file: null,
          },
          {
            id: 'grupo_participantes',
            label: '3. Foto grupal - Participantes con el producto estrella',
            forcedOrientation: 'landscape',
            file: null,
          },
        ];
        break;

      case 'IMPLEMENTACION':
        newSlots = [
          {
            id: 'foto_implementacion',
            label: '1. Fotografía de Implementación en PDV',
            forcedOrientation: 'landscape',
            file: null,
          },
        ];
        break;
    }

    setSlots(newSlots);
  }, [tipoEvidencia, vanityBlock]);

  const handleCapturePhoto = async (file: File) => {
    let processed = file;
    try {
      processed = await compressImageForUpload(file, {
        maxSizeMB: 0.25,
        maxWidthOrHeight: 1400,
        fileType: 'image/jpeg',
      });
    } catch (err) {
      console.error('Error procesando foto tomada:', err);
    }
    setSlots((prev) => prev.map((s) => (s.id === activeSlotId ? { ...s, file: processed } : s)));
    setActiveSlotId(null);
  };

  const handleOpenGallery = (slotId: string) => {
    setGalleryTargetSlotId(slotId);
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
      galleryInputRef.current.click();
    }
  };

  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !galleryTargetSlotId) return;

    try {
      const processed = await compressImageForUpload(file, {
        maxSizeMB: 0.25,
        maxWidthOrHeight: 1400,
        fileType: 'image/jpeg',
      });
      setSlots((prev) =>
        prev.map((s) => (s.id === galleryTargetSlotId ? { ...s, file: processed } : s))
      );
    } catch (err) {
      console.error('Error al procesar imagen de galería:', err);
      onError('No se pudo procesar la imagen seleccionada de la galería.');
    } finally {
      setGalleryTargetSlotId(null);
      if (e.target) e.target.value = '';
    }
  };

  const activeSlot = slots.find((s) => s.id === activeSlotId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPdvId) {
      onError('Por favor selecciona un PDV (sucursal).');
      return;
    }

    // Validate all photo slots are captured
    const missingPhotos = slots.filter((s) => !s.file);
    if (missingPhotos.length > 0) {
      onError(
        `Debes capturar todas las fotografías requeridas: ${missingPhotos.map((s) => s.label).join(', ')}.`
      );
      return;
    }

    if (tipoEvidencia === 'IMPLEMENTACION' && !observaciones.trim()) {
      onError('Debes agregar un comentario describiendo la implementación.');
      return;
    }

    if (!offline.isOnline) {
      onError('Debes estar en línea para subir evidencias y guardarlas en la base de datos.');
      return;
    }

    setIsUploading(true);

    try {
      // 1. Upload files directly to R2
      const uploadedPhotos = await Promise.all(
        slots.map(async (slot) => {
          if (!slot.file) throw new Error(`Archivo faltante en slot: ${slot.label}`);
          const uploaded = await uploadFileDirectToR2(slot.file, 'supervisor_evidencia');
          return {
            originalKey: uploaded.objectKey,
            sha256: uploaded.sha256,
            url: `/api/storage/r2?key=${encodeURIComponent(uploaded.objectKey)}`,
            size: uploaded.size,
            contentType: uploaded.contentType,
            capturedAt: new Date().toISOString(),
            orientation: slot.forcedOrientation,
            label: slot.label,
          } satisfies FotoEvidencia;
        })
      );

      // 2. Prepare payload
      const formData = new FormData();
      formData.set('pdv_id', selectedPdvId);
      formData.set('tipo_evidencia', tipoEvidencia);
      formData.set('mes_entrega', mesEntrega);
      formData.set('observaciones', observaciones);
      formData.set('fotos_metadata', JSON.stringify(uploadedPhotos));

      // Build checklist metadata
      const checklist: Record<string, any> = {};
      checklist.mes_entrega = mesEntrega;
      if (tipoEvidencia === 'MATERIAL_POP') {
        checklist.llegado_buen_estado = popGoodState;
        checklist.colocado_correcto = popCorrectPlace;
      } else if (tipoEvidencia === 'MALETA_VANITY') {
        checklist.bloque_evento = vanityBlock;
      } else if (tipoEvidencia === 'ADOPTADO_SAN_PABLO') {
        checklist.botiquin_zona_cajas = spCajas;
        checklist.producto_visible = spVisible;
        checklist.precios_correctos = spPrecios;
        checklist.material_pop_visible = spPop;
      }
      formData.set('checklist', JSON.stringify(checklist));

      // 3. Submit
      startTransition(() => {
        void (async () => {
          const res: EvidenciaActionState = await guardarSupervisorEvidencia(
            { ok: false, message: '' },
            formData
          );
          setIsUploading(false);
          if (res.ok) {
            const pdvNombre =
              pdvs.find((p) => p.id === selectedPdvId)?.nombre || 'el punto de venta';
            onSuccess(
              `✅ Se ha registrado exitosamente la evidencia de campo para el punto de venta: ${pdvNombre}.`
            );
            // Reset form
            setObservaciones('');
            setPopGoodState(null);
            setPopCorrectPlace(null);
            setSpCajas(false);
            setSpVisible(false);
            setSpPrecios(false);
            setSpPop(false);
            setSlots((prev) => prev.map((s) => ({ ...s, file: null })));
          } else {
            onError(res.message);
          }
        })();
      });
    } catch (err: any) {
      console.error('Error al subir evidencias:', err);
      onError(
        err?.message || 'Error técnico al subir las imágenes a la nube. Por favor reintenta.'
      );
      setIsUploading(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4 px-1 sm:px-2 pb-6 pt-1">
      {/* Input oculto para carga desde Galería */}
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp"
        onChange={handleGalleryFileSelect}
        className="hidden"
      />

      {!offline.isOnline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 leading-4">
          ⚠️ <strong>Sin conexión:</strong> Requiere internet para subir las fotografías a la nube.
        </div>
      )}

      {/* Fila 1: Período / Mes y Tipo de Evidencia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700">Período / Mes</label>
          <select
            value={mesEntrega}
            onChange={(e) => setMesEntrega(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition shadow-2xs"
            disabled={isUploading || isPending}
          >
            {MESES_OPCIONES.map((m) => {
              const year = new Date().getFullYear();
              const val = `${year}-${m.value}`;
              return (
                <option key={m.value} value={val}>
                  {m.label} {year}
                </option>
              );
            })}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700">Tipo de Evento / Evidencia</label>
          <select
            value={tipoEvidencia}
            onChange={(e) => setTipoEvidencia(e.target.value as TipoEvidencia)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition shadow-2xs"
            disabled={isUploading || isPending}
          >
            <option value="MATERIAL_POP">1. Entrega Displays y POP de Temporada</option>
            <option value="CAMPANA_ESTACIONAL">2. Campaña Estacional (Cáncer de Mama)</option>
            <option value="MALETA_VANITY">3. Evento Maleta Vanity</option>
            <option value="ADOPTADO_SAN_PABLO">4. Adoptado Farmacia San Pablo</option>
            <option value="EVENTO_ESPECIAL">5. Exhibición Adicional y Botaderos</option>
            <option value="PRODUCTO_MES_LIVERPOOL">6. Capacitación / Evento Formación</option>
            <option value="IMPLEMENTACION">7. Evidencia Implementación</option>
          </select>
        </div>
      </div>

      {/* Fila 2: Selector de PDV con SearchableCombobox (Estilo Última Milla) */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-700">Punto de Venta / Sucursal *</label>
        <SearchableCombobox
          options={pdvComboboxOptions}
          value={selectedPdvId}
          onChange={(id) => setSelectedPdvId(id)}
          placeholder="Escribe o selecciona el Punto de Venta..."
          disabled={isUploading || isPending}
          required
        />
      </div>

      {/* Condicionales por Tipo de Evidencia */}
      {tipoEvidencia === 'MALETA_VANITY' && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-1.5">
          <label className="text-xs font-bold text-slate-900 block">Bloque de la Jornada</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVanityBlock('BLOQUE_1')}
              className={`py-2 rounded-lg font-bold text-xs transition ${
                vanityBlock === 'BLOQUE_1'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
              disabled={isUploading || isPending}
            >
              Inicio (11:00 AM)
            </button>
            <button
              type="button"
              onClick={() => setVanityBlock('BLOQUE_2')}
              className={`py-2 rounded-lg font-bold text-xs transition ${
                vanityBlock === 'BLOQUE_2'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
              disabled={isUploading || isPending}
            >
              Cierre (6:00 PM)
            </button>
          </div>
        </div>
      )}

      {tipoEvidencia === 'MATERIAL_POP' && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Checklist Material POP</h4>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
            <p className="text-xs font-medium text-slate-700">¿El material llegó en buen estado?</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPopGoodState(true)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition ${
                  popGoodState === true
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Sí, buen estado
              </button>
              <button
                type="button"
                onClick={() => setPopGoodState(false)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition ${
                  popGoodState === false
                    ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                No, incidencias
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-700">¿Está colocado correctamente?</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPopCorrectPlace(true)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition ${
                  popCorrectPlace === true
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Sí, correcto
              </button>
              <button
                type="button"
                onClick={() => setPopCorrectPlace(false)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition ${
                  popCorrectPlace === false
                    ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                No colocado
              </button>
            </div>
          </div>
        </div>
      )}

      {tipoEvidencia === 'ADOPTADO_SAN_PABLO' && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Checklist Adoptado San Pablo</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={spCajas}
                onChange={(e) => setSpCajas(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700">Botiquín en zona cajas</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={spVisible}
                onChange={(e) => setSpVisible(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700">Producto visible</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={spPrecios}
                onChange={(e) => setSpPrecios(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700">Precios correctos</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={spPop}
                onChange={(e) => setSpPop(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700">Material POP visible</span>
            </label>
          </div>
        </div>
      )}

      {/* Fotografías requeridas compactas */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Fotografías Requeridas ({slots.filter((s) => s.file).length}/{slots.length})
          </label>
          <span className="text-[11px] font-medium text-slate-400">Cámara o Galería</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-left transition gap-2 ${
                slot.file
                  ? 'border-emerald-200/90 bg-emerald-50/50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    slot.file
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                  }`}
                >
                  {slot.file ? '✓' : '📸'}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{slot.label}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {slot.forcedOrientation === 'portrait' ? 'Vertical' : 'Horizontal'}
                    {slot.file && (
                      <span className="text-emerald-700 font-semibold ml-1.5">
                        • Listo ({Math.round(slot.file.size / 1024)} KB)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveSlotId(slot.id)}
                  disabled={isUploading || isPending}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition flex items-center gap-1 active:scale-95"
                >
                  📸 <span className="hidden sm:inline">{slot.file ? 'Cambiar' : 'Cámara'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenGallery(slot.id)}
                  disabled={isUploading || isPending}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center gap-1 active:scale-95"
                >
                  🖼️ <span className="hidden sm:inline">Galería</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observaciones / Comentario */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-700">
          {tipoEvidencia === 'IMPLEMENTACION'
            ? 'Comentario de la Implementación *'
            : 'Observaciones / Notas de campo (Opcional)'}
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder={
            tipoEvidencia === 'IMPLEMENTACION'
              ? 'Escribe los detalles o comentarios de la implementación en PDV...'
              : 'Escribe comentarios sobre las evidencias tomadas, incidencias, etc.'
          }
          required={tipoEvidencia === 'IMPLEMENTACION'}
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition resize-none shadow-2xs"
          disabled={isUploading || isPending}
        />
      </div>

      {/* Botón Guardar */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs pt-1.5 pb-2">
        <Button
          type="submit"
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-100 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition flex items-center justify-center gap-2"
          disabled={
            isUploading ||
            isPending ||
            !selectedPdvId ||
            slots.some((s) => !s.file) ||
            (tipoEvidencia === 'IMPLEMENTACION' && !observaciones.trim()) ||
            !offline.isOnline
          }
          isLoading={isUploading || isPending}
        >
          {isUploading ? 'Subiendo evidencias...' : 'Guardar y Subir Evidencias'}
        </Button>
      </div>
    </form>
  );

  return (
    <>
      {inline ? (
        formContent
      ) : (
        <BottomSheet
          open={open}
          onClose={onClose}
          title="Subir Evidencias de Campo"
          description="Registra evidencias fotográficas del PDV categorizadas por tipo."
          initialSnap="expanded"
        >
          {formContent}
        </BottomSheet>
      )}

      {/* Camera Dialog */}
      {activeSlot && (
        <NativeCameraSelfieDialog
          open={activeSlotId !== null}
          title={activeSlot.label}
          description="Toma la foto cuidando que la orientación del dispositivo coincida con la requerida."
          facingMode="environment"
          captureLabel="Capturar fotografia"
          forcedOrientation={activeSlot.forcedOrientation}
          topAlertMessage={activeSlot.topAlertMessage}
          onClose={() => setActiveSlotId(null)}
          onCapture={async (file) => {
            handleCapturePhoto(file);
          }}
        />
      )}
    </>
  );
}