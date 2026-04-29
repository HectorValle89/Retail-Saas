export function renderEmailShell(
  title: string,
  body: string,
  ctaLabel?: string,
  ctaHref?: string | null
) {
  const ctaHtml =
    ctaLabel && ctaHref
      ? `<p style="margin:24px 0;"><a href="${ctaHref}" style="display:inline-block;border-radius:999px;background:#156fbd;color:#ffffff;padding:14px 22px;text-decoration:none;font-weight:700;">${ctaLabel}</a></p>`
      : ''

  const fallbackHtml =
    ctaHref && ctaHref.startsWith('http')
      ? `<p style="margin-top:32px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px;">
           Si el botón no funciona, puedes copiar y pegar este enlace en tu navegador:<br/>
           <span style="word-break:break-all;color:#1e293b;">${ctaHref}</span>
         </p>`
      : ''

  return `
    <div style="font-family:Arial,sans-serif;background:#eff5fb;padding:24px;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:24px;padding:28px;border:1px solid #d7e6f6;">
        <p style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#1269b2;font-weight:700;margin:0 0 18px 0;">Beteele One</p>
        <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px 0;color:#0f172a;">${title}</h1>
        <div style="font-size:16px;line-height:1.7;color:#334155;">
          ${body}
        </div>
        ${ctaHtml}
        ${fallbackHtml}
      </div>
      <p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:24px;">
        Este es un mensaje automático de Beteele One. Por favor no respondas a este correo.
      </p>
    </div>
  `
}
