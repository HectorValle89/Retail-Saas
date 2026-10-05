'use server';

import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { publishUiChanges } from '@/lib/ui-change/server';
import { buildUiChangeScope, buildUiChangeTargetsFromBusinessEvent } from '@/lib/ui-change/types';
import type { TipoEvidencia, FotoEvidencia } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Puesto } from '@/types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

export interface EvidenciaActionState {
  ok: boolean;
  message: string;
}

const ROLES_PERMITIDOS: Puesto[] = ['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR'];

export async function obtenerPdvsSupervisor() {
  try {
    const actor = await requerirPuestosActivos(ROLES_PERMITIDOS);
    const service = createServiceClient() as TypedSupabaseClient;

    const { data: supervisorPdvs, error: supervisorError } = await service
      .from('supervisor_pdv')
      .select('pdv:pdv_id(id, nombre, clave_btl, cadena:cadena_id(nombre))')
      .eq('empleado_id', actor.empleadoId)
      .eq('activo', true);

    if (supervisorError) throw supervisorError;

    let pdvs: any[] = (supervisorPdvs ?? [])
      .map((sp) => sp.pdv)
      .filter(Boolean);

    if (pdvs.length === 0 && actor.cuentaClienteId) {
      const { data: cuentaPdvs, error: cuentaError } = await service
        .from('cuenta_cliente_pdv')
        .select('pdv:pdv_id(id, nombre, clave_btl, cadena:cadena_id(nombre))')
        .eq('cuenta_cliente_id', actor.cuentaClienteId)
        .eq('activo', true);

      if (cuentaError) throw cuentaError;

      pdvs = (cuentaPdvs ?? [])
        .map((cp) => cp.pdv)
        .filter(Boolean);
    }

    const pdvIds = pdvs.map((p) => p.id);
    const today = new Date().toISOString().slice(0, 10);
    const dermoPorPdvMap = new Map<string, string>();

    if (pdvIds.length > 0) {
      const { data: asignaciones } = await service
        .from('asignacion')
        .select('pdv_id, empleado:empleado_id(id, nombre_completo, puesto)')
        .in('pdv_id', pdvIds)
        .lte('fecha_inicio', today)
        .or(`fecha_fin.is.null,fecha_fin.gte.${today}`);

      if (asignaciones) {
        asignaciones.forEach((asig: any) => {
          const emp = asig.empleado;
          if (emp && emp.nombre_completo && emp.puesto !== 'SUPERVISOR') {
            dermoPorPdvMap.set(asig.pdv_id, emp.nombre_completo);
          }
        });
      }
    }

    return pdvs.map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      claveBtl: p.clave_btl,
      cadena: p.cadena?.nombre ?? 'General',
      nombreDc: dermoPorPdvMap.get(p.id) || '',
    })).sort((a: any, b: any) => {
      const cadenaCompare = a.cadena.localeCompare(b.cadena);
      if (cadenaCompare !== 0) return cadenaCompare;
      return a.nombre.localeCompare(b.nombre);
    });
  } catch (error) {
    console.error('Error al obtener PDVs del supervisor:', error);
    return [];
  }
}

export async function obtenerTodosPdvsConDcVigente(mesOperacion?: string) {
  try {
    const actor = await requerirPuestosActivos(ROLES_PERMITIDOS);
    const service = createServiceClient() as TypedSupabaseClient;

    const monthPrefix = mesOperacion ? mesOperacion.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const monthStart = `${monthPrefix}-01`;
    const [yearStr, monthStr] = monthPrefix.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

    let pdvs: any[] = [];

    // 1. Obtener los PDVs activos asociados a la cuenta del cliente
    if (actor.cuentaClienteId) {
      const { data: cuentaPdvs, error: cuentaError } = await service
        .from('cuenta_cliente_pdv')
        .select('pdv:pdv_id(id, nombre, clave_btl, estatus, activo, cadena:cadena_id(nombre))')
        .eq('cuenta_cliente_id', actor.cuentaClienteId)
        .eq('activo', true);

      if (cuentaError) throw cuentaError;

      pdvs = (cuentaPdvs ?? [])
        .map((cp: any) => cp.pdv)
        .filter((p: any) => Boolean(p) && p.estatus !== 'INACTIVO' && p.activo !== false);
    }

    // Si no hay cuenta o la relación cuenta_cliente_pdv no devolvió PDVs, consultar todos los activos
    if (pdvs.length === 0) {
      const { data: allPdvs, error: allPdvsError } = await service
        .from('pdv')
        .select('id, nombre, clave_btl, estatus, activo, cadena:cadena_id(nombre)')
        .eq('estatus', 'ACTIVO');

      if (allPdvsError) throw allPdvsError;
      pdvs = allPdvs ?? [];
    }

    // Deduplicar PDVs por id único para evitar registros duplicados de cuenta_cliente_pdv
    const uniquePdvsMap = new Map<string, any>();
    for (const p of pdvs) {
      if (p && p.id && !uniquePdvsMap.has(p.id)) {
        uniquePdvsMap.set(p.id, p);
      }
    }
    pdvs = Array.from(uniquePdvsMap.values());

    const pdvIds = pdvs.map((p) => p.id);
    const dermoPorPdvMap = new Map<string, string>();

    if (pdvIds.length > 0) {
      // 2. Consultar asignación vigente del mes de operación desde asignacion_diaria_resuelta
      const { data: resueltas } = await service
        .from('asignacion_diaria_resuelta')
        .select('pdv_id, fecha, empleado:empleado_id(id, nombre_completo, puesto)')
        .in('pdv_id', pdvIds)
        .gte('fecha', monthStart)
        .lte('fecha', monthEnd)
        .eq('estado_operativo', 'ASIGNADA_PDV')
        .eq('trabaja_en_tienda', true)
        .order('fecha', { ascending: true });

      if (resueltas) {
        resueltas.forEach((r: any) => {
          const emp = r.empleado;
          if (r.pdv_id && emp && emp.nombre_completo && emp.puesto !== 'SUPERVISOR') {
            if (!dermoPorPdvMap.has(r.pdv_id)) {
              dermoPorPdvMap.set(r.pdv_id, emp.nombre_completo);
            }
          }
        });
      }

      // 3. Fallback resiliente: para los PDVs sin registro en asignacion_diaria_resuelta para ese mes, consultar tabla asignacion vigente para ese mes
      const missingPdvIds = pdvIds.filter((id) => !dermoPorPdvMap.has(id));
      if (missingPdvIds.length > 0) {
        const { data: asignaciones } = await service
          .from('asignacion')
          .select('pdv_id, fecha_inicio, fecha_fin, prioridad, empleado:empleado_id(id, nombre_completo, puesto)')
          .in('pdv_id', missingPdvIds)
          .lte('fecha_inicio', monthEnd)
          .or(`fecha_fin.is.null,fecha_fin.gte.${monthStart}`)
          .order('fecha_inicio', { ascending: false });

        if (asignaciones) {
          asignaciones.forEach((asig: any) => {
            const emp = asig.empleado;
            if (emp && emp.nombre_completo && emp.puesto !== 'SUPERVISOR' && !dermoPorPdvMap.has(asig.pdv_id)) {
              dermoPorPdvMap.set(asig.pdv_id, emp.nombre_completo);
            }
          });
        }
      }
    }

    return pdvs.map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      claveBtl: p.clave_btl,
      cadena: p.cadena?.nombre ?? 'General',
      nombreDc: dermoPorPdvMap.get(p.id) || '',
    })).sort((a: any, b: any) => {
      const cadenaCompare = a.cadena.localeCompare(b.cadena);
      if (cadenaCompare !== 0) return cadenaCompare;
      return a.nombre.localeCompare(b.nombre);
    });
  } catch (error) {
    console.error('Error al obtener todos los PDVs con DC vigente:', error);
    return [];
  }
}

export async function obtenerTodosPdvsAdmin() {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR', 'CLIENTE']);
    const service = createServiceClient() as TypedSupabaseClient;

    let query = service
      .from('pdv')
      .select('id, nombre, clave_btl, cadena:cadena_id(nombre)')
      .eq('estatus', 'ACTIVO');

    if (actor.cuentaClienteId) {
      const { data: countPdvs } = await service
        .from('cuenta_cliente_pdv')
        .select('pdv_id')
        .eq('cuenta_cliente_id', actor.cuentaClienteId)
        .eq('activo', true);
      const pdvIds = (countPdvs ?? []).map((cp) => cp.pdv_id);
      query = query.in('id', pdvIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      claveBtl: p.clave_btl,
      cadena: p.cadena?.nombre ?? 'General',
    })).sort((a, b) => a.cadena.localeCompare(b.cadena) || a.nombre.localeCompare(b.nombre));
  } catch (error) {
    console.error('Error al obtener todos los PDVs:', error);
    return [];
  }
}

export async function obtenerTodosSupervisoresAdmin() {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR', 'CLIENTE']);
    const service = createServiceClient() as TypedSupabaseClient;

    let query = service
      .from('empleado')
      .select('id, nombre, primer_apellido, segundo_apellido')
      .eq('puesto', 'SUPERVISOR')
      .eq('activo', true);

    if (actor.cuentaClienteId) {
      query = query.eq('cuenta_cliente_id', actor.cuentaClienteId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((e: any) => ({
      id: e.id,
      nombreCompleto: `${e.nombre} ${e.primer_apellido} ${e.segundo_apellido ?? ''}`.trim(),
    })).sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
  } catch (error) {
    console.error('Error al obtener todos los supervisores:', error);
    return [];
  }
}

export async function guardarSupervisorEvidencia(
  _prevState: EvidenciaActionState,
  formData: FormData
): Promise<EvidenciaActionState> {
  try {
    const actor = await requerirPuestosActivos(ROLES_PERMITIDOS);
    const service = createServiceClient() as TypedSupabaseClient;

    const pdvId = formData.get('pdv_id') as string | null;
    const tipoEvidencia = formData.get('tipo_evidencia') as TipoEvidencia;
    const mesEntrega = (formData.get('mes_entrega') as string | null) || new Date().toISOString().slice(0, 7);
    const observaciones = (formData.get('observaciones') as string | null) || null;
    const fotosMetadataRaw = formData.get('fotos_metadata') as string | null;
    const checklistRaw = formData.get('checklist') as string | null;

    if (!tipoEvidencia) {
      return { ok: false, message: 'El tipo de evidencia es obligatorio.' };
    }

    if (!fotosMetadataRaw) {
      return { ok: false, message: 'No se recibieron las imágenes de evidencia.' };
    }

    const fotos: FotoEvidencia[] = JSON.parse(fotosMetadataRaw);
    if (!Array.isArray(fotos) || fotos.length === 0) {
      return { ok: false, message: 'Debes capturar al menos una fotografía de evidencia.' };
    }

    const metadata: Record<string, any> = {
      capturado_desde: 'acciones_rapidas_supervisor',
      actor_puesto: actor.puesto,
      fecha_captura: new Date().toISOString(),
      mes_entrega: mesEntrega,
    };

    if (checklistRaw) {
      metadata.checklist = JSON.parse(checklistRaw);
    }

    // Construir fecha_operacion alineada al mes de entrega seleccionado (ej: 2026-08-01)
    const fechaOperacion = mesEntrega.length === 7 ? `${mesEntrega}-01` : new Date().toISOString().slice(0, 10);

    const { error: insertError } = await service.from('supervisor_evidencia').insert({
      cuenta_cliente_id: actor.cuentaClienteId,
      supervisor_empleado_id: actor.empleadoId,
      pdv_id: pdvId || null,
      fecha_operacion: fechaOperacion,
      tipo_evidencia: tipoEvidencia,
      fotos: fotos,
      observaciones: observaciones,
      metadata: metadata,
    });

    if (insertError) {
      return {
        ok: false,
        message: `Error de base de datos: ${insertError.message} (Código ${insertError.code})`,
      };
    }

    if (pdvId && actor.cuentaClienteId) {
      const periodo = new Date().toISOString().slice(0, 7);
      await publishUiChanges(
        buildUiChangeTargetsFromBusinessEvent({
          eventType: 'supervisor_evidencia_guardada',
          modules: ['dashboard', 'reportes'],
          surfaces: ['panel', 'insights', 'tabla'],
          scopes: [
            buildUiChangeScope('cuenta', actor.cuentaClienteId),
            buildUiChangeScope('empleado', actor.empleadoId),
            buildUiChangeScope('pdv', pdvId),
            buildUiChangeScope('periodo', periodo),
          ],
          cuentaClienteId: actor.cuentaClienteId,
          empleadoId: actor.empleadoId,
          metadata: {
            pdvId,
            periodo,
            tipoEvidencia,
          },
        }),
        { service }
      );
    }

    return { ok: true, message: 'Evidencias guardadas correctamente en la base de datos.' };
  } catch (error) {
    console.error('Error al guardar evidencias del supervisor:', error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Error interno al guardar las evidencias.',
    };
  }
}

export interface PersonaReceptora {
  id: string;
  nombreCompleto: string;
  puesto: 'DERMOCONSEJERA' | 'SUPERVISOR';
  esAsignadoPdv?: boolean;
}

export async function obtenerReceptoresPdv(pdvId: string, mesOperacion?: string): Promise<PersonaReceptora[]> {
  try {
    const actor = await requerirPuestosActivos(ROLES_PERMITIDOS);
    const service = createServiceClient() as TypedSupabaseClient;

    const monthPrefix = mesOperacion ? mesOperacion.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const monthStart = `${monthPrefix}-01`;
    const [yearStr, monthStr] = monthPrefix.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

    // Obtener la cuenta_cliente_id de la relacion intermedia cuenta_cliente_pdv para el PDV seleccionado
    const { data: relsData, error: relsError } = await service
      .from('cuenta_cliente_pdv')
      .select('cuenta_cliente_id')
      .eq('pdv_id', pdvId)
      .eq('activo', true)
      .limit(1);

    if (relsError) throw relsError;
    const targetCuentaClienteId = relsData?.[0]?.cuenta_cliente_id || actor.cuentaClienteId;

    const asignadosPdv: PersonaReceptora[] = [];
    const asignadosSet = new Set<string>();

    // 1. Buscar asignación vigente del mes de operación en asignacion_diaria_resuelta
    const { data: resueltasMes } = await service
      .from('asignacion_diaria_resuelta')
      .select('empleado:empleado_id(id, nombre_completo, puesto)')
      .eq('pdv_id', pdvId)
      .gte('fecha', monthStart)
      .lte('fecha', monthEnd)
      .eq('estado_operativo', 'ASIGNADA_PDV')
      .eq('trabaja_en_tienda', true)
      .order('fecha', { ascending: true });

    if (resueltasMes && resueltasMes.length > 0) {
      resueltasMes.forEach((r: any) => {
        const emp = r.empleado;
        if (emp && emp.id && emp.puesto !== 'SUPERVISOR' && !asignadosSet.has(emp.id)) {
          asignadosPdv.push({
            id: emp.id,
            nombreCompleto: emp.nombre_completo,
            puesto: 'DERMOCONSEJERA',
            esAsignadoPdv: true,
          });
          asignadosSet.add(emp.id);
        }
      });
    }

    // 2. Fallback resiliente: Si no hay registro en asignacion_diaria_resuelta para ese mes, buscar en tabla asignacion para ese mes
    if (asignadosPdv.length === 0) {
      const { data: asignaciones } = await service
        .from('asignacion')
        .select('empleado:empleado_id(id, nombre_completo, puesto)')
        .eq('pdv_id', pdvId)
        .lte('fecha_inicio', monthEnd)
        .or(`fecha_fin.is.null,fecha_fin.gte.${monthStart}`)
        .order('fecha_inicio', { ascending: false });

      if (asignaciones) {
        asignaciones.forEach((asig: any) => {
          const emp = asig.empleado;
          if (emp && emp.id && emp.puesto !== 'SUPERVISOR' && !asignadosSet.has(emp.id)) {
            asignadosPdv.push({
              id: emp.id,
              nombreCompleto: emp.nombre_completo,
              puesto: 'DERMOCONSEJERA',
              esAsignadoPdv: true,
            });
            asignadosSet.add(emp.id);
          }
        });
      }
    }

    // 3. Obtener el resto de la plantilla activa de dermoconsejeras de la cuenta
    const restoPlantilla: PersonaReceptora[] = [];
    if (targetCuentaClienteId) {
      const { data: todosUsuarios } = await service
        .from('usuario')
        .select('empleado:empleado_id(id, nombre_completo, puesto, estatus_laboral)')
        .eq('cuenta_cliente_id', targetCuentaClienteId);

      if (todosUsuarios) {
        todosUsuarios.forEach((u: any) => {
          const emp = u.empleado;
          if (
            emp &&
            emp.id &&
            !asignadosSet.has(emp.id) &&
            (emp.puesto === 'DERMOCONSEJERO' || emp.puesto === 'DERMOCONSEJERA' || emp.puesto === 'DEMOSTRADORA') &&
            emp.estatus_laboral === 'ACTIVO'
          ) {
            restoPlantilla.push({
              id: emp.id,
              nombreCompleto: emp.nombre_completo,
              puesto: 'DERMOCONSEJERA',
            });
          }
        });
      }
    }

    restoPlantilla.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));

    // La asignada al PDV va PRIMERO en la lista devuelta
    return [...asignadosPdv, ...restoPlantilla];
  } catch (error) {
    console.error('Error al obtener receptores del PDV:', error);
    return [];
  }
}

export async function obtenerPlantillaActivaDermos(): Promise<PersonaReceptora[]> {
  try {
    const actor = await requerirPuestosActivos(ROLES_PERMITIDOS);
    const service = createServiceClient() as TypedSupabaseClient;

    const { data: todosUsuarios, error: dermosError } = await service
      .from('usuario')
      .select('empleado:empleado_id(id, nombre_completo, puesto, estatus_laboral)')
      .eq('cuenta_cliente_id', actor.cuentaClienteId);

    if (dermosError) throw dermosError;

    const dermosMap = new Map<string, PersonaReceptora>();
    if (todosUsuarios) {
      todosUsuarios.forEach((u: any) => {
        const emp = u.empleado;
        if (
          emp &&
          (emp.puesto === 'DERMOCONSEJERO' || emp.puesto === 'DERMOCONSEJERA' || emp.puesto === 'DEMOSTRADORA') &&
          emp.estatus_laboral === 'ACTIVO'
        ) {
          dermosMap.set(emp.id, {
            id: emp.id,
            nombreCompleto: emp.nombre_completo,
            puesto: 'DERMOCONSEJERA',
          });
        }
      });
    }

    return Array.from(dermosMap.values()).sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
  } catch (err) {
    console.error('Error al obtener plantilla activa de dermos:', err);
    return [];
  }
}

export interface EvidenciaHistorialItem {
  id: string;
  tipoEvidencia: string;
  pdvId: string | null;
  pdvNombre: string;
  pdvClaveBtl: string;
  fechaOperacion: string;
  createdAt: string;
  observaciones: string | null;
  receptorNombre: string | null;
  puestoReceptor: string | null;
  modoEntrega: string | null;
  fotos: Array<{ url: string; label?: string }>;
}

export async function obtenerHistorialEvidenciasSupervisor(filters?: {
  periodo?: string;
  pdvId?: string;
  supervisorId?: string;
}): Promise<EvidenciaHistorialItem[]> {
  try {
    const actor = await requerirPuestosActivos(ROLES_PERMITIDOS);
    const service = createServiceClient() as TypedSupabaseClient;

    let query = service
      .from('supervisor_evidencia')
      .select('id, tipo_evidencia, pdv_id, fecha_operacion, observaciones, fotos, metadata, created_at, pdv:pdv_id(nombre, clave_btl)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (actor.puesto === 'SUPERVISOR') {
      query = query.eq('supervisor_empleado_id', actor.empleadoId);
    } else if (filters?.supervisorId) {
      query = query.eq('supervisor_empleado_id', filters.supervisorId);
    }

    if (filters?.pdvId) {
      query = query.eq('pdv_id', filters.pdvId);
    }

    if (filters?.periodo) {
      const parts = filters.periodo.split('-');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const monthIdx = parseInt(parts[1], 10) - 1;
        const start = new Date(year, monthIdx, 1).toISOString().slice(0, 10);
        const end = new Date(year, monthIdx + 1, 0).toISOString().slice(0, 10);
        query = query.gte('fecha_operacion', start).lte('fecha_operacion', end);
      }
    }

    const { data: evidencias, error } = await query;

    if (error) throw error;

    return (evidencias || []).map((row: any) => {
      const pdv = row.pdv;
      const metadata = row.metadata || {};
      const checklist = metadata.checklist || {};
      const fotosRaw = Array.isArray(row.fotos) ? row.fotos : [];

      return {
        id: row.id,
        tipoEvidencia: row.tipo_evidencia,
        pdvId: row.pdv_id,
        pdvNombre: pdv?.nombre || metadata.pdv_label || 'Punto de Venta',
        pdvClaveBtl: pdv?.clave_btl || '',
        fechaOperacion: row.fecha_operacion,
        createdAt: row.created_at,
        observaciones: row.observaciones,
        receptorNombre: checklist.nombre_receptor || metadata.receptor_label || null,
        puestoReceptor: checklist.puesto_receptor || null,
        modoEntrega: checklist.modo_entrega || metadata.modo_entrega || null,
        fotos: fotosRaw.map((f: any) => ({
          url: f.url || f.originalKey || '',
          label: f.label || '',
        })),
      };
    });
  } catch (err) {
    console.error('Error al obtener historial de evidencias:', err);
    return [];
  }
}

