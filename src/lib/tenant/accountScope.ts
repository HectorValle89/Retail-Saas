import { cookies, headers } from 'next/headers'

export const ACTIVE_ACCOUNT_COOKIE = 'ff_active_cuenta_cliente_id'
export const ACTIVE_ACCOUNT_HEADER = 'x-retail-active-account-id'
export const ACTIVE_ACCOUNT_SCOPE_HEADER = 'x-retail-account-scope'

export interface AccountScopeOption {
  id: string
  identificador: string
  nombre: string
  activa: boolean
}

export interface AccountScopeData {
  enabled: boolean
  currentAccountId: string | null
  currentAccountLabel: string
  options: AccountScopeOption[]
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SCOPED_TABLES = new Set([
  'asignacion',
  'asistencia',
  'venta',
  'cuota_empleado_periodo',
  'nomina_ledger',
  'audit_log',
  'cuenta_cliente_pdv',
  'dashboard_kpis',
])

function normalizeAccountId(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function readTableFromRestUrl(url: URL) {
  const marker = '/rest/v1/'
  const index = url.pathname.indexOf(marker)

  if (index === -1) {
    return null
  }

  const resource = url.pathname.slice(index + marker.length)
  const [table] = resource.split('/')
  return table ? decodeURIComponent(table) : null
}

function applyAccountFilterToRestUrl(url: URL, accountId: string) {
  const table = readTableFromRestUrl(url)

  if (!table || !SCOPED_TABLES.has(table)) {
    return url
  }

  if (!url.searchParams.has('cuenta_cliente_id')) {
    url.searchParams.append('cuenta_cliente_id', `eq.${accountId}`)
  }

  return url
}

export function createTenantScopedFetch(
  accountId: string | null,
  baseFetch: typeof fetch = fetch
) {
  const normalizedAccountId = normalizeAccountId(accountId)

  if (!normalizedAccountId) {
    return baseFetch
  }

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const scopedUrl = applyAccountFilterToRestUrl(new URL(request.url), normalizedAccountId)

    if (scopedUrl.toString() === request.url) {
      return baseFetch(request)
    }

    return baseFetch(new Request(scopedUrl, request))
  }
}

export async function readRequestAccountScope() {
  const requestHeaders = await headers()
  const cookieStore = await cookies()

  return {
    accountId:
      normalizeAccountId(requestHeaders.get(ACTIVE_ACCOUNT_HEADER)) ??
      normalizeAccountId(cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value) ??
      null,
    scope:
      requestHeaders.get(ACTIVE_ACCOUNT_SCOPE_HEADER) === 'scoped' ? 'scoped' : 'global',
  }
}

export function normalizeRequestedAccountId(value: unknown) {
  return normalizeAccountId(typeof value === 'string' ? value : null)
}
