import type { Metadata } from 'next'
import { siteConfig } from '@/config/siteConfig'

export const metadata: Metadata = {
  title: siteConfig.seo.titleTemplate.replace('%s', 'Política de Privacidad'),
  description: `Política de privacidad de ${siteConfig.firmName}.`,
}

export default function PrivacidadPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-teal-800 to-teal-700 py-12 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-display-md text-white">Política de Privacidad</h1>
          <p className="text-teal-200 mt-2 text-body-md">
            Última actualización: {new Date(siteConfig.legal.privacyLastUpdated).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-gray max-w-none">
          <div className="space-y-8 text-foreground-secondary text-body-md leading-relaxed">
            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">1. Información que Recopilamos</h2>
              <p>
                En {siteConfig.firmName}, recopilamos información personal que usted nos proporciona voluntariamente cuando se comunica con nosotros a través de nuestro sitio web, por teléfono o en persona. Esta información puede incluir:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li>Nombre completo</li>
                <li>Dirección de correo electrónico</li>
                <li>Número de teléfono</li>
                <li>Información relacionada con su caso legal</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">2. Uso de la Información</h2>
              <p>La información que recopilamos se utiliza para:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li>Responder a sus consultas y solicitudes de información</li>
                <li>Programar citas y consultas legales</li>
                <li>Proporcionarle servicios legales profesionales</li>
                <li>Comunicarnos con usted sobre su caso</li>
                <li>Mejorar nuestros servicios</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">3. Protección de Datos</h2>
              <p>
                Implementamos medidas de seguridad técnicas y organizativas apropiadas para proteger su información personal contra el acceso no autorizado, la alteración, divulgación o destrucción. Toda la información proporcionada está protegida por el secreto profesional abogado-cliente conforme a las leyes de {siteConfig.contact.country}.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">4. Confidencialidad</h2>
              <p>
                Como bufete de abogados, estamos obligados por el deber de confidencialidad profesional. Toda la información que comparta con nosotros está protegida por el privilegio abogado-cliente y no será divulgada a terceros sin su consentimiento expreso, salvo cuando la ley lo requiera.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">5. Cookies y Tecnologías de Seguimiento</h2>
              <p>
                Nuestro sitio web puede utilizar cookies y tecnologías similares para mejorar su experiencia de navegación. Estas cookies no recopilan información personal identificable.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">6. Sus Derechos</h2>
              <p>Usted tiene derecho a:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li>Acceder a su información personal</li>
                <li>Solicitar la corrección de datos inexactos</li>
                <li>Solicitar la eliminación de sus datos</li>
                <li>Oponerse al procesamiento de sus datos</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">7. Contacto</h2>
              <p>
                Si tiene preguntas sobre esta política de privacidad o sobre cómo manejamos su información personal, puede contactarnos en:
              </p>
              <p className="mt-3">
                <strong>{siteConfig.firmName}</strong><br />
                {siteConfig.contact.address}, {siteConfig.contact.city}, {siteConfig.contact.country}<br />
                Email: <a href={`mailto:${siteConfig.contact.email}`} className="text-teal-600 hover:underline">{siteConfig.contact.email}</a><br />
                Teléfono: <a href={`tel:${siteConfig.contact.phone}`} className="text-teal-600 hover:underline">{siteConfig.contact.phoneDisplay}</a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
