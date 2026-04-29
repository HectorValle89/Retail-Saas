'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { login } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccessRecoveryOtpForm } from './AccessRecoveryOtpForm'

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

type LoginFormProps = {
  initialError?: string | null
  initialNotice?: string | null
}

export function LoginForm({ initialError = null, initialNotice = null }: LoginFormProps) {
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(initialNotice)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [accessValue, setAccessValue] = useState('')

  useEffect(() => {
    setError(initialError)
  }, [initialError])

  useEffect(() => {
    setNotice(initialNotice)
  }, [initialNotice])

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    try {
      const result = await login(formData)

      if (result?.error) {
        setError(result.error)
        setNotice(null)
      }
    } catch (error) {
      if (isRedirectError(error)) {
        throw error
      }

      setError('No fue posible iniciar sesion. Reintenta en unos minutos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Input
        id="acceso"
        name="acceso"
        type="text"
        label="Correo o usuario"
        placeholder="correo@empresa.com o usuario temporal"
        value={accessValue}
        onChange={(event) => setAccessValue(event.target.value)}
        required
        className="min-h-[3.65rem] rounded-[18px] border-slate-200 bg-[#f8fbfe] px-5 text-base shadow-none hover:border-[#9dc8ee] focus:border-[#1a7fd4] focus:ring-[rgba(26,127,212,0.12)]"
      />

      <div className="relative">
        <Input
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          label="Contrasena"
          placeholder="••••••••"
          required
          className="min-h-[3.65rem] rounded-[18px] border-slate-200 bg-[#f8fbfe] px-5 text-base shadow-none hover:border-[#9dc8ee] focus:border-[#1a7fd4] focus:ring-[rgba(26,127,212,0.12)]"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-[42px] flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 transition-colors hover:text-slate-800"
          aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
        >
          {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
        </button>
      </div>

      {error && (
        <div className="rounded-[18px] border border-error-300 bg-[#fff4f3] p-4">
          <p className="text-sm leading-6 text-error-700">{error}</p>
        </div>
      )}

      {notice && (
        <div className="rounded-[18px] border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm leading-6 text-emerald-700">{notice}</p>
        </div>
      )}

      <Button
        type="submit"
        isLoading={loading}
        className="w-full min-h-[3.7rem] rounded-[18px] bg-[#156fbd] text-base font-semibold shadow-[0_14px_30px_rgba(21,111,189,0.18)] hover:bg-[#125f9f]"
      >
        Entrar al sistema
      </Button>

      <div className="text-center">
        <p className="text-sm text-slate-500">
          <Link href="/forgot-password" className="font-medium text-slate-700 transition-colors hover:text-[#1a7fd4] hover:underline">
            Recuperar acceso
          </Link>
        </p>
      </div>

      {error?.includes('falta configurar tu seguridad') && (
        <AccessRecoveryOtpForm initialEmail={accessValue.includes('@') ? accessValue : ''} />
      )}
    </form>
  )
}
