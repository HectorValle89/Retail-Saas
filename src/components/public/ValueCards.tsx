import { siteConfig } from '@/config/siteConfig'
import { ValueIcon } from './icons'

export function ValueCards() {
  return (
    <section className="relative -mt-12 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {siteConfig.values.map((value, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-elevated p-8 flex items-start gap-4 hover:shadow-modal transition-shadow duration-300 border border-gray-50"
            >
              <div className="shrink-0 w-14 h-14 bg-teal-50 rounded-xl flex items-center justify-center">
                <ValueIcon icon={value.icon} className="w-7 h-7 text-teal-600" />
              </div>
              <div>
                <p className="text-body-xs text-teal-600 font-semibold uppercase tracking-wider mb-1">
                  {value.icon === 'respect' ? 'Respeto y dignidad' : value.icon === 'quality' ? 'Cada caso es único' : 'Equipo experimentado'}
                </p>
                <h3 className="font-heading text-display-xs text-gray-900 mb-2">{value.title}</h3>
                <p className="text-body-sm text-foreground-secondary leading-relaxed">{value.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
