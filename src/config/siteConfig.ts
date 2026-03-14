// ============================================================
// SITE CONFIG - Template Reutilizable para Bufetes de Abogados
// ============================================================
// Para personalizar para un nuevo cliente:
// 1. Cambiar firmName, founderName, contact, services, team, testimonials
// 2. Agregar URLs de imágenes reales en los campos imageUrl
// 3. Ajustar theme.primaryColor si se desea otro color
// 4. Deploy
// ============================================================

export interface ServiceItem {
  icon: 'divorce' | 'custody' | 'alimony' | 'mediation' | 'domestic-violence' | 'separation' | 'contracts' | 'corporate' | 'real-estate' | 'criminal' | 'immigration' | 'labor' | 'custom'
  title: string
  slug: string
  shortDescription: string
  fullDescription: string
}

export interface TeamMember {
  name: string
  title: string
  bio: string
  specialties: string[]
  imageUrl?: string
  bookingSlug?: string
}

export interface Testimonial {
  name: string
  quote: string
  rating: number
  caseType?: string
}

export interface NavItem {
  label: string
  href: string
  children?: { label: string; href: string }[]
}

export interface SiteConfig {
  firmName: string
  firmSlogan: string
  firmDescription: string
  founderName: string
  founderTitle: string
  founderBio: string
  yearsExperience: number
  yearFounded: number

  contact: {
    phone: string
    phoneDisplay: string
    email: string
    address: string
    city: string
    country: string
    googleMapsEmbedUrl: string
    whatsappNumber?: string
    officeHours: string
  }

  social: {
    facebook?: string
    instagram?: string
    linkedin?: string
    twitter?: string
  }

  navigation: {
    items: NavItem[]
  }

  hero: {
    headline: string
    subheadline: string
    ctaText: string
    ctaHref: string
    backgroundImageUrl?: string
  }

  values: Array<{
    icon: 'respect' | 'quality' | 'team' | 'experience' | 'confidential' | 'results'
    title: string
    description: string
  }>

  services: ServiceItem[]

  tabs: Array<{
    title: string
    content: string
  }>

  team: TeamMember[]

  testimonials: Testimonial[]

  booking: {
    enabled: boolean
    ctaText: string
    mainLawyerSlug?: string
  }

  seo: {
    siteTitle: string
    titleTemplate: string
    defaultDescription: string
    locale: string
    ogImageUrl?: string
  }

  legal: {
    privacyLastUpdated: string
    termsLastUpdated: string
  }

  theme?: {
    primaryColor?: string
    accentColor?: string
  }
}

// ============================================================
// CONFIGURACIÓN: Irene González - Bufete en Managua, Nicaragua
// ============================================================

export const siteConfig: SiteConfig = {
  firmName: 'González & Asociados',
  firmSlogan: 'Nos centramos en las necesidades de su familia',
  firmDescription: 'Bufete de abogados especializado en derecho de familia en Managua, Nicaragua. Representación legal compasiva y efectiva para proteger lo que más importa.',
  founderName: 'Irene González',
  founderTitle: 'Abogada Principal y Fundadora',
  founderBio: 'Con más de 9 años de experiencia en derecho de familia, la Licda. Irene González ha dedicado su carrera a proteger los derechos e intereses de las familias nicaragüenses. Su enfoque combina un profundo conocimiento legal con una genuina empatía hacia cada cliente, asegurando que cada caso reciba la atención personalizada que merece. Fundadora de González & Asociados, lidera un equipo comprometido con brindar soluciones legales integrales que priorizan el bienestar de la familia.',
  yearsExperience: 9,
  yearFounded: 2017,

  contact: {
    phone: '+50522781234',
    phoneDisplay: '+505 2278-1234',
    email: 'contacto@gonzalezabogados.com.ni',
    address: 'Rotonda El Güegüense, 2 cuadras al sur, Edificio Plaza Sur, Oficina 305',
    city: 'Managua',
    country: 'Nicaragua',
    googleMapsEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3902.5!2d-86.27!3d12.13!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDA3JzQ4LjAiTiA4NsKwMTYnMTIuMCJX!5e0!3m2!1ses!2sni!4v1700000000000',
    whatsappNumber: '+50588881234',
    officeHours: 'Lunes a Viernes, 8:00 a.m. a 5:00 p.m.',
  },

  social: {
    facebook: 'https://facebook.com/gonzalezabogadosni',
    instagram: 'https://instagram.com/gonzalezabogadosni',
    linkedin: 'https://linkedin.com/company/gonzalezabogadosni',
  },

  navigation: {
    items: [
      { label: 'Inicio', href: '/' },
      {
        label: 'Derecho de Familia',
        href: '/servicios',
        children: [
          { label: 'Divorcio', href: '/servicios#divorcio' },
          { label: 'Custodia de Menores', href: '/servicios#custodia' },
          { label: 'Pensión Alimenticia', href: '/servicios#pension' },
          { label: 'Mediación Familiar', href: '/servicios#mediacion' },
          { label: 'Violencia Doméstica', href: '/servicios#violencia' },
          { label: 'Separación Legal', href: '/servicios#separacion' },
        ],
      },
      { label: 'Equipo Legal', href: '/equipo' },
      { label: 'Nuestro Enfoque', href: '/#enfoque' },
      { label: 'Contacto', href: '/contacto' },
    ],
  },

  hero: {
    headline: 'Nos centramos en las necesidades de su familia',
    subheadline: 'Representación legal compasiva y efectiva en Managua, Nicaragua. Protegemos lo que más importa para usted y los suyos.',
    ctaText: 'Agendar Consulta',
    ctaHref: '/contacto',
  },

  values: [
    {
      icon: 'respect',
      title: 'Respeto y Dignidad',
      description: 'Nuestros clientes son como una familia. Tratamos cada caso con la dignidad y el respeto que merece.',
    },
    {
      icon: 'quality',
      title: 'Representación Legal del Más Alto Nivel',
      description: 'Cada caso recibe dedicación completa. Nos mantenemos a la vanguardia del derecho de familia en Nicaragua.',
    },
    {
      icon: 'team',
      title: 'Abogados Dedicados y Experimentados',
      description: 'Un equipo experimentado comprometido con alcanzar los mejores resultados para cada cliente.',
    },
  ],

  services: [
    {
      icon: 'separation',
      title: 'Separación Legal',
      slug: 'separacion',
      shortDescription: 'Los acuerdos de separación son una alternativa mutuamente aceptable y duradera para resolver conflictos de pareja.',
      fullDescription: 'La separación legal ofrece una alternativa menos adversarial al divorcio, permitiendo a las parejas establecer acuerdos formales sobre custodia, pensión y distribución de bienes mientras evalúan el futuro de su relación. Nuestro equipo facilita este proceso con sensibilidad y profesionalismo, asegurando que los derechos de ambas partes sean protegidos.',
    },
    {
      icon: 'divorce',
      title: 'Divorcio',
      slug: 'divorcio',
      shortDescription: 'Un divorcio es uno de los aspectos más prácticos del proceso. Podemos ayudarle a navegar cada etapa.',
      fullDescription: 'Entendemos que el divorcio es un momento difícil. Por eso, nos enfocamos en hacer el proceso lo más claro y eficiente posible. Manejamos todos los aspectos legales incluyendo la división de bienes, acuerdos de custodia, pensión alimenticia y modificaciones post-divorcio. Nuestro objetivo es proteger sus intereses mientras minimizamos el impacto emocional y financiero.',
    },
    {
      icon: 'custody',
      title: 'Custodia y Manutención de Menores',
      slug: 'custodia',
      shortDescription: 'Los intereses de los niños son siempre la máxima prioridad. Podemos ayudarle a proteger el papel que usted desempeña en sus vidas.',
      fullDescription: 'La custodia de los hijos es uno de los temas más sensibles en el derecho de familia. Trabajamos incansablemente para proteger los derechos de los padres y, sobre todo, el bienestar de los menores. Manejamos casos de custodia compartida, custodia exclusiva, régimen de visitas y modificaciones de acuerdos existentes.',
    },
    {
      icon: 'alimony',
      title: 'Pensión Alimenticia',
      slug: 'pension',
      shortDescription: 'Lograr la independencia financiera tras un proceso legal. Determinamos el monto justo de pensión.',
      fullDescription: 'La pensión alimenticia es un derecho fundamental para asegurar el bienestar de los hijos y, en algunos casos, del cónyuge. Nuestro equipo evalúa cuidadosamente la situación financiera de ambas partes para establecer montos justos y sostenibles. También manejamos casos de incumplimiento y solicitudes de modificación.',
    },
    {
      icon: 'mediation',
      title: 'Mediación Familiar',
      slug: 'mediacion',
      shortDescription: 'Un enfoque personal para resolver conflictos. La mediación ayuda a encontrar soluciones sin ir a juicio.',
      fullDescription: 'La mediación es una alternativa eficiente y menos conflictiva para resolver disputas familiares. Como mediadores certificados, facilitamos el diálogo entre las partes para alcanzar acuerdos satisfactorios. Este enfoque es especialmente valioso cuando hay hijos involucrados, ya que preserva la relación de co-parentalidad.',
    },
    {
      icon: 'domestic-violence',
      title: 'Violencia Doméstica',
      slug: 'violencia',
      shortDescription: 'Se debe considerar la seguridad ante todo. Estamos aquí para proteger sus derechos y su bienestar.',
      fullDescription: 'La seguridad de nuestros clientes es nuestra prioridad absoluta. Brindamos asistencia legal urgente para obtener medidas de protección, órdenes de restricción y acompañamiento legal integral. Trabajamos en coordinación con organizaciones de apoyo para asegurar que cada persona reciba la protección que necesita.',
    },
  ],

  tabs: [
    {
      title: 'Derecho Colaborativo',
      content: '¿Pueden usted y su cónyuge considerar su problema de derecho de familia como un "problema por resolver" y no como una "competencia por ganar"? El derecho colaborativo es un proceso legal que permite a las parejas que han decidido separarse resolver sus diferencias fuera de los tribunales. Nuestro equipo facilita negociaciones respetuosas para alcanzar acuerdos que satisfagan las necesidades de ambas partes y sus hijos.',
    },
    {
      title: 'Divorcio Absoluto',
      content: 'Cuando la separación definitiva es la mejor opción, nuestro equipo la guía a través de cada etapa del proceso de divorcio en Nicaragua. Nos encargamos de la documentación legal, la distribución equitativa de bienes, los acuerdos de custodia y pensión, asegurando que sus derechos estén protegidos en todo momento. Nuestro enfoque es hacer este proceso lo más eficiente y menos doloroso posible.',
    },
    {
      title: 'Litigio',
      content: 'Para los casos que requieren la intervención judicial, contamos con amplia experiencia en litigio de derecho de familia ante los tribunales de Managua y toda Nicaragua. Nuestros abogados presentan casos sólidos y bien fundamentados, luchando firmemente por los derechos de nuestros clientes. Cuando la negociación no es posible, la preparación y experiencia en el tribunal hacen la diferencia.',
    },
  ],

  team: [
    {
      name: 'Irene González',
      title: 'Abogada Principal y Fundadora',
      bio: 'Especialista en derecho de familia con más de 9 años de experiencia. Licda. González es reconocida por su enfoque compasivo y su dedicación a proteger los derechos de las familias nicaragüenses. Egresada de la Universidad Centroamericana (UCA) con maestría en Derecho de Familia.',
      specialties: ['Derecho de Familia', 'Mediación', 'Derecho Colaborativo'],
    },
    {
      name: 'Roberto Martínez',
      title: 'Abogado Asociado',
      bio: 'Con 6 años de experiencia en litigio familiar, el Lic. Martínez se especializa en casos de custodia y pensión alimenticia. Su enfoque metódico y su compromiso con cada caso han resultado en numerosos resultados favorables para nuestros clientes.',
      specialties: ['Custodia de Menores', 'Pensión Alimenticia', 'Litigio'],
    },
    {
      name: 'Carolina Espinoza',
      title: 'Abogada Asociada',
      bio: 'Especialista en mediación y resolución alternativa de conflictos. La Licda. Espinoza aporta un enfoque único que prioriza el diálogo y la cooperación, logrando acuerdos duraderos que benefician a todas las partes involucradas.',
      specialties: ['Mediación Familiar', 'Violencia Doméstica', 'Derecho Colaborativo'],
    },
  ],

  testimonials: [
    {
      name: 'María L.',
      quote: 'La Licda. González fue la opción perfecta para asesorarme legalmente durante mi divorcio. Escuchó mis preocupaciones, me brindó una opinión honesta y el mejor escenario posible. La recomiendo ampliamente.',
      rating: 5,
      caseType: 'Divorcio',
    },
    {
      name: 'Carlos R.',
      quote: 'Profesionalismo y empatía en cada paso del proceso. El equipo de González & Asociados me ayudó a obtener la custodia compartida de mis hijos. Siempre estuvieron disponibles para responder mis dudas.',
      rating: 5,
      caseType: 'Custodia',
    },
    {
      name: 'Ana P.',
      quote: 'Excelente atención y resultados. La mediación que facilitaron nos permitió llegar a un acuerdo justo sin necesidad de ir a juicio. Un equipo verdaderamente comprometido con el bienestar de la familia.',
      rating: 5,
      caseType: 'Mediación',
    },
    {
      name: 'José M.',
      quote: 'En un momento muy difícil, encontré en González & Asociados el apoyo legal y humano que necesitaba. Su experiencia en pensión alimenticia fue fundamental para proteger los derechos de mis hijos.',
      rating: 5,
      caseType: 'Pensión Alimenticia',
    },
    {
      name: 'Laura S.',
      quote: 'Contraté a la Licda. González para un caso de violencia doméstica. Su rapidez para actuar y su conocimiento de la ley me dieron la protección que necesitaba. Eternamente agradecida.',
      rating: 5,
      caseType: 'Violencia Doméstica',
    },
  ],

  booking: {
    enabled: true,
    ctaText: 'Agendar Consulta Gratuita',
  },

  seo: {
    siteTitle: 'González & Asociados | Derecho de Familia en Managua, Nicaragua',
    titleTemplate: '%s | González & Asociados',
    defaultDescription: 'Bufete de abogados especializado en derecho de familia en Managua, Nicaragua. Divorcio, custodia, pensión alimenticia, mediación. Consulta gratuita.',
    locale: 'es_NI',
  },

  legal: {
    privacyLastUpdated: '2026-01-15',
    termsLastUpdated: '2026-01-15',
  },
}
