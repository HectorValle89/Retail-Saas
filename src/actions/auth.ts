'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ERROR_BACKEND_ADMIN =
  'El backend administrativo de autenticacion no esta configurado. Define SUPABASE_SERVICE_ROLE_KEY para operar usuarios corporativos.'

function obtenerClienteAdmin() {
  try {
    return { service: createServiceClient(), error: null }
  } catch {
    return { service: null, error: ERROR_BACKEND_ADMIN }
  }
}

async function obtenerUrlBaseAplicacion() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, '')
  }

  const headerStore = await headers()
  const origin = headerStore.get('origin')?.trim()

  if (origin) {
    return origin.replace(/\/$/, '')
  }

  const forwardedHost = headerStore.get('x-forwarded-host')?.trim() ?? headerStore.get('host')?.trim()

  if (forwardedHost) {
    const forwardedProto = headerStore.get('x-forwarded-proto')?.trim() ?? 'https'
    return `${forwardedProto}://${forwardedHost}`
  }

  return 'http://localhost:3000'
}

async function resolverCorreoDeAcceso(
  acceso: string
): Promise<{ email: string | null; error: string | null }> {
  if (acceso.includes('@')) {
    return { email: acceso.toLowerCase(), error: null }
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return {
      email: null,
      error:
        'El acceso por usuario temporal requiere backend administrativo. Usa tu correo o configura SUPABASE_SERVICE_ROLE_KEY.',
    }
  }

  const { data: usuario } = await service
    .from('usuario')
    .select('auth_user_id')
    .eq('username', acceso)
    .maybeSingle()

  if (!usuario?.auth_user_id) {
    return {
      email: null,
      error:
        adminError ??
        'La cuenta todavia no tiene un usuario de acceso provisionado en auth.',
    }
  }

  const { data, error } = await service.auth.admin.getUserById(usuario.auth_user_id)

  if (error || !data.user.email) {
    return {
      email: null,
      error: 'No fue posible resolver el correo de acceso para esa cuenta.',
    }
  }

  return { email: data.user.email, error: null }
}

async function obtenerEstadoCuenta(supabase: Awaited<ReturnType<typeof createClient>>, authUserId: string) {
  const { data: usuario } = await supabase
    .from('usuario')
    .select('estado_cuenta')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  return usuario?.estado_cuenta ?? null
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const acceso = String(formData.get('acceso') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!acceso || !password) {
    return { error: 'Ingresa tu correo o usuario y tu contrasena.' }
  }

  const { email, error: resolverError } = await resolverCorreoDeAcceso(acceso)

  if (resolverError) {
    return { error: resolverError }
  }

  if (!email) {
    return { error: 'No encontramos un acceso valido para esa cuenta.' }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No fue posible recuperar la sesion del usuario.' }
  }

  const estadoCuenta = await obtenerEstadoCuenta(supabase, user.id)

  if (!estadoCuenta) {
    await supabase.auth.signOut()
    return { error: 'No existe un usuario operativo vinculado a esta cuenta.' }
  }

  if (estadoCuenta === 'SUSPENDIDA' || estadoCuenta === 'BAJA') {
    await supabase.auth.signOut()
    return { error: 'Tu cuenta no tiene acceso operativo. Contacta al administrador.' }
  }

  revalidatePath('/', 'layout')

  if (estadoCuenta === 'PROVISIONAL' || estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL') {
    redirect('/activacion')
  }

  redirect('/dashboard')
}

export async function iniciarActivacionCuenta(formData: FormData) {
  const supabase = await createClient()
  const correoElectronico = String(formData.get('correo_electronico') ?? '').trim().toLowerCase()

  if (!correoElectronico) {
    return { error: 'Ingresa un correo valido para activar la cuenta.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'La sesion actual no es valida.' }
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select('id, estado_cuenta')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!usuario) {
    return { error: 'No existe un usuario operativo asociado a esta sesion.' }
  }

  if (usuario.estado_cuenta === 'SUSPENDIDA' || usuario.estado_cuenta === 'BAJA') {
    return { error: 'La cuenta esta bloqueada y no puede activarse.' }
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError }
  }

  const siteUrl = await obtenerUrlBaseAplicacion()

  const { error: authError } = await supabase.auth.updateUser({
    email: correoElectronico,
  }, {
    emailRedirectTo: `${siteUrl}/update-password`,
  })

  if (authError) {
    return { error: authError.message }
  }

  const { error: usuarioError } = await service
    .from('usuario')
    .update({
      correo_electronico: correoElectronico,
      estado_cuenta: 'PENDIENTE_VERIFICACION_EMAIL',
      updated_at: new Date().toISOString(),
    })
    .eq('id', usuario.id)

  if (usuarioError) {
    return { error: usuarioError.message }
  }

  revalidatePath('/', 'layout')
  redirect('/check-email')
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) {
    return { error: 'Ingresa un correo valido.' }
  }

  const { service } = obtenerClienteAdmin()

  if (service) {
    const { data: usuario } = await service
      .from('usuario')
      .select('estado_cuenta')
      .eq('correo_electronico', email)
      .maybeSingle()

    if (usuario && usuario.estado_cuenta !== 'ACTIVA') {
      return { error: 'Debes completar primero la activacion de la cuenta.' }
    }
  }

  const siteUrl = await obtenerUrlBaseAplicacion()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/update-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const password = String(formData.get('password') ?? '')

  if (password.length < 8) {
    return { error: 'La contrasena debe tener al menos 8 caracteres.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'La sesion actual no es valida.' }
  }

  if (!user.email_confirmed_at) {
    return { error: 'Primero confirma tu correo antes de definir la contrasena.' }
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: error.message }
  }

  const { data: usuario } = await service
    .from('usuario')
    .select('id, empleado_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (usuario) {
    await service
      .from('usuario')
      .update({
        estado_cuenta: 'ACTIVA',
        correo_verificado: true,
        correo_electronico: user.email ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', usuario.id)

    await service
      .from('empleado')
      .update({
        correo_electronico: user.email ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', usuario.empleado_id)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
