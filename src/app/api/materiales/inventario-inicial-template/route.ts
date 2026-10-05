import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET() {
  try {
    const data = [
      {
        'PUNTO DE VENTA': 'SAN PABLO MAZATLAN',
        CANJE: 'Tester Fusion Water 50ml',
        CANTIDAD: 15,
      },
      {
        'PUNTO DE VENTA': 'SAN PABLO REVOLUCION',
        CANJE: 'Muestra Eryfotona Fluid',
        CANTIDAD: 10,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario Inicial');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=Inventario_Inicial_Canjes_Template.xlsx',
      },
    });
  } catch (error) {
    return NextResponse.json({ message: 'Error al generar la plantilla.' }, { status: 500 });
  }
}
