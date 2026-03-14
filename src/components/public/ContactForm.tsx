'use client'

import { useState } from 'react'
import { siteConfig } from '@/config/siteConfig'

interface FormData {
  name: string
  email: string
  phone: string
  message: string
}

export function ContactForm() {
  const [formData, setFormData] = useState<FormData>({ name: '', email: '', phone: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'El nombre es requerido (mínimo 2 caracteres)'
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Ingrese un correo electrónico válido'
    }
    if (!formData.message.trim() || formData.message.trim().length < 10) {
      newErrors.message = 'El mensaje es requerido (mínimo 10 caracteres)'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setStatus('loading')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        setStatus('success')
        setFormData({ name: '', email: '', phone: '', message: '' })
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-heading text-display-xs text-gray-900 mb-2">¡Mensaje enviado!</h3>
        <p className="text-body-md text-foreground-secondary">
          Gracias por contactarnos. Nos pondremos en contacto con usted a la brevedad.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-4 text-teal-600 hover:text-teal-700 font-semibold text-body-sm"
        >
          Enviar otro mensaje
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="block text-body-sm font-medium text-gray-700 mb-1.5">
          Nombre
        </label>
        <input
          id="contact-name"
          type="text"
          value={formData.name}
          onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors({ ...errors, name: undefined }) }}
          className={`w-full px-4 py-3 rounded-xl border ${errors.name ? 'border-error-500' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors text-body-md`}
          placeholder="Su nombre completo"
        />
        {errors.name && <p className="text-error-500 text-body-xs mt-1">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-body-sm font-medium text-gray-700 mb-1.5">
          Correo Electrónico
        </label>
        <input
          id="contact-email"
          type="email"
          value={formData.email}
          onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setErrors({ ...errors, email: undefined }) }}
          className={`w-full px-4 py-3 rounded-xl border ${errors.email ? 'border-error-500' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors text-body-md`}
          placeholder="correo@ejemplo.com"
        />
        {errors.email && <p className="text-error-500 text-body-xs mt-1">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="contact-phone" className="block text-body-sm font-medium text-gray-700 mb-1.5">
          Número de Teléfono <span className="text-foreground-muted">(opcional)</span>
        </label>
        <input
          id="contact-phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors text-body-md"
          placeholder="+505 0000-0000"
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-body-sm font-medium text-gray-700 mb-1.5">
          Mensaje
        </label>
        <textarea
          id="contact-message"
          rows={5}
          value={formData.message}
          onChange={(e) => { setFormData({ ...formData, message: e.target.value }); setErrors({ ...errors, message: undefined }) }}
          className={`w-full px-4 py-3 rounded-xl border ${errors.message ? 'border-error-500' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors text-body-md resize-none`}
          placeholder="Describa brevemente su situación legal..."
        />
        {errors.message && <p className="text-error-500 text-body-xs mt-1">{errors.message}</p>}
      </div>

      {status === 'error' && (
        <div className="bg-error-50 border border-error-200 rounded-lg p-3 text-error-700 text-body-sm">
          Hubo un error al enviar el mensaje. Por favor, intente nuevamente o llámenos al {siteConfig.contact.phoneDisplay}.
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-bold py-4 rounded-xl transition-colors text-body-md uppercase tracking-wider"
      >
        {status === 'loading' ? 'Enviando...' : 'Enviar Mensaje'}
      </button>
    </form>
  )
}
