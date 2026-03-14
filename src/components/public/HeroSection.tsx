import Link from 'next/link'
import { siteConfig } from '@/config/siteConfig'

export function HeroSection() {
  const { hero } = siteConfig

  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-teal-900 via-teal-800 to-teal-700">
        {/* Decorative pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-teal-500/15 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 lg:py-40">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 bg-teal-400 rounded-full" />
            <span className="text-body-sm text-teal-100">
              Abogados de derecho familiar en {siteConfig.contact.city}, {siteConfig.contact.country}
            </span>
          </div>

          <h1 className="font-heading text-display-lg md:text-display-xl lg:text-display-2xl text-white mb-6 leading-tight">
            {hero.headline}
          </h1>
          <p className="text-body-lg md:text-body-xl text-teal-100 mb-10 max-w-2xl leading-relaxed">
            {hero.subheadline}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href={hero.ctaHref}
              className="inline-flex items-center justify-center bg-secondary-500 hover:bg-secondary-600 text-white font-bold text-body-md px-8 py-4 rounded-lg transition-colors shadow-lg hover:shadow-xl uppercase tracking-wider"
            >
              {hero.ctaText}
            </Link>
            <a
              href={`tel:${siteConfig.contact.phone}`}
              className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold text-body-md px-8 py-4 rounded-lg transition-colors border border-white/20"
            >
              Llame al {siteConfig.contact.phoneDisplay}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
