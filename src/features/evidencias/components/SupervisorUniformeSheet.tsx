'use client';

import { useState, useEffect, useTransition } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { convertHeifToJpeg } from '@/lib/storage/clientImageCompression';
import {
  obtenerPdvsSupervisor,
  obtenerReceptoresPdv,
  guardarSupervisorEvidencia,
  type PersonaReceptora,
} from '../actions';
import type { FotoEvidencia } from '../types';

async function comprimirImagenCliente(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<File> {
  const normalizedFile = await convertHeifToJpeg(file);

  if (!normalizedFile.type.startsWith('image/')) {
    return normalizedFile;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(normalizedFile);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(normalizedFile);
              return;
            }
            const compressedFile = new File(
              [blob],
              normalizedFile.name.replace(/\.(heic|heif|hif)$/i, '') + '.jpg',
              {
                type: 'image/jpeg',
                lastModified: Date.now(),
              }
            );
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(normalizedFile);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(normalizedFile);
    reader.readAsDataURL(normalizedFile);
  });
}

async function uploadFileWithRetry(
  file: File,
  modulo: string,
  retries = 3,
  delayMs = 1500
): Promise<any> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('modulo', modulo);

      const response = await fetch('/api/storage/r2', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error en la subida (Status ${response.status})`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Intento ${attempt} de subida a R2 fallido:`, error);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

interface SupervisorUniformeSheetProps {
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

export function SupervisorUniformeSheet({
  open,
  onClose,
  onSuccess,
  onError,
  inline = false,
}: SupervisorUniformeSheetProps) {
  const offline = useOfflineSync();
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);

  const [pdvs, setPdvs] = useState<
    Array<{ id: string; nombre: string; claveBtl: string; cadena: string }>
  >([]);
  const [selectedPdvId, setSelectedPdvId] = useState<string>('');
  const [pdvQuery, setPdvQuery] = useState('');

  const [receptores, setReceptores] = useState<PersonaReceptora[]>([]);
  const [selectedReceptorId, setSelectedReceptorId] = useState<string>('');
  const [receptorQuery, setReceptorQuery] = useState('');

  const [observaciones, setObservaciones] = useState<string>('');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  const filteredPdvs = pdvs.filter((p) =>
    `${p.nombre} ${p.claveBtl} ${p.cadena}`.toLowerCase().includes(pdvQuery.toLowerCase())
  );

  const filteredReceptores = receptores.filter((r) =>
    r.nombreCompleto.toLowerCase().includes(receptorQuery.toLowerCase())
  );

  // Dos fotos requeridas: acuse firmado y persona recibiendo
  const [slots, setSlots] = useState<PhotoSlot[]>([
    {
      id: 'acuse',
      label: '1. Acuse de recibo firmado',
      forcedOrientation: 'portrait',
      topAlertMessage:
        'La fotografía del Acuse de recibo debe estar COMPLETA. No se aceptan imágenes recortadas.',
      file: null,
    },
    {
      id: 'recibido',
      label: '2. Foto de quien recibe el uniforme',
      forcedOrientation: 'portrait',
      topAlertMessage: 'Captura una fotografía de la persona sosteniendo el uniforme recibido.',
      file: null,
    },
  ]);

  // Cargar puntos de venta al abrir y limpiar al cerrar
  useEffect(() => {
    if (open) {
      void (async () => {
        const data = await obtenerPdvsSupervisor();
        setPdvs(data);
        if (data.length > 0) {
          setSelectedPdvId(data[0].id);
        }
      })();
    } else {
      setPdvQuery('');
      setReceptorQuery('');
      setObservaciones('');
      setSlots((prev) => prev.map((s) => ({ ...s, file: null })));
    }
  }, [open]);

  // Cargar receptores elegibles al cambiar el punto de venta
  useEffect(() => {
    if (selectedPdvId) {
      void (async () => {
        const data = await obtenerReceptoresPdv(selectedPdvId);
        setReceptores(data);
        if (data.length > 0) {
          setSelectedReceptorId(data[0].id);
        } else {
          setSelectedReceptorId('');
        }
      })();
    } else {
      setReceptores([]);
      setSelectedReceptorId('');
    }
    setReceptorQuery('');
  }, [selectedPdvId]);

  // Seleccionar automáticamente el primer elemento si el filtro reduce las opciones
  useEffect(() => {
    if (pdvQuery && filteredPdvs.length > 0 && !filteredPdvs.some((p) => p.id === selectedPdvId)) {
      setSelectedPdvId(filteredPdvs[0].id);
    }
  }, [pdvQuery, filteredPdvs, selectedPdvId]);

  useEffect(() => {
    if (
      receptorQuery &&
      filteredReceptores.length > 0 &&
      !filteredReceptores.some((r) => r.id === selectedReceptorId)
    ) {
      setSelectedReceptorId(filteredReceptores[0].id);
    }
  }, [receptorQuery, filteredReceptores, selectedReceptorId]);

  const handleCapturePhoto = async (file: File) => {
    let processed = file;
    try {
      processed = await convertHeifToJpeg(file);
    } catch (err) {
      console.error('Error convirtiendo foto de camara:', err);
    }
    setSlots((prev) => prev.map((s) => (s.id === activeSlotId ? { ...s, file: processed } : s)));
    setActiveSlotId(null);
  };

  const activeSlot = slots.find((s) => s.id === activeSlotId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPdvId) {
      onError('Por favor selecciona un punto de venta.');
      return;
    }

    if (!selectedReceptorId) {
      onError('Por favor selecciona a la persona que recibe el uniforme.');
      return;
    }

    // Validar fotos capturadas
    const missingPhotos = slots.filter((s) => !s.file);
    if (missingPhotos.length > 0) {
      onError(
        `Debes capturar todas las fotografías requeridas: ${missingPhotos.map((s) => s.label).join(', ')}.`
      );
      return;
    }

    if (!offline.isOnline) {
      onError('Debes estar en línea para registrar la entrega de uniformes.');
      return;
    }

    setIsUploading(true);

    try {
      // 1. Subir fotos a R2 (comprimiendo en el navegador y con reintentos para evitar fallos de red inestable)
      let uploadedPhotos: FotoEvidencia[];
      try {
        uploadedPhotos = await Promise.all(
          slots.map(async (slot) => {
            if (!slot.file) throw new Error(`Archivo faltante en slot: ${slot.label}`);

            let fileToUpload: File;
            try {
              fileToUpload = await comprimirImagenCliente(slot.file);
            } catch (err) {
              console.error('Error al comprimir:', err);
              fileToUpload = slot.file;
            }

            try {
              const uploaded = await uploadFileWithRetry(fileToUpload, 'supervisor_evidencia');
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
            } catch (err: any) {
              throw new Error(
                `Fallo al subir a la nube la foto "${slot.label}": ${err.message || 'Error de red'}`
              );
            }
          })
        );
      } catch (uploadErr: any) {
        throw new Error(uploadErr.message || 'Error durante la subida de fotos.');
      }

      // 2. Resolver los datos del receptor
      const receptorSelected = receptores.find((r) => r.id === selectedReceptorId);
      if (!receptorSelected) throw new Error('Receptor inválido o no encontrado.');

      // 3. Preparar payload para la Server Action
      const formData = new FormData();
      formData.set('pdv_id', selectedPdvId);
      formData.set('tipo_evidencia', 'ENTREGA_UNIFORMES');
      formData.set('observaciones', observaciones);
      formData.set('fotos_metadata', JSON.stringify(uploadedPhotos));

      const checklist = {
        persona_recibio_id: receptorSelected.id,
        persona_recibio_nombre: receptorSelected.nombreCompleto,
        persona_recibio_puesto: receptorSelected.puesto,
      };
      formData.set('checklist', JSON.stringify(checklist));

      startTransition(async () => {
        try {
          const result = await guardarSupervisorEvidencia({ ok: false, message: '' }, formData);
          setIsUploading(false);

          if (result.ok) {
            const pdvNombre =
              pdvs.find((p) => p.id === selectedPdvId)?.nombre || 'el punto de venta';
            onSuccess(
              `✅ Se ha registrado exitosamente la entrega de uniformes para el punto de venta: ${pdvNombre}.`
            );
            // Reset de formulario
            setSlots((prev) => prev.map((s) => ({ ...s, file: null })));
            setObservaciones('');
          } else {
            onError(`Error del servidor: ${result.message}`);
          }
        } catch (serverErr: any) {
          setIsUploading(false);
          onError(
            `Fallo de conexión al guardar: ${serverErr.message || 'Error de red del servidor'}`
          );
        }
      });
    } catch (error) {
      console.error('Error al guardar entrega de uniforme:', error);
      onError(
        error instanceof Error ? error.message : 'Error al procesar la entrega de uniformes.'
      );
      setIsUploading(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 px-4 py-3">
      {/* Selector de PDV */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pdv-select" className="text-sm font-semibold text-slate-700">
          Punto de venta (Sucursal)
        </label>
        <input
          type="text"
          placeholder="🔍 Escribe para buscar sucursal..."
          value={pdvQuery}
          onChange={(e) => setPdvQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none mb-1"
        />
        <select
          id="pdv-select"
          value={selectedPdvId}
          onChange={(e) => setSelectedPdvId(e.target.value)}
          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-lg font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
        >
          {pdvs.length === 0 ? (
            <option value="">Cargando puntos de venta...</option>
          ) : filteredPdvs.length === 0 ? (
            <option value="">No hay coincidencias con tu búsqueda</option>
          ) : (
            filteredPdvs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.cadena} - {p.nombre} ({p.claveBtl})
              </option>
            ))
          )}
        </select>
      </div>

      {/* Selector de Receptor */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="receptor-select" className="text-sm font-semibold text-slate-700">
          ¿Quién recibió el uniforme?
        </label>
        <input
          type="text"
          placeholder="🔍 Escribe para buscar dermo..."
          value={receptorQuery}
          onChange={(e) => setReceptorQuery(e.target.value)}
          disabled={!selectedPdvId}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none mb-1 disabled:opacity-50"
        />
        <select
          id="receptor-select"
          value={selectedReceptorId}
          onChange={(e) => setSelectedReceptorId(e.target.value)}
          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-lg font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
          disabled={!selectedPdvId}
        >
          {receptores.length === 0 ? (
            <option value="">No hay personal asignado en esta sucursal</option>
          ) : filteredReceptores.length === 0 ? (
            <option value="">No hay coincidencias con tu búsqueda</option>
          ) : (
            filteredReceptores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombreCompleto} ({r.puesto === 'SUPERVISOR' ? 'Supervisor' : 'DC'})
              </option>
            ))
          )}
        </select>
      </div>

      {/* Fotos de Evidencia */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700">Fotografías de evidencia</h3>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Por favor, asegúrate de tomar <strong>ambas fotos</strong> con el celular en{' '}
          <strong>posición vertical</strong>. Evita fotos horizontales para que luzcan completas en
          los reportes del coordinador.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 transition hover:bg-slate-100"
            >
              <span className="text-sm font-semibold text-slate-700 mb-2">{slot.label}</span>

              {slot.file ? (
                <div className="relative flex flex-col items-center gap-2">
                  <div className="h-40 w-28 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-black flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(slot.file)}
                      alt={slot.label}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSlotId(slot.id)}
                      className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      Cámara
                    </button>
                    <button
                      type="button"
                      onClick={() => document.getElementById(`gallery-input-${slot.id}`)?.click()}
                      className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                    >
                      Galería
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 items-center w-full px-2">
                  {/* Botón para Cámara */}
                  <button
                    type="button"
                    onClick={() => setActiveSlotId(slot.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-600 bg-indigo-50/20 px-3 py-2.5 text-sm font-bold text-indigo-600 transition hover:bg-indigo-50 active:scale-95"
                  >
                    <span className="text-base">📸</span>
                    <span>Usar Cámara</span>
                  </button>

                  {/* Botón para Galería */}
                  <button
                    type="button"
                    onClick={() => document.getElementById(`gallery-input-${slot.id}`)?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:scale-95"
                  >
                    <span className="text-base">🖼️</span>
                    <span>Cargar Galería</span>
                  </button>
                </div>
              )}

              {/* Input oculto para Galería */}
              <input
                type="file"
                id={`gallery-input-${slot.id}`}
                accept="image/*,.heic,.heif,.hif,image/heic,image/heif"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    let processed = file;
                    try {
                      processed = await convertHeifToJpeg(file);
                    } catch (err) {
                      console.error('Error convirtiendo foto de galeria:', err);
                    }
                    setSlots((prev) =>
                      prev.map((s) => (s.id === slot.id ? { ...s, file: processed } : s))
                    );
                  }
                  e.target.value = '';
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Campo de observaciones */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="observaciones" className="text-sm font-semibold text-slate-700">
          Observaciones (Opcional)
        </label>
        <textarea
          id="observaciones"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Ej. Tallas entregadas o comentarios sobre la firma del acuse..."
          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
          rows={3}
        />
      </div>

      {/* Botón de Enviar */}
      <Button
        type="submit"
        disabled={isUploading || isPending}
        className="w-full rounded-2xl py-4 text-lg font-bold shadow-md bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50"
      >
        {isUploading ? 'Subiendo evidencias a la nube...' : 'Registrar Entrega de Uniforme'}
      </Button>
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
          title="Registrar Entrega de Uniformes"
          description="Selecciona la sucursal, la persona receptora y toma evidencia de la entrega."
          initialSnap="expanded"
        >
          {formContent}
        </BottomSheet>
      )}

      {/* Cámara Nativa Dialog */}
      {activeSlot && (
        <NativeCameraSelfieDialog
          open={!!activeSlotId}
          title={activeSlot.label}
          description="Toma la foto cuidando que la orientación del dispositivo coincida con la requerida."
          facingMode="environment"
          captureLabel="Capturar fotografia"
          onClose={() => setActiveSlotId(null)}
          onCapture={async (file) => {
            handleCapturePhoto(file);
          }}
          forcedOrientation={activeSlot.forcedOrientation}
          topAlertMessage={activeSlot.topAlertMessage}
        />
      )}
    </>
  );
}