import Link from 'next/link'
import { siteConfig } from '@/config/siteConfig'

export function AboutSection() {
  const { founderName, founderTitle, founderBio, yearsExperience, firmName } = siteConfig
  const initials = founderName.split(' ').map(n => n[0]).join('')

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Image / Placeholder */}
          <div className="relative">
            <div className="aspect-[4/5] rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center overflow-hidden shadow-elevated">
              <span className="text-8xl font-heading font-bold text-white/30">{initials}</span>
            </div>
            {/* Experience badge */}
            <div className="absolute -bottom-5 -right-5 md:bottom-8 md:-right-6 bg-white rounded-2xl shadow-elevated p-5 border border-gray-100">
              <span className="block font-heading text-display-md text-teal-600 font-bold">{yearsExperience}+</span>
              <span className="text-body-sm text-foreground-secondary">Años</span>
            </div>
          </div>

          {/* Content */}
          <div>
            <p className="text-body-sm font-semibold uppercase tracking-widest text-teal-600 mb-3">
              Derecho de Familia de {firmName.split(' ')[0]}
            </p>
            <h2 className="font-heading text-display-md md:text-display-lg text-gray-900 mb-6">
              Somos una firma de{' '}
              <span className="text-teal-600">derecho de familia</span>{' '}
              en {siteConfig.contact.city}, {siteConfig.contact.country}.
            </h2>
            <p className="text-body-lg text-foreground-secondary leading-relaxed mb-8">
              {founderBio}
            </p>

            {/* Founder card */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-white">{initials}</span>
              </div>
              <div>
                <p className="font-heading font-semibold text-gray-900">{founderName}</p>
                <p className="text-body-sm text-teal-600">{founderTitle}</p>
              </div>
            </div>

            <Link
              href="/equipo"
              className="inline-flex items-center mt-6 text-teal-600 hover:text-teal-700 font-semibold transition-colors"
            >
              Conocer al equipo
              <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
