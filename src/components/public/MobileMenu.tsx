'use client'

import { useState } from 'react'
import Link from 'next/link'
import { siteConfig } from '@/config/siteConfig'
import { ScaleIcon, CloseIcon, ChevronDownIcon, PhoneIcon, MailIcon, MapPinIcon } from './icons'

interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-modal animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <Link href="/" className="flex items-center gap-2" onClick={onClose}>
            <ScaleIcon className="w-6 h-6 text-teal-600" />
            <span className="font-heading font-bold text-teal-800">{siteConfig.firmName}</span>
          </Link>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700" aria-label="Cerrar menú">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4">
          {siteConfig.navigation.items.map((item) => (
            <div key={item.label} className="border-b border-gray-50">
              {item.children ? (
                <>
                  <button
                    onClick={() => setExpandedItem(expandedItem === item.label ? null : item.label)}
                    className="flex items-center justify-between w-full py-3.5 text-body-md font-medium text-gray-800"
                  >
                    {item.label}
                    <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${expandedItem === item.label ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedItem === item.label && (
                    <div className="pb-2 pl-4 space-y-1 animate-fade-in">
                      {item.children.map((child) => (
                        <Link
                          key={child.label}
                          href={child.href}
                          className="block py-2 text-body-sm text-gray-600 hover:text-teal-600"
                          onClick={onClose}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href={item.href}
                  className="block py-3.5 text-body-md font-medium text-gray-800 hover:text-teal-600"
                  onClick={onClose}
                >
                  {item.label}
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* Contact info */}
        <div className="p-4 mx-4 mb-4 bg-teal-50 rounded-xl space-y-3">
          <a href={`tel:${siteConfig.contact.phone}`} className="flex items-center gap-2 text-body-sm text-teal-800">
            <PhoneIcon className="w-4 h-4 text-teal-600" />
            {siteConfig.contact.phoneDisplay}
          </a>
          <a href={`mailto:${siteConfig.contact.email}`} className="flex items-center gap-2 text-body-sm text-teal-800">
            <MailIcon className="w-4 h-4 text-teal-600" />
            {siteConfig.contact.email}
          </a>
          <div className="flex items-start gap-2 text-body-sm text-teal-800">
            <MapPinIcon className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
            <span>{siteConfig.contact.address}, {siteConfig.contact.city}</span>
          </div>
        </div>

        {/* CTA buttons */}
        <div className="p-4 space-y-3">
          <a
            href={`tel:${siteConfig.contact.phone}`}
            className="block w-full text-center bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Llama Ahora
          </a>
          <Link
            href="/login"
            className="block w-full text-center border-2 border-teal-600 text-teal-600 hover:bg-teal-50 font-semibold py-3 rounded-lg transition-colors"
            onClick={onClose}
          >
            Portal Abogado
          </Link>
        </div>
      </div>
    </div>
  )
}
