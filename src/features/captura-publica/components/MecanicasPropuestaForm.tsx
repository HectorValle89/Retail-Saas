'use client';

import { useActionState, useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { MecanicasPublicasData } from '../services/mecanicasService';
import {
  registrarPropuestaMecanica,
  type MecanicasActionState,
} from '../services/mecanicasActions';

interface MecanicasPropuestaFormProps {
  slug: string;
  data: MecanicasPublicasData;
}

const INITIAL_STATE: MecanicasActionState = {
  ok: false,
  message: '',
};

interface PrendaRow {
  id: string;
  prenda: string;
  genero: string;
  talla: string;
  cantidad: number;
}

export function MecanicasPropuestaForm({ slug, data }: MecanicasPropuestaFormProps) {
  const [state, formAction, pending] = useActionState(
    registrarPropuestaMecanica.bind(null, slug),
    INITIAL_STATE
  );

  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [selectedCiudad, setSelectedCiudad] = useState('');
  const [recibeNombre, setRecibeNombre] = useState('');
  const [direccionEnvio, setDireccionEnvio] = useState('');
  const [reciboEnPersona, setReciboEnPersona] = useState(false);
  
  // Rastrear si el usuario modificó manualmente el campo "Quién recibe"
  const [isRecibeEditedManually, setIsRecibeEditedManually] = useState(false);

  // Resetear recibo en persona si cambia la ciudad y no es CDMX
  useEffect(() => {
    if (selectedCiudad !== 'CIUDAD DE MÉXICO') {
      setReciboEnPersona(false);
    }
  }, [selectedCiudad]);

  const [rows, setRows] = useState<PrendaRow[]>([
    { id: 'initial-row', prenda: 'Filipina blanca', genero: 'Dama', talla: 'M', cantidad: 1 },
  ]);

  // Sincronizar el nombre del supervisor con el destinatario por defecto
  useEffect(() => {
    if (!isRecibeEditedManually) {
      setRecibeNombre(selectedSupervisor);
    }
  }, [selectedSupervisor, isRecibeEditedManually]);

  // Si no cargó bien el link
  if (!data.ok) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card className="border-red-200 bg-red-50 p-6 text-red-950 shadow-md rounded-[20px]">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-sm font-semibold font-sans">Enlace no disponible</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed font-sans text-red-800">
            {data.message ?? 'No fue posible cargar este formulario.'}
          </p>
        </Card>
      </div>
    );
  }

  // Opciones de supervisores para el Select (todos seleccionables)
  const supervisorOptions = useMemo(() => {
    return [
      { value: '', label: 'Selecciona tu nombre...' },
      ...data.supervisoresOficiales.map((sup) => ({
        value: sup,
        label: sup,
      })),
    ];
  }, [data.supervisoresOficiales]);

  // Opciones de ciudades para el Select
  const ciudadOptions = useMemo(() => {
    return [
      { value: '', label: 'Elige la ciudad de destino...' },
      ...data.ciudades.map((c) => ({
        value: c,
        label: c,
      })),
    ];
  }, [data.ciudades]);



  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random()}`,
        prenda: 'Filipina blanca',
        genero: 'Dama',
        talla: 'M',
        cantidad: 1,
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return; // Mantener al menos una fila
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRowField = (id: string, field: keyof PrendaRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  const isFormIncomplete = useMemo(() => {
    if (!selectedSupervisor) return true;
    if (!selectedCiudad) return true;
    if (!recibeNombre.trim()) return true;

    // Validación de dirección de envío obligatoria
    if (selectedCiudad !== 'CIUDAD DE MÉXICO') {
      if (!direccionEnvio.trim()) return true;
    } else if (!reciboEnPersona) {
      if (!direccionEnvio.trim()) return true;
    }

    if (rows.length === 0) return true;
    return rows.some((r) => !r.prenda || !r.genero || !r.talla || r.cantidad <= 0);
  }, [selectedSupervisor, selectedCiudad, recibeNombre, direccionEnvio, reciboEnPersona, rows]);

  const totalPiezas = useMemo(() => {
    return rows.reduce((acc, curr) => acc + curr.cantidad, 0);
  }, [rows]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 text-center sm:text-left relative">
        <div className="absolute -top-6 -left-6 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600 sm:text-left font-sans">
          Formularios
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-black leading-tight text-slate-900 tracking-tight font-sans">
          Levantamiento de Uniformes
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 max-w-2xl font-sans">
          Hola, Supervisor. Por favor confirma tus necesidades de uniformes (Filipinas y Pantalones),
          así como la ciudad de envío y el responsable de recibir el paquete. Si coordinas varias ciudades,
          puedes llenar un formulario independiente para cada una de ellas.
        </p>
      </header>

      {state.ok ? (
        <Card className="rounded-[28px] border border-emerald-100 bg-emerald-50/50 p-6 sm:p-8 shadow-xl backdrop-blur-md text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center text-3xl shadow-inner animate-bounce">
            🎉
          </div>
          <h2 className="text-xl font-bold text-emerald-950 font-sans">¡Registro Completado!</h2>
          <p className="text-sm text-emerald-800 leading-relaxed font-sans max-w-md mx-auto">
            {state.message}
          </p>
          <div className="pt-4">
            <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">
              Resumen registrado:
            </p>
            <div className="mt-2 inline-block bg-white border border-emerald-100 rounded-2xl px-5 py-3 text-left space-y-1 shadow-sm">
              <p className="text-xs font-bold text-slate-800 font-sans">
                👤 {selectedSupervisor}
              </p>
              <p className="text-xs text-slate-600 font-sans">
                📍 Ciudad de Envío: {selectedCiudad}
              </p>
              <p className="text-xs text-slate-600 font-sans">
                📦 Recibe: {recibeNombre}
              </p>
              <p className="text-xs text-slate-600 font-sans">
                🏠 Dirección: {reciboEnPersona ? 'Entrega Presencial' : direccionEnvio}
              </p>
              <div className="border-t border-slate-100 my-2 pt-2 space-y-1">
                {rows.map((r, i) => (
                  <p key={i} className="text-xs text-slate-600 font-sans">
                    • {r.cantidad}x {r.prenda} ({r.genero}) - Talla {r.talla}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="rounded-[28px] border border-slate-100 bg-white/95 p-5 shadow-xl sm:p-8 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-400/5 rounded-full blur-3xl pointer-events-none" />

          <form action={formAction} className="space-y-6">
            <input type="hidden" name="prendas_json" value={JSON.stringify(rows)} />

            {/* 1. Datos del Solicitante y Destino */}
            <div className="p-5 bg-slate-50/70 rounded-[24px] border border-slate-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 font-sans">
                1. Quién solicita y destino
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <Select
                  label="Selecciona tu Nombre"
                  name="supervisor_nombre"
                  options={supervisorOptions}
                  value={selectedSupervisor}
                  onChange={(e) => setSelectedSupervisor(e.target.value)}
                  required
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select
                    label="Ciudad de Envío"
                    name="ciudad_envio"
                    options={ciudadOptions}
                    value={selectedCiudad}
                    onChange={(e) => setSelectedCiudad(e.target.value)}
                    required
                  />

                  <div>
                    <label
                      htmlFor="recibe_nombre"
                      className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary"
                    >
                      Nombre de quien recibe
                    </label>
                    <Input
                      id="recibe_nombre"
                      name="recibe_nombre"
                      placeholder="Ej. Nombre completo del responsable..."
                      value={recibeNombre}
                      onChange={(e) => {
                        setRecibeNombre(e.target.value);
                        setIsRecibeEditedManually(true);
                      }}
                      required
                    />
                  </div>
                </div>

                {/* 1.2. Dirección de Envío */}
                {selectedCiudad && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    {selectedCiudad === 'CIUDAD DE MÉXICO' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="recibo_en_persona"
                          checked={reciboEnPersona}
                          onChange={(e) => {
                            setReciboEnPersona(e.target.checked);
                            if (e.target.checked) {
                              setDireccionEnvio('');
                            }
                          }}
                          className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 focus:ring-offset-0 transition-colors"
                        />
                        <label
                          htmlFor="recibo_en_persona"
                          className="text-xs font-bold text-slate-700 select-none cursor-pointer font-sans"
                        >
                          📍 Recibo en persona / Entrega presencial en CDMX
                        </label>
                      </div>
                    )}

                    {!reciboEnPersona ? (
                      <div>
                        <label
                          htmlFor="direccion_envio"
                          className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary"
                        >
                          Dirección Completa de Envío <span className="text-rose-500 font-sans font-bold">*</span>
                        </label>
                        <textarea
                          id="direccion_envio"
                          name="direccion_envio"
                          rows={2}
                          className="flex min-h-[70px] w-full rounded-xl border border-slate-200 bg-background px-3.5 py-2 text-xs font-medium text-foreground-primary shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 resize-y"
                          placeholder="Calle, número, colonia, delegación/municipio, código postal, estado y referencias del lugar..."
                          value={direccionEnvio}
                          onChange={(e) => setDireccionEnvio(e.target.value)}
                          required={selectedCiudad !== 'CIUDAD DE MÉXICO' || !reciboEnPersona}
                        />
                      </div>
                    ) : (
                      <div className="p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-2xl text-indigo-950 font-sans shadow-sm">
                        <p className="text-xs font-semibold leading-relaxed">
                          ✨ **Entrega presencial seleccionada:** Recibirás tus uniformes personalmente. No es necesario ingresar una dirección física.
                        </p>
                        <input type="hidden" name="direccion_envio" value="ENTREGA PRESENCIAL (RECIBO EN PERSONA)" />
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* 2. Captura de Uniformes */}
            <div className="p-5 bg-slate-50/70 rounded-[24px] border border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 font-sans">
                    2. Configuración de Uniformes
                  </h3>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                    Elige la prenda, género y talla que requieres. Puedes agregar más filas si lo necesitas.
                  </p>
                </div>
                {totalPiezas > 0 && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mt-1.5 sm:mt-0 font-sans">
                    Total: {totalPiezas} piezas
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={row.id}
                    className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm relative group transition-all duration-200 hover:border-slate-200 flex flex-col gap-3"
                  >
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                      {/* Prenda */}
                      <div className="flex-1 min-w-[120px]">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Prenda
                        </span>
                        <select
                          value={row.prenda}
                          onChange={(e) => updateRowField(row.id, 'prenda', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-100"
                        >
                          {data.prendasPermitidas.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Género */}
                      <div className="flex-1 min-w-[100px]">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Género
                        </span>
                        <select
                          value={row.genero}
                          onChange={(e) => updateRowField(row.id, 'genero', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-100"
                        >
                          {data.generosPermitidos.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Talla */}
                      <div className="flex-1 min-w-[90px]">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Talla
                        </span>
                        <select
                          value={row.talla}
                          onChange={(e) => updateRowField(row.id, 'talla', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-100"
                        >
                          {data.tallasPermitidas.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Cantidad con botones interactivos */}
                      <div className="w-full sm:w-[110px] flex-shrink-0">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Cantidad
                        </span>
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden h-9">
                          <button
                            type="button"
                            onClick={() => updateRowField(row.id, 'cantidad', Math.max(1, row.cantidad - 1))}
                            className="w-9 h-full flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold active:bg-slate-200 border-r border-slate-200 transition-colors"
                          >
                            -
                          </button>
                          <span className="flex-1 text-center text-xs font-bold text-slate-800">
                            {row.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateRowField(row.id, 'cantidad', Math.min(10, row.cantidad + 1))}
                            className="w-9 h-full flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold active:bg-slate-200 border-l border-slate-200 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Botón Eliminar */}
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="h-9 w-9 flex items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-all border border-transparent hover:border-rose-100 active:scale-[0.97]"
                          title="Eliminar esta prenda"
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    {row.prenda === 'Filipina negra' && (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-900 font-sans flex items-start gap-2 shadow-sm">
                        <span className="text-sm leading-none">⚠️</span>
                        <div>
                          <span className="font-bold">Exclusivo Palacio de Hierro y Sephora:</span> La Filipina negra es únicamente para personal de Palacio de Hierro y Sephora, y requiere autorización previa de coordinación para mandar el paquete del uniforme.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={addRow}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 bg-white/50 hover:bg-indigo-50/20 transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  ➕ Agregar otra prenda a mi lista
                </button>
              </div>
            </div>

            {/* Mensaje de error al enviar */}
            {state.message && !state.ok && (
              <div className="p-4 bg-rose-50 border border-rose-100 text-rose-950 rounded-2xl flex items-start gap-2.5 shadow-sm text-xs font-medium">
                <span className="text-base leading-none">⚠️</span>
                <p>{state.message}</p>
              </div>
            )}

            {/* Botón de Envío */}
            <div className="pt-2">
              <Button
                variant="primary"
                type="submit"
                disabled={pending || isFormIncomplete}
                className="w-full min-h-12 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {pending ? (
                  <>
                    <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Enviando confirmación...
                  </>
                ) : (
                  <>🚀 Confirmar y Enviar Levantamiento</>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
