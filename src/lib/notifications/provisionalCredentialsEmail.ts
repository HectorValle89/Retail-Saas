import 'server-only'

import {
  canSendTransactionalEmail,
  sendTransactionalEmail,
} from '@/lib/notifications/transactionalEmail'

interface ProvisionalCredentialsEmailInput {
  to: string
  employeeName: string
  username: string
  temporaryPassword: string
  loginUrl: string
}

export function canSendProvisionalCredentialsEmail() {
  return canSendTransactionalEmail()
}

export async function sendProvisionalCredentialsEmail(
  input: ProvisionalCredentialsEmailInput
) {
  await sendTransactionalEmail({
    to: {
      email: input.to,
      name: input.employeeName,
    },
    subject: 'Tus credenciales provisionales de Beteele One',
    text: [
      `Hola ${input.employeeName},`,
      '',
      'Administracion genero tu acceso provisional a Beteele One.',
      `Usuario: ${input.username}`,
      `Contrasena temporal: ${input.temporaryPassword}`,
      `Ingresa en: ${input.loginUrl}`,
      'Al entrar deberas continuar el flujo de activacion de tu cuenta.',
    ].join('\n'),
    html: `
      <p>Hola ${input.employeeName},</p>
      <p>Administracion generó tu acceso provisional a Beteele One.</p>
      <p><strong>Usuario:</strong> ${input.username}</p>
      <p><strong>Contrasena temporal:</strong> ${input.temporaryPassword}</p>
      <p>Ingresa en: <a href="${input.loginUrl}">${input.loginUrl}</a></p>
      <p>Al entrar deberas continuar el flujo de activacion de tu cuenta.</p>
    `,
  })
}
