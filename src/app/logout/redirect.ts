type HeaderReader = {
  get(name: string): string | null
}

type LogoutRequestLike = {
  url: string
  headers: HeaderReader
}

function isInvalidBrowserHostname(hostname: string) {
  return hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]'
}

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() ?? null
}

function buildUrlFromHost(host: string, protocol: string) {
  return new URL(`${protocol}://${host}`)
}

function sanitizeBrowserUrl(url: URL) {
  if (isInvalidBrowserHostname(url.hostname)) {
    url.hostname = 'localhost'
  }

  return url
}

export function resolveLogoutRedirectUrl(request: LogoutRequestLike) {
  const requestUrl = new URL(request.url)
  const protocol = firstHeaderValue(request.headers.get('x-forwarded-proto')) ?? requestUrl.protocol.replace(':', '')
  const originHeader = firstHeaderValue(request.headers.get('origin'))

  if (originHeader) {
    return new URL('/login', sanitizeBrowserUrl(new URL(originHeader)))
  }

  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'))
  if (forwardedHost) {
    return new URL('/login', sanitizeBrowserUrl(buildUrlFromHost(forwardedHost, protocol)))
  }

  const hostHeader = firstHeaderValue(request.headers.get('host'))
  if (hostHeader) {
    return new URL('/login', sanitizeBrowserUrl(buildUrlFromHost(hostHeader, protocol)))
  }

  return new URL('/login', sanitizeBrowserUrl(requestUrl))
}
