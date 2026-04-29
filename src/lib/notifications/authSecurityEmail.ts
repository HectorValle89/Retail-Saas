import { canSendTransactionalEmail, sendTransactionalEmail } from '@/lib/notifications/transactionalEmail'

type BasicRecipient = {
  email: string
  name?: string | null
}

import { renderEmailShell } from './emailShell'

export async function sendActivationOtpEmail(recipient: BasicRecipient, otpCode: string) {
  if (!canSendTransactionalEmail() || !recipient.email?.trim()) {
    return
  }

  const intro = 'Tu cuenta ya esta verificada, pero todavia falta configurar tu seguridad.'
  const body = `
    <p>Usa este codigo de 6 digitos para retomar la creacion de tu contrasena:</p>
    <p style="font-size:32px;font-weight:800;letter-spacing:0.38em;color:#0f172a;margin:20px 0;">${otpCode}</p>
    <p>El codigo vence en 15 minutos. Si tu no solicitaste este acceso, puedes ignorar este mensaje.</p>
  `

  await sendTransactionalEmail({
    to: {
      email: recipient.email,
      name: recipient.name ?? undefined,
    },
    subject: 'Codigo para terminar tu activacion en Beteele One',
    html: renderEmailShell('Código de acceso temporal', `<p>${intro}</p>${body}`),
    text: `Tu codigo de acceso es ${otpCode}. Vence en 15 minutos.`,
  })
}

export async function sendCredentialTransitionLinkEmail(
  recipient: BasicRecipient,
  {
    title,
    intro,
    actionLabel,
    actionHref,
    text,
  }: {
    title: string
    intro: string
    actionLabel: string
    actionHref: string
    text: string
  }
) {
  if (!canSendTransactionalEmail() || !recipient.email?.trim()) {
    return
  }
  await sendTransactionalEmail({
    to: {
      email: recipient.email,
      name: recipient.name ?? undefined,
    },
    subject: title,
    html: renderEmailShell(title, `<p>${intro}</p>`, actionLabel, actionHref),
    text,
  })
}

export async function sendPasswordChangedNoticeEmail(recipient: BasicRecipient) {
  if (!canSendTransactionalEmail() || !recipient.email?.trim()) {
    return
  }

  const intro = 'Tu contrasena de Beteele One fue actualizada correctamente.'
  const body = `
    <p>Si reconoces este cambio, no necesitas hacer nada mas.</p>
    <p>Si tu no realizaste esta accion, contacta al administrador de inmediato para proteger tu acceso.</p>
  `

  await sendTransactionalEmail({
    to: {
      email: recipient.email,
      name: recipient.name ?? undefined,
    },
    subject: 'Tu contrasena fue actualizada',
    html: renderEmailShell('Cambio de contraseña completado', `<p>${intro}</p>${body}`),
    text: 'Tu contrasena fue actualizada correctamente. Si no reconoces este cambio, contacta al administrador.',
  })
}

export async function sendEmailChangeNoticeToCurrentEmail(
  currentRecipient: BasicRecipient,
  nextEmail: string
) {
  if (!canSendTransactionalEmail() || !currentRecipient.email?.trim()) {
    return
  }

  const intro = 'Recibimos una solicitud para cambiar el correo principal de tu cuenta.'
  const body = `
    <p>El nuevo correo propuesto es <strong>${nextEmail}</strong>.</p>
    <p>Por seguridad, tu acceso seguira usando el correo actual hasta que el nuevo correo quede validado desde el enlace enviado a esa bandeja.</p>
    <p>Si tu no solicitaste este cambio, avisa al administrador para revisar tu cuenta.</p>
  `

  await sendTransactionalEmail({
    to: {
      email: currentRecipient.email,
      name: currentRecipient.name ?? undefined,
    },
    subject: 'Aviso de intento de cambio de correo',
    html: renderEmailShell('Intento de cambio de correo', `<p>${intro}</p>${body}`),
    text: `Se solicito cambiar tu correo principal por ${nextEmail}. Tu acceso seguira usando el correo actual hasta validar el nuevo correo.`,
  })
}
