import 'server-only'

interface ProvisionalCredentialsEmailInput {
  to: string
  employeeName: string
  username: string
  temporaryPassword: string
  loginUrl: string
}

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.USUARIOS_FROM_EMAIL?.trim())
}

export function canSendProvisionalCredentialsEmail() {
  return isConfigured()
}

export async function sendProvisionalCredentialsEmail(
  input: ProvisionalCredentialsEmailInput
) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const fromEmail = process.env.USUARIOS_FROM_EMAIL?.trim()

  if (!apiKey || !fromEmail) {
    throw new Error('El canal de email para credenciales provisionales no esta configurado.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.to],
      subject: 'Tus credenciales provisionales de Beteele One',
      html: `
        <p>Hola ${input.employeeName},</p>
        <p>Administracion generó tu acceso provisional a Beteele One.</p>
        <p><strong>Usuario:</strong> ${input.username}</p>
        <p><strong>Contrasena temporal:</strong> ${input.temporaryPassword}</p>
        <p>Ingresa en: <a href="${input.loginUrl}">${input.loginUrl}</a></p>
        <p>Al entrar deberas continuar el flujo de activacion de tu cuenta.</p>
      `,
    }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }
}
