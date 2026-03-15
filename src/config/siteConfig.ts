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
  appName: 'Field Force Platform',
  appDescription:
    'Plataforma enterprise para gestion de personal retail, supervision en campo, asistencia, ventas, nomina y auditoria.',
  locale: 'es_MX',
  seo: {
    siteTitle: 'Field Force Platform | Retail',
    defaultDescription:
      'Gestion corporativa de personal retail con foco en operacion, trazabilidad, supervision y crecimiento escalable.',
    locale: 'es_MX',
  },
}
