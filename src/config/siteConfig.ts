export interface SiteConfig {
  appName: string
  appDescription: string
  locale: string
  seo: {
    siteTitle: string
    defaultDescription: string
    locale: string
  }
}

export const siteConfig: SiteConfig = {
  appName: 'Beteele One',
  appDescription:
    'Plataforma operativa para ISDIN con control de campo, ventas, nomina y trazabilidad.',
  locale: 'es_MX',
  seo: {
    siteTitle: 'Beteele One | ISDIN',
    defaultDescription:
      'Operacion retail de ISDIN con control diario, evidencias y seguimiento centralizado.',
    locale: 'es_MX',
  },
}
