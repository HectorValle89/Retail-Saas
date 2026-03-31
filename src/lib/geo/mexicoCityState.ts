const MEXICO_CITY_STATE_ALIASES = new Map<string, string>([
  ['AGUASCALIENTES', 'AGUASCALIENTES'],
  ['CANCUN', 'QUINTANA ROO'],
  ['CANCUN QUINTANA ROO', 'QUINTANA ROO'],
  ['CDMX', 'CIUDAD DE MEXICO'],
  ['ATIZAPAN DE ZARAGOZA', 'ESTADO DE MEXICO'],
  ['CIUDAD LOPEZ MATEOS', 'ESTADO DE MEXICO'],
  ['CIUDAD DE MEXICO', 'CIUDAD DE MEXICO'],
  ['COAHUILA', 'COAHUILA'],
  ['COYOACAN', 'CIUDAD DE MEXICO'],
  ['CULIACAN', 'SINALOA'],
  ['CULIACAN ROSALES', 'SINALOA'],
  ['CUAJIMALPA DE MORELOS', 'CIUDAD DE MEXICO'],
  ['CUERNAVACA', 'MORELOS'],
  ['GUADALAJARA', 'JALISCO'],
  ['GUANAJUATO', 'GUANAJUATO'],
  ['HERMOSILLO', 'SONORA'],
  ['HEROICA PUEBLA DE ZARAGOZA', 'PUEBLA'],
  ['IRAPUATO', 'GUANAJUATO'],
  ['LEON', 'GUANAJUATO'],
  ['LEON DE LOS ALDAMA', 'GUANAJUATO'],
  ['LOS MOCHIS', 'SINALOA'],
  ['MAZATLAN', 'SINALOA'],
  ['MERIDA', 'YUCATAN'],
  ['MEXICO CITY', 'CIUDAD DE MEXICO'],
  ['MONTERREY', 'NUEVO LEON'],
  ['MOCHIS', 'SINALOA'],
  ['NICOLAS ROMERO', 'ESTADO DE MEXICO'],
  ['OAXACA', 'OAXACA'],
  ['OAXACA DE JUAREZ', 'OAXACA'],
  ['PUEBLA', 'PUEBLA'],
  ['PUEBLA DE ZARAGOZA', 'PUEBLA'],
  ['QUERETARO', 'QUERETARO'],
  ['REYNOSA', 'TAMAULIPAS'],
  ['SAN FRANCISCO DEL RINCON', 'GUANAJUATO'],
  ['SANTIAGO DE QUERETARO', 'QUERETARO'],
  ['TAMPICO', 'TAMAULIPAS'],
  ['TIJUANA', 'BAJA CALIFORNIA'],
  ['TLALNEPANTLA', 'ESTADO DE MEXICO'],
  ['TLALNEPANTLA DE BAZ', 'ESTADO DE MEXICO'],
  ['TOLUCA', 'ESTADO DE MEXICO'],
  ['TOLUCA DE LERDO', 'ESTADO DE MEXICO'],
  ['AZCAPOTZALCO', 'CIUDAD DE MEXICO'],
])

export function normalizeMexicoCatalogText(value: string | null | undefined) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

  return normalized || null
}

export function resolveMexicoStateFromCity(cityName: string | null | undefined) {
  const normalized = normalizeMexicoCatalogText(cityName)
  if (!normalized) {
    return null
  }

  return MEXICO_CITY_STATE_ALIASES.get(normalized) ?? null
}
