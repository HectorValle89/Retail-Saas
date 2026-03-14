import Link from 'next/link'
import { siteConfig } from '@/config/siteConfig'
import { SectionHeading } from './SectionHeading'
import { MapPinIcon, PhoneIcon, MailIcon, ClockIcon } from './icons'

export function ContactSection() {
  const { contact } = siteConfig

  return (
    <section className="py-20 lg:py-28 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Nuestro equipo est&aacute; aqu&iacute; para ayudar."
          subtitle="&iquest;Tiene alguna pregunta o desea programar una cita? Cont&aacute;ctenos."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mt-14">
          {/* Map */}
          <div className="rounded-2xl overflow-hidden shadow-elevated h-[400px]">
            <iframe
              src={contact.googleMapsEmbedUrl}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Ubicación de ${siteConfig.firmName}`}
            />
          </div>

          {/* Contact info cards */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                  <MapPinIcon className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-gray-900 mb-1">Ubicación de la Oficina</h3>
                  <p className="text-body-sm text-foreground-secondary">{contact.address}</p>
                  <p className="text-body-sm text-foreground-secondary">{contact.city}, {contact.country}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                  <PhoneIcon className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-gray-900 mb-1">Datos de Contacto</h3>
                  <p className="text-body-sm text-foreground-secondary">
                    Llame al <a href={`tel:${contact.phone}`} className="text-teal-600 hover:underline">{contact.phoneDisplay}</a> o envíe un correo electrónico a{' '}
                    <a href={`mailto:${contact.email}`} className="text-teal-600 hover:underline">{contact.email}</a>
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                  <ClockIcon className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-gray-900 mb-1">Horario Comercial</h3>
                  <p className="text-body-sm text-foreground-secondary">{contact.officeHours}</p>
                </div>
              </div>
            </div>

            <Link
              href="/contacto"
              className="block w-full text-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 rounded-xl transition-colors text-body-md uppercase tracking-wider"
            >
              Enviar Mensaje
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
