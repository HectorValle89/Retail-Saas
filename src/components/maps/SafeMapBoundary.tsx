'use client';

import React, { Component, type ReactNode } from 'react';

interface SafeMapBoundaryProps {
  children: ReactNode;
  heightClassName?: string;
}

interface SafeMapBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class SafeMapBoundary extends Component<SafeMapBoundaryProps, SafeMapBoundaryState> {
  constructor(props: SafeMapBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): SafeMapBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Error al renderizar el mapa.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[SafeMapBoundary] Error capturado en el mapa:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={`relative z-0 flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center shadow-inner ${
            this.props.heightClassName ?? 'h-[320px]'
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl text-amber-700">
            🗺️
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            No fue posible cargar el mapa en este momento
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            El resto de la información sigue disponible a la izquierda. Puedes reintentar cargar la
            vista geográfica en cualquier momento.
          </p>
          {this.state.errorMessage && (
            <p className="mt-2 max-w-sm rounded-lg bg-slate-100 px-3 py-1 font-mono text-[10px] text-slate-500">
              {this.state.errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
          >
            Reintentar mapa
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
