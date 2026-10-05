export type TipoEvidencia =
  | 'ULTIMA_MILLA'
  | 'DISPERSION'
  | 'MATERIAL_POP'
  | 'CAMPANA_ESTACIONAL'
  | 'MALETA_VANITY'
  | 'EVENTO_ESPECIAL'
  | 'ADOPTADO_SAN_PABLO'
  | 'PRODUCTO_MES_LIVERPOOL'
  | 'ENTREGA_UNIFORMES'
  | 'IMPLEMENTACION';

export interface FotoEvidencia {
  originalKey: string;
  sha256: string;
  url: string;
  size: number;
  contentType: string;
  capturedAt: string;
  orientation: 'portrait' | 'landscape';
  label: string; // e.g. "Acuse de recibo firmado"
}

export interface SupervisorEvidencia {
  id: string;
  cuentaClienteId: string;
  supervisorEmpleadoId: string;
  pdvId: string | null;
  fechaOperacion: string;
  tipoEvidencia: TipoEvidencia;
  fotos: FotoEvidencia[];
  observaciones: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
