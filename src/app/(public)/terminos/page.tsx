import type { Metadata } from 'next'
import { siteConfig } from '@/config/siteConfig'

export const metadata: Metadata = {
  title: siteConfig.seo.titleTemplate.replace('%s', 'Términos de Servicio'),
  description: `Términos de servicio de ${siteConfig.firmName}.`,
}

export default function TerminosPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-teal-800 to-teal-700 py-12 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-display-md text-white">Términos de Servicio</h1>
          <p className="text-teal-200 mt-2 text-body-md">
            Última actualización: {new Date(siteConfig.legal.termsLastUpdated).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8 text-foreground-secondary text-body-md leading-relaxed">
            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">1. Aceptación de los Términos</h2>
              <p>
                Al acceder y utilizar el sitio web de {siteConfig.firmName}, usted acepta estar sujeto a estos términos de servicio. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestro sitio web.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">2. Servicios Legales</h2>
              <p>
                La información proporcionada en este sitio web es de carácter general e informativo. No constituye asesoramiento legal. La relación abogado-cliente solo se establece mediante un acuerdo formal de servicios legales firmado por ambas partes.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">3. Consultas y Comunicaciones</h2>
              <p>
                Las consultas realizadas a través de nuestro formulario de contacto o por correo electrónico no establecen una relación abogado-cliente. La información compartida a través de estos medios puede no estar protegida por el privilegio de confidencialidad hasta que se formalice la relación profesional.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">4. Programación de Citas</h2>
              <p>
                Las citas programadas a través de nuestro sistema están sujetas a disponibilidad. Nos reservamos el derecho de reprogramar o cancelar citas cuando sea necesario. Le notificaremos con la mayor anticipación posible en caso de cambios.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">5. Propiedad Intelectual</h2>
              <p>
                Todo el contenido de este sitio web, incluyendo textos, gráficos, logotipos e imágenes, es propiedad de {siteConfig.firmName} y está protegido por las leyes de propiedad intelectual de {siteConfig.contact.country}.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">6. Limitación de Responsabilidad</h2>
              <p>
                {siteConfig.firmName} no será responsable de daños directos, indirectos, incidentales o consecuentes que resulten del uso de este sitio web. Los resultados de casos anteriores no garantizan resultados futuros similares.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">7. Ley Aplicable</h2>
              <p>
                Estos términos se rigen por las leyes de la República de {siteConfig.contact.country}. Cualquier disputa será resuelta ante los tribunales competentes de {siteConfig.contact.city}.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">8. Modificaciones</h2>
              <p>
                Nos reservamos el derecho de modificar estos términos en cualquier momento. Las modificaciones entrarán en vigor inmediatamente después de su publicación en este sitio web.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-display-xs text-gray-900 mb-3">9. Contacto</h2>
              <p>
                Para preguntas sobre estos términos de servicio, contáctenos en:
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
