import type { Metadata } from 'next'
import Link from 'next/link'
import { siteConfig } from '@/config/siteConfig'
import { SectionHeading } from '@/components/public/SectionHeading'

export const metadata: Metadata = {
  title: siteConfig.seo.titleTemplate.replace('%s', 'Equipo Legal'),
  description: `Conozca al equipo legal de ${siteConfig.firmName}. Abogados experimentados en derecho de familia en ${siteConfig.contact.city}, ${siteConfig.contact.country}.`,
}

export default function EquipoPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-teal-800 to-teal-700 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Nuestro Equipo"
            title="Equipo Legal"
            subtitle={`Conozca a los profesionales comprometidos con proteger los derechos de su familia.`}
            light
          />
        </div>
      </section>

      {/* Team members */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-20">
            {siteConfig.team.map((member, index) => {
              const initials = member.name.split(' ').map(n => n[0]).join('')
              return (
                <div
                  key={index}
                  className={`flex flex-col lg:flex-row gap-10 items-center ${index % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}
                >
                  {/* Photo / Placeholder */}
                  <div className="shrink-0">
                    {member.imageUrl ? (
                      <img
                        src={member.imageUrl}
                        alt={member.name}
                        className="w-64 h-64 lg:w-80 lg:h-80 rounded-2xl object-cover shadow-elevated"
                      />
                    ) : (
                      <div className="w-64 h-64 lg:w-80 lg:h-80 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center shadow-elevated">
                        <span className="text-7xl font-heading font-bold text-white/30">{initials}</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-center lg:text-left">
                    <h2 className="font-heading text-display-sm md:text-display-md text-gray-900 mb-1">
                      {member.name}
                    </h2>
                    <p className="text-body-lg text-teal-600 font-semibold mb-4">{member.title}</p>
                    <p className="text-body-md text-foreground-secondary leading-relaxed mb-6">
                      {member.bio}
                    </p>

                    {/* Specialties */}
                    <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-6">
                      {member.specialties.map((spec) => (
                        <span
                          key={spec}
                          className="bg-teal-50 text-teal-700 text-body-xs font-medium px-3 py-1.5 rounded-full"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>

                    {member.bookingSlug && (
                      <Link
                        href={`/book/${member.bookingSlug}`}
                        className="inline-flex items-center bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-body-sm"
                      >
                        Agendar con {member.name.split(' ')[0]}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* About firm section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading text-display-sm text-gray-900 mb-4">
            Sobre {siteConfig.firmName}
          </h2>
          <p className="text-body-lg text-foreground-secondary leading-relaxed mb-8">
            {siteConfig.firmDescription}
          </p>
          <Link
            href="/contacto"
            className="inline-flex items-center bg-teal-600 hover:bg-teal-700 text-white font-bold px-8 py-4 rounded-lg transition-colors uppercase tracking-wider text-body-sm"
          >
            Contáctenos
          </Link>
        </div>
      </section>
    </>
  )
}
