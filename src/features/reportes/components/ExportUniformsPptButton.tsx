'use client';

import { useState, type MouseEvent } from 'react';
import { generateUniformsPpt } from '../services/pptExportService';

export function ExportUniformsPptButton({
  periodo,
  cuentaClienteId,
}: {
  periodo: string;
  cuentaClienteId?: string | null;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isExporting) {
      return;
    }

    try {
      setIsExporting(true);
      setError(null);
      await generateUniformsPpt(periodo, cuentaClienteId);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al generar la presentación.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? 'Generando PPTX...' : 'PPTX'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
