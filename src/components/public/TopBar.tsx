import { siteConfig } from '@/config/siteConfig'
import { MailIcon, PhoneIcon, FacebookIcon, InstagramIcon, LinkedInIcon } from './icons'

export function TopBar() {
  const { contact, social } = siteConfig

  return (
    <div className="hidden md:block bg-teal-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-10 text-body-sm">
          <div className="flex items-center gap-6">
            <span className="text-teal-200 hidden lg:inline">
              Servicios de derecho familiar en {siteConfig.contact.city}, {siteConfig.contact.country}
            </span>
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-teal-200 transition-colors">
              <MailIcon className="w-3.5 h-3.5" />
              {contact.email}
            </a>
            <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-teal-200 transition-colors">
              <PhoneIcon className="w-3.5 h-3.5" />
              Llame al {contact.phoneDisplay}
            </a>
          </div>
          <div className="flex items-center gap-4">
            {social.facebook && (
              <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-teal-200 transition-colors">
                <FacebookIcon className="w-4 h-4" />
              </a>
            )}
            {social.instagram && (
              <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-teal-200 transition-colors">
                <InstagramIcon className="w-4 h-4" />
              </a>
            )}
            {social.linkedin && (
              <a href={social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="hover:text-teal-200 transition-colors">
                <LinkedInIcon className="w-4 h-4" />
              </a>
            )}
            <a
              href={`tel:${contact.phone}`}
              className="ml-2 bg-teal-500 hover:bg-teal-400 text-white text-body-xs font-bold uppercase tracking-wider px-4 py-1 rounded transition-colors"
            >
              Llama Ahora
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
