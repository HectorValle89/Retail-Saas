import type { Metadata } from 'next'
import { siteConfig } from '@/config/siteConfig'
import { SectionHeading } from '@/components/public/SectionHeading'
import { ServiceIcon } from '@/components/public/icons'
import Link from 'next/link'

export const metadata: Metadata = {
  title: siteConfig.seo.titleTemplate.replace('%s', 'Servicios Legales'),
  description: `Conozca nuestros servicios de derecho de familia: ${siteConfig.services.map(s => s.title).join(', ')}. ${siteConfig.firmName} en ${siteConfig.contact.city}.`,
}

export default function ServiciosPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-teal-800 to-teal-700 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Áreas de Práctica"
            title="Nuestros Servicios Legales"
            subtitle={`En ${siteConfig.firmName} ofrecemos una amplia gama de servicios de derecho de familia para proteger lo que más importa.`}
            light
          />
        </div>
      </section>

      {/* Services */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-16">
            {siteConfig.services.map((service, index) => (
              <div
                key={service.slug}
                id={service.slug}
                className="scroll-mt-24"
              >
                <div className={`flex flex-col lg:flex-row gap-10 items-start ${index % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
                  {/* Icon block */}
                  <div className="shrink-0 w-full lg:w-80">
                    <div className="bg-teal-50 rounded-2xl p-10 flex items-center justify-center">
                      <ServiceIcon icon={service.icon} className="w-20 h-20 text-teal-600" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h2 className="font-heading text-display-sm md:text-display-md text-gray-900 mb-4">
                      {service.title}
                    </h2>
                    <p className="text-body-lg text-foreground-secondary leading-relaxed mb-6">
                      {service.fullDescription}
                    </p>
                    <Link
                      href="/contacto"
                      className="inline-flex items-center bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-body-sm"
                    >
                      Consultar sobre {service.title}
                      <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>

                {index < siteConfig.services.length - 1 && (
                  <hr className="mt-16 border-gray-100" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-teal-900 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-heading text-display-sm text-white mb-4">
            &iquest;Necesita asesor&iacute;a legal?
          </h2>
          <p className="text-body-lg text-teal-200 mb-8">
            Agende su consulta gratuita hoy y permítanos ayudarle a proteger sus derechos.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/contacto"
              className="bg-secondary-500 hover:bg-secondary-600 text-white font-bold px-8 py-4 rounded-lg transition-colors uppercase tracking-wider text-body-sm"
            >
              Agendar Consulta
            </Link>
            <a
              href={`tel:${siteConfig.contact.phone}`}
              className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-lg transition-colors border border-white/20"
            >
              Llamar al {siteConfig.contact.phoneDisplay}
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
