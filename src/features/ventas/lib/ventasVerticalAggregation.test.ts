import { describe, expect, it } from 'vitest';
import {
  aggregateDermoPdvGroups,
  generateMonthDays,
  recortarNombreProducto,
  recortarNombreMaterial,
} from './ventasVerticalAggregation';
import type { VentaCapturaDetalleItem, VentaDatasetItem } from '../services/ventaService';

describe('ventasVerticalAggregation', () => {
  describe('recortarNombreProducto', () => {
    it('prefers nombreCorto when available and distinct', () => {
      const result = recortarNombreProducto('ISDIN FUSION WATER MAGIC 50ML', 'FW MAGIC');
      expect(result).toBe('FW MAGIC');
    });

    it('strips redundant brand prefixes when only nombreLargo is provided', () => {
      expect(recortarNombreProducto('FOTOPROTECTOR ISDIN FUSION WATER MAGIC SPF 50')).toBe(
        'FP FUSION WATER MAGIC SPF 50'
      );
      expect(recortarNombreProducto('ISDINCEUTICS RETINAL INTENSE 50 ML')).toBe(
        'RETINAL INTENSE 50 ML'
      );
      expect(recortarNombreProducto('WOMAN ISDIN CREMA ANTIESTRIAS')).toBe(
        'WOMAN CREMA ANTIESTRIAS'
      );
      expect(recortarNombreProducto('BEXIDENT DIENTES BLANCOS')).toBe(
        'BEX DIENTES BLANCOS'
      );
    });

    it('handles empty or null gracefully', () => {
      expect(recortarNombreProducto(null, null)).toBe('Producto');
      expect(recortarNombreProducto('', '')).toBe('Producto');
    });
  });

  describe('recortarNombreMaterial', () => {
    it('prefers materialNombreCorto when available and distinct', () => {
      const result = recortarNombreMaterial('GORRA ISDIN FOTOPROTECCIÓN', 'GORRA FOTOPROT.');
      expect(result).toBe('GORRA FOTOPROT.');
    });

    it('shortens promotional materials intelligently when only long name exists', () => {
      expect(recortarNombreMaterial('GORRA ISDIN FOTOPROTECCIÓN')).toBe('GORRA FOTOPROT.');
      expect(recortarNombreMaterial('CANGURERAS NEGRAS ISDIN')).toBe('CANGURERAS NEGRAS');
      expect(recortarNombreMaterial('NECESER ISDINCEUTICS NEGRO 2025')).toBe('NECESER NEGRO 2025');
      expect(recortarNombreMaterial('TERMO T208 A 1 TINTA')).toBe('TERMO T208');
    });
  });

  describe('generateMonthDays', () => {
    it('generates all days for September 2026 (30 days)', () => {
      const { days, daysInMonth, year, month } = generateMonthDays('2026-09');
      expect(year).toBe(2026);
      expect(month).toBe(9);
      expect(daysInMonth).toBe(30);
      expect(days.length).toBe(30);
      expect(days[0].dateStr).toBe('2026-09-01');
      expect(days[29].dateStr).toBe('2026-09-30');
    });
  });

  describe('aggregateDermoPdvGroups (Single Source of Truth & No Double Counting)', () => {
    it('aggregates sales pieces strictly from dataset and ignores redundant VENTA in capturasDetalle', () => {
      const { days: monthDays } = generateMonthDays('2026-09');

      // Canonical dataset (official table `venta`) with 281 pieces total
      const dataset: VentaDatasetItem[] = [
        {
          weekBucket: '2026-W36',
          pdvLabel: 'Farmacias San Pablo Camarones',
          empleadoId: 'emp-1',
          empleadoLabel: 'ANA LILIA HERNANDEZ CASTILLO',
          empleadoIdNomina: 'DC-001',
          pdvId: 'pdv-1',
          pdvNombre: 'S Pablo Camarones',
          pdvClaveBtl: 'SP-CAM',
          cadena: 'Farmacias San Pablo',
          supervisorId: 'sup-1',
          supervisorLabel: 'Jacqueline López Ruiz',
          zona: 'Centro',
          fechaOperacion: '2026-09-02',
          totalUnidades: 15,
          totalMonto: 4500,
          productoNombre: 'ISDIN FUSION WATER 50ML',
          productoNombreCorto: 'FW 50ML',
          confirmada: true,
          total: 1,
        },
        {
          weekBucket: '2026-W36',
          pdvLabel: 'Farmacias San Pablo Camarones',
          empleadoId: 'emp-1',
          empleadoLabel: 'ANA LILIA HERNANDEZ CASTILLO',
          empleadoIdNomina: 'DC-001',
          pdvId: 'pdv-1',
          pdvNombre: 'S Pablo Camarones',
          pdvClaveBtl: 'SP-CAM',
          cadena: 'Farmacias San Pablo',
          supervisorId: 'sup-1',
          supervisorLabel: 'Jacqueline López Ruiz',
          zona: 'Centro',
          fechaOperacion: '2026-09-03',
          totalUnidades: 266, // 15 + 266 = 281 pieces
          totalMonto: 79800,
          productoNombre: 'ISDINCEUTICS RETINAL INTENSE',
          productoNombreCorto: 'RETINAL INTENSE',
          confirmada: true,
          total: 1,
        },
      ];

      // Operational tickets from celular (capturasDetalle)
      // Note: contains a redundant VENTA of 59 pieces that must NOT be re-added!
      const capturasDetalle: VentaCapturaDetalleItem[] = [
        {
          id: 'c-venta-1',
          createdAt: '2026-09-02T12:00:00Z',
          empleadoId: 'emp-1',
          pdvId: 'pdv-1',
          fechaOperativa: '2026-09-02',
          tipoRegistro: 'VENTA',
          subtipoRegistro: null,
          cantidad: 59,
          productoNombre: 'ISDIN FUSION WATER 50ML',
          materialNombre: null,
          observaciones: null,
        },
        {
          id: 'c-love-1',
          createdAt: '2026-09-02T13:00:00Z',
          empleadoId: 'emp-1',
          pdvId: 'pdv-1',
          fechaOperativa: '2026-09-02',
          tipoRegistro: 'LOVE_ISDIN',
          subtipoRegistro: 'LOVE_ISDIN',
          cantidad: 2,
          productoNombre: null,
          materialNombre: null,
          observaciones: null,
        },
        {
          id: 'c-canje-1',
          createdAt: '2026-09-03T14:00:00Z',
          empleadoId: 'emp-1',
          pdvId: 'pdv-1',
          fechaOperativa: '2026-09-03',
          tipoRegistro: 'CANJE',
          subtipoRegistro: null,
          materialNombre: 'Bolsa Ecológica ISDIN',
          productoNombre: null,
          cantidad: 1,
          observaciones: null,
        },
      ];

      const groups = aggregateDermoPdvGroups({ dataset, capturasDetalle, monthDays });

      expect(groups.length).toBe(1);
      const anaLiliaGroup = groups[0];

      // CRITICAL CHECK: totalPiezas must be exactly 281 (from dataset), NOT 340 (281 + 59)
      expect(anaLiliaGroup.totalPiezas).toBe(281);
      expect(anaLiliaGroup.totalMonto).toBe(84300);

      // Operational events from capturasDetalle must still be captured accurately
      expect(anaLiliaGroup.totalLove).toBe(2);
      expect(anaLiliaGroup.totalCanjes).toBe(1);

      // Check day 2026-09-02
      const day2 = anaLiliaGroup.daysMap.get('2026-09-02')!;
      expect(day2.piezas).toBe(15); // Exactly 15, not 15 + 59
      expect(day2.productos[0].nombre).toBe('FW 50ML');
      expect(day2.loveRegistros.length).toBe(1);
      expect(day2.loveRegistros[0].cantidad).toBe(2);

      // Check day 2026-09-03
      const day3 = anaLiliaGroup.daysMap.get('2026-09-03')!;
      expect(day3.piezas).toBe(266);
      expect(day3.productos[0].nombre).toBe('RETINAL INTENSE');
      expect(day3.canjesRegistros.length).toBe(1);
      expect(day3.canjesRegistros[0].cantidad).toBe(1);
      expect(day3.canjesRegistros[0].materialCorto).toBe('Bolsa Ecológica');
    });
  });
});
