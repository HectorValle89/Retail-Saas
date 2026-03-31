'use server'

import { revalidatePath } from 'next/cache'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState'
import type { ConfiguracionSistema } from '@/types/database'
import { parseProductCatalogWorkbook } from './lib/productCatalogImport'
import {
  ESTADO_CONFIGURACION_ADMIN_INICIAL,
  type ConfiguracionAdminActionState,
} from './state'
import {
  EDITABLE_PARAMETER_DEFINITION_MAP,
  OCR_MODEL_CONFIG_KEY,
  OCR_PROVIDER_CONFIG_KEY,
  OCR_PROVIDER_OPTIONS,
  PDF_COMPRESSION_PROVIDER_CONFIG_KEY,
  PDF_COMPRESSION_PROVIDER_OPTIONS,
  PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY,
  TURNOS_CONFIG_KEY,
  coerceEditableConfigValue,
  parseTurnosCatalogo,
  serializeTurnosCatalogo,
  type TurnoCatalogoItem,
} from './configuracionCatalog'

function buildState(
  partial: Partial<ConfiguracionAdminActionState>
): ConfiguracionAdminActionState {
  return {
    ...ESTADO_CONFIGURACION_ADMIN_INICIAL,
    ...partial,
  }
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeBoolean(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (normalized === 'true' || normalized === 'on') {
    return true
  }

  if (normalized === 'false' || normalized === 'off' || normalized === '') {
    return false
  }

  throw new Error('El valor booleano no es valido.')
}

function normalizePositiveNumber(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(normalizeRequiredText(value, label))

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} debe ser mayor a cero.`)
  }

  return parsed
}

function normalizeIntegerInRange(
  value: FormDataEntryValue | null,
  label: string,
  min: number,
  max: number
) {
  const parsed = Number(normalizeRequiredText(value, label))

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} debe ser un entero entre ${min} y ${max}.`)
  }

  return parsed
}

function normalizeOptionalInteger(value: FormDataEntryValue | null) {
  const normalized = normalizeOptionalText(value)

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  if (!Number.isInteger(parsed)) {
    throw new Error('El valor debe ser entero.')
  }

  return parsed
}

function normalizeTime(value: FormDataEntryValue | null, label: string) {
  const normalized = normalizeOptionalText(value)

  if (!normalized) {
    return null
  }

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`${label} debe tener formato HH:MM.`)
  }

  return `${normalized}:00`
}

function normalizeCode(value: FormDataEntryValue | null, label: string) {
  return normalizeRequiredText(value, label).toUpperCase().replace(/\s+/g, '_')
}

function normalizeCatalogText(value: FormDataEntryValue | null, label: string) {
  return normalizeRequiredText(value, label).toUpperCase()
}

async function getAdminService() {
  const { service, error } = obtenerClienteAdmin()

  if (!service) {
    throw new Error(error ?? 'No fue posible inicializar el backend administrativo.')
  }

  return service
}

async function registrarEventoAudit(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  actorUsuarioId: string,
  tabla: string,
  registroId: string,
  payload: Record<string, unknown>
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: null,
  })
}

async function upsertConfiguracion(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    key,
    value,
    description,
    module,
  }: {
    key: string
    value: unknown
    description: string
    module: string
  }
) {
  const { data, error } = await service
    .from('configuracion')
    .upsert(
      {
        clave: key,
        valor: value,
        descripcion: description,
        modulo: module,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clave' }
    )
    .select('id, clave, valor, descripcion, modulo')
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message ?? `No fue posible guardar ${key}.`)
  }

  return data as ConfiguracionSistema
}

async function obtenerConfiguracion(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  key: string
) {
  const { data, error } = await service
    .from('configuracion')
    .select('id, clave, valor, descripcion, modulo')
    .eq('clave', key)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as ConfiguracionSistema | null) ?? null
}

function revalidateCommonPaths() {
  revalidatePath('/configuracion')
}

function revalidatePathsByConfigKey(key: string) {
  revalidateCommonPaths()

  if (key.startsWith('geocerca.') || key.startsWith('asistencias.')) {
    revalidatePath('/pdvs')
    revalidatePath('/asistencias')
  }

  if (key.startsWith('archivos.') || key.startsWith('integraciones.ocr')) {
    revalidatePath('/empleados')
  }

  if (key.startsWith('integraciones.pdf')) {
    revalidatePath('/empleados')
    revalidatePath('/solicitudes')
    revalidatePath('/gastos')
    revalidatePath('/materiales')
    revalidatePath('/mensajes')
    revalidatePath('/rutas')
    revalidatePath('/campanas')
  }

  if (key.startsWith('nomina.')) {
    revalidatePath('/nomina')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
  }

  if (key.startsWith('ventas.')) {
    revalidatePath('/ventas')
  }

  if (key.startsWith('auth.')) {
    revalidatePath('/admin/users')
  }
}

export async function importarCatalogoProductos(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const uploadedFile = formData.get('catalogo_productos_file')

    if (!(uploadedFile instanceof File)) {
      return buildState({ message: 'Adjunta un archivo XLSX para importar el catalogo.' })
    }

    if (!uploadedFile.name.toLowerCase().endsWith('.xlsx')) {
      return buildState({ message: 'El catalogo debe estar en formato XLSX.' })
    }

    const bytes = new Uint8Array(await uploadedFile.arrayBuffer())
    const parsed = parseProductCatalogWorkbook(bytes)
    const importedAt = new Date().toISOString()

    const payload = parsed.rows.map((item) => ({
      sku: item.sku,
      nombre: item.nombre,
      nombre_corto: item.nombreCorto,
      categoria: item.categoria,
      top_30: item.top30,
      activo: item.activo,
      metadata: {
        fuente: 'catalogo_isdin_admin_upload',
        archivo: uploadedFile.name,
        importado_en: importedAt,
      },
      updated_at: importedAt,
    }))

    const { error } = await service.from('producto').upsert(payload, { onConflict: 'sku' })

    if (error) {
      return buildState({
        message: error.message || 'No fue posible importar el catalogo de productos.',
      })
    }

    await registrarEventoAudit(service, actor.usuarioId, 'producto', 'catalogo-isdin', {
      evento: 'configuracion_catalogo_productos_importado',
      archivo: uploadedFile.name,
      productos_procesados: parsed.rows.length,
      filas_descartadas: parsed.skippedRows,
    })

    revalidateCommonPaths()
    revalidatePath('/ventas')
    revalidatePath('/reportes')
    revalidatePath('/campanas')

    return buildState({
      ok: true,
      message: `Catalogo importado: ${parsed.rows.length} productos actualizados${
        parsed.skippedRows > 0 ? `, ${parsed.skippedRows} filas descartadas` : ''
      }.`,
    })
  } catch (error) {
    return buildState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible importar el catalogo de productos.',
    })
  }
}

export async function guardarProducto(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const productoId = normalizeOptionalText(formData.get('producto_id'))
    const payload = {
      sku: normalizeRequiredText(formData.get('sku'), 'SKU').toUpperCase(),
      nombre: normalizeRequiredText(formData.get('nombre'), 'Nombre'),
      nombre_corto: normalizeRequiredText(formData.get('nombre_corto'), 'Nombre corto'),
      categoria: normalizeRequiredText(formData.get('categoria'), 'Categoria'),
      top_30: normalizeBoolean(formData.get('top_30')),
      activo: normalizeBoolean(formData.get('activo')),
      updated_at: new Date().toISOString(),
    }

    const query = productoId
      ? service.from('producto').update(payload).eq('id', productoId)
      : service.from('producto').insert(payload)

    const { data, error } = await query.select('id, sku, nombre').maybeSingle()

    if (error || !data) {
      return buildState({ message: error?.message ?? 'No fue posible guardar el producto.' })
    }

    await registrarEventoAudit(service, actor.usuarioId, 'producto', data.id, {
      evento: productoId ? 'configuracion_producto_actualizado' : 'configuracion_producto_creado',
      sku: data.sku,
      nombre: data.nombre,
    })

    revalidateCommonPaths()
    revalidatePath('/ventas')

    return buildState({
      ok: true,
      message: productoId ? 'Producto actualizado.' : 'Producto creado.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar el producto.',
    })
  }
}

export async function guardarCadena(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const cadenaId = normalizeOptionalText(formData.get('cadena_id'))
    const payload = {
      codigo: normalizeCode(formData.get('codigo'), 'Codigo'),
      nombre: normalizeRequiredText(formData.get('nombre'), 'Nombre'),
      factor_cuota_default: normalizePositiveNumber(
        formData.get('factor_cuota_default'),
        'Factor cuota default'
      ),
      activa: normalizeBoolean(formData.get('activa')),
      updated_at: new Date().toISOString(),
    }

    const query = cadenaId
      ? service.from('cadena').update(payload).eq('id', cadenaId)
      : service.from('cadena').insert(payload)

    const { data, error } = await query.select('id, codigo, nombre').maybeSingle()

    if (error || !data) {
      return buildState({ message: error?.message ?? 'No fue posible guardar la cadena.' })
    }

    await registrarEventoAudit(service, actor.usuarioId, 'cadena', data.id, {
      evento: cadenaId ? 'configuracion_cadena_actualizada' : 'configuracion_cadena_creada',
      codigo: data.codigo,
      nombre: data.nombre,
    })

    revalidateCommonPaths()
    revalidatePath('/pdvs')
    revalidatePath('/clientes')

    return buildState({
      ok: true,
      message: cadenaId ? 'Cadena actualizada.' : 'Cadena creada.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar la cadena.',
    })
  }
}

export async function guardarCiudad(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const ciudadId = normalizeOptionalText(formData.get('ciudad_id'))
    const nombre = normalizeCatalogText(formData.get('nombre'), 'Ciudad')
    const estadoCapturado = normalizeOptionalText(formData.get('estado'))
    const estadoDerivado = resolveMexicoStateFromCity(nombre)
    const estado = estadoCapturado
      ? normalizeCatalogText(estadoCapturado, 'Estado')
      : estadoDerivado

    if (!estado) {
      return buildState({
        message: 'No fue posible derivar el estado. Capturalo manualmente para esta ciudad.',
      })
    }

    const payload = {
      nombre,
      zona: normalizeCatalogText(formData.get('zona'), 'Zona'),
      estado,
      activa: normalizeBoolean(formData.get('activa')),
      updated_at: new Date().toISOString(),
    }

    const query = ciudadId
      ? service.from('ciudad').update(payload).eq('id', ciudadId)
      : service.from('ciudad').insert(payload)

    const { data, error } = await query.select('id, nombre, zona, estado').maybeSingle()

    if (error || !data) {
      return buildState({ message: error?.message ?? 'No fue posible guardar la ciudad.' })
    }

    await registrarEventoAudit(service, actor.usuarioId, 'ciudad', data.id, {
      evento: ciudadId ? 'configuracion_ciudad_actualizada' : 'configuracion_ciudad_creada',
      nombre: data.nombre,
      zona: data.zona,
      estado: data.estado,
    })

    revalidateCommonPaths()
    revalidatePath('/pdvs')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: ciudadId ? 'Ciudad actualizada.' : 'Ciudad creada.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar la ciudad.',
    })
  }
}

export async function guardarTurnoCatalogo(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const previousCode = normalizeOptionalText(formData.get('turno_original'))
    const nomenclatura = normalizeCode(formData.get('nomenclatura'), 'Nomenclatura')
    const turno = normalizeOptionalText(formData.get('turno'))
    const horario = normalizeOptionalText(formData.get('horario'))
    const horaEntrada = normalizeTime(formData.get('hora_entrada'), 'Hora entrada')
    const horaSalida = normalizeTime(formData.get('hora_salida'), 'Hora salida')

    if ((horaEntrada && !horaSalida) || (!horaEntrada && horaSalida)) {
      return buildState({
        message: 'Hora entrada y hora salida deben capturarse juntas.',
      })
    }

    const currentRow = await obtenerConfiguracion(service, TURNOS_CONFIG_KEY)
    const turnos = parseTurnosCatalogo(currentRow?.valor)
    const duplicate = turnos.find(
      (item) => item.nomenclatura === nomenclatura && item.nomenclatura !== previousCode
    )

    if (duplicate) {
      return buildState({ message: `La nomenclatura ${nomenclatura} ya existe en el catalogo.` })
    }

    const nextItem: TurnoCatalogoItem = {
      nomenclatura,
      turno,
      horario,
      horaEntrada,
      horaSalida,
    }

    const nextCatalog = [
      ...turnos.filter((item) => item.nomenclatura !== (previousCode ?? nomenclatura)),
      nextItem,
    ].sort((left, right) => left.nomenclatura.localeCompare(right.nomenclatura, 'es-MX'))

    const savedRow = await upsertConfiguracion(service, {
      key: TURNOS_CONFIG_KEY,
      value: serializeTurnosCatalogo(nextCatalog),
      description: 'Catalogo de turnos heredables por PDV y cadena para operacion retail.',
      module: 'asistencias',
    })

    await registrarEventoAudit(service, actor.usuarioId, 'configuracion', savedRow.id, {
      evento: previousCode ? 'configuracion_turno_actualizado' : 'configuracion_turno_creado',
      nomenclatura,
    })

    revalidateCommonPaths()
    revalidatePath('/pdvs')

    return buildState({
      ok: true,
      message: previousCode ? 'Turno actualizado.' : 'Turno agregado al catalogo.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar el turno.',
    })
  }
}

export async function eliminarTurnoCatalogo(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const nomenclatura = normalizeRequiredText(formData.get('nomenclatura'), 'Nomenclatura')
    const currentRow = await obtenerConfiguracion(service, TURNOS_CONFIG_KEY)
    const turnos = parseTurnosCatalogo(currentRow?.valor)
    const nextCatalog = turnos.filter((item) => item.nomenclatura !== nomenclatura)

    if (nextCatalog.length === turnos.length) {
      return buildState({ message: 'El turno no existe en el catalogo.' })
    }

    const savedRow = await upsertConfiguracion(service, {
      key: TURNOS_CONFIG_KEY,
      value: serializeTurnosCatalogo(nextCatalog),
      description: 'Catalogo de turnos heredables por PDV y cadena para operacion retail.',
      module: 'asistencias',
    })

    await registrarEventoAudit(service, actor.usuarioId, 'configuracion', savedRow.id, {
      evento: 'configuracion_turno_eliminado',
      nomenclatura,
    })

    revalidateCommonPaths()
    revalidatePath('/pdvs')

    return buildState({ ok: true, message: 'Turno eliminado del catalogo.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible eliminar el turno.',
    })
  }
}

export async function guardarParametroConfiguracion(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const key = normalizeRequiredText(formData.get('key'), 'Parametro')
    const definition = EDITABLE_PARAMETER_DEFINITION_MAP.get(key)

    if (!definition) {
      return buildState({ message: 'El parametro solicitado no es editable desde este modulo.' })
    }

    const value = coerceEditableConfigValue(definition, formData.get('value'))
    const savedRow = await upsertConfiguracion(service, {
      key,
      value,
      description: definition.description,
      module: definition.module,
    })

    await registrarEventoAudit(service, actor.usuarioId, 'configuracion', savedRow.id, {
      evento: 'configuracion_parametro_actualizado',
      clave: key,
      valor: value,
    })

    revalidatePathsByConfigKey(key)

    return buildState({ ok: true, message: `${definition.label} actualizado.` })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar el parametro.',
    })
  }
}

export async function guardarMisionDia(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const misionId = normalizeOptionalText(formData.get('mision_id'))
    const payload = {
      codigo: normalizeOptionalText(formData.get('codigo'))?.toUpperCase() ?? null,
      instruccion: normalizeRequiredText(formData.get('instruccion'), 'Instruccion'),
      orden: normalizeOptionalInteger(formData.get('orden')),
      peso: normalizeOptionalInteger(formData.get('peso')) ?? 1,
      activa: normalizeBoolean(formData.get('activa')),
      updated_at: new Date().toISOString(),
    }

    if (payload.peso < 1) {
      return buildState({ message: 'El peso de la mision debe ser al menos 1.' })
    }

    const query = misionId
      ? service.from('mision_dia').update(payload).eq('id', misionId)
      : service.from('mision_dia').insert(payload)

    const { data, error } = await query.select('id, codigo, instruccion').maybeSingle()

    if (error || !data) {
      return buildState({ message: error?.message ?? 'No fue posible guardar la mision.' })
    }

    await registrarEventoAudit(service, actor.usuarioId, 'mision_dia', data.id, {
      evento: misionId ? 'configuracion_mision_actualizada' : 'configuracion_mision_creada',
      codigo: data.codigo,
      instruccion: data.instruccion,
    })

    revalidateCommonPaths()
    revalidatePath('/asistencias')

    return buildState({
      ok: true,
      message: misionId ? 'Mision actualizada.' : 'Mision creada.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar la mision.',
    })
  }
}

export async function guardarOcrConfiguracion(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const provider = normalizeRequiredText(formData.get('provider'), 'Proveedor').toLowerCase()
    const model = normalizeOptionalText(formData.get('model'))
    const allowedProviders = new Set(OCR_PROVIDER_OPTIONS.map((item) => item.value))

    if (!allowedProviders.has(provider as (typeof OCR_PROVIDER_OPTIONS)[number]['value'])) {
      return buildState({ message: 'El proveedor OCR seleccionado no es valido.' })
    }

    const providerRow = await upsertConfiguracion(service, {
      key: OCR_PROVIDER_CONFIG_KEY,
      value: provider,
      description: 'Proveedor OCR preferido desde configuracion central.',
      module: 'integraciones',
    })
    const modelRow = await upsertConfiguracion(service, {
      key: OCR_MODEL_CONFIG_KEY,
      value: provider === 'gemini' ? model ?? 'gemini-2.5-flash' : '',
      description: 'Modelo OCR preferido para el proveedor configurado.',
      module: 'integraciones',
    })

    await registrarEventoAudit(service, actor.usuarioId, 'configuracion', providerRow.id, {
      evento: 'configuracion_ocr_actualizada',
      provider,
      model: provider === 'gemini' ? model ?? 'gemini-2.5-flash' : null,
    })
    await registrarEventoAudit(service, actor.usuarioId, 'configuracion', modelRow.id, {
      evento: 'configuracion_ocr_model_actualizado',
      provider,
      model: provider === 'gemini' ? model ?? 'gemini-2.5-flash' : null,
    })

    revalidatePathsByConfigKey('integraciones.ocr')

    return buildState({
      ok: true,
      message:
        provider === 'gemini'
          ? 'Configuracion OCR actualizada. Gemini requiere GEMINI_API_KEY activa en el servidor.'
          : provider === 'disabled'
            ? 'OCR documental deshabilitado desde configuracion central.'
            : `Proveedor ${provider} guardado. Aun requiere implementacion runtime.`,
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar la configuracion OCR.',
    })
  }
}

export async function guardarPdfCompressionConfiguracion(
  _prevState: ConfiguracionAdminActionState,
  formData: FormData
): Promise<ConfiguracionAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const provider = normalizeRequiredText(formData.get('provider'), 'Proveedor').toLowerCase()
    const baseUrl = normalizeOptionalText(formData.get('stirling_base_url'))
    const optimizeLevel = normalizeIntegerInRange(
      formData.get('optimize_level'),
      'Nivel de optimizacion',
      0,
      4
    )
    const imageQuality = normalizeIntegerInRange(
      formData.get('image_quality'),
      'Calidad de imagen',
      10,
      100
    )
    const imageDpi = normalizeIntegerInRange(formData.get('image_dpi'), 'DPI de imagen', 72, 600)
    const fastWebView = normalizeBoolean(formData.get('fast_web_view'))
    const allowedProviders = new Set(PDF_COMPRESSION_PROVIDER_OPTIONS.map((item) => item.value))

    if (
      !allowedProviders.has(
        provider as (typeof PDF_COMPRESSION_PROVIDER_OPTIONS)[number]['value']
      )
    ) {
      return buildState({ message: 'El proveedor PDF seleccionado no es valido.' })
    }

    if (provider === 'stirling' && !baseUrl) {
      return buildState({
        message: 'Stirling PDF requiere una URL base para quedar disponible.',
      })
    }

    const providerRow = await upsertConfiguracion(service, {
      key: PDF_COMPRESSION_PROVIDER_CONFIG_KEY,
      value: provider,
      description: 'Proveedor preferido para compresion PDF documental.',
      module: 'integraciones',
    })
    await upsertConfiguracion(service, {
      key: PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY,
      value: baseUrl ?? '',
      description: 'URL base del servicio Stirling PDF para compresion documental.',
      module: 'integraciones',
    })
    await upsertConfiguracion(service, {
      key: PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY,
      value: optimizeLevel,
      description: 'Nivel de optimizacion aplicado por Stirling PDF.',
      module: 'integraciones',
    })
    await upsertConfiguracion(service, {
      key: PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY,
      value: imageQuality,
      description: 'Calidad JPEG interna usada por Stirling PDF al recomprimir imagenes.',
      module: 'integraciones',
    })
    await upsertConfiguracion(service, {
      key: PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY,
      value: imageDpi,
      description: 'DPI objetivo para imagenes internas en PDFs comprimidos.',
      module: 'integraciones',
    })
    await upsertConfiguracion(service, {
      key: PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY,
      value: fastWebView,
      description: 'Activa fast web view en PDFs procesados por Stirling.',
      module: 'integraciones',
    })

    await registrarEventoAudit(service, actor.usuarioId, 'configuracion', providerRow.id, {
      evento: 'configuracion_pdf_compression_actualizada',
      provider,
      stirling_base_url: baseUrl,
      optimize_level: optimizeLevel,
      image_quality: imageQuality,
      image_dpi: imageDpi,
      fast_web_view: fastWebView,
    })

    revalidatePathsByConfigKey('integraciones.pdf')

    return buildState({
      ok: true,
      message:
        provider === 'stirling'
          ? 'Compresion PDF central actualizada. El API key de Stirling sigue gobernado por variables de entorno.'
          : 'Compresion PDF local activada desde configuracion central.',
    })
  } catch (error) {
    return buildState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la configuracion de compresion PDF.',
    })
  }
}
