import { NextRequest, NextResponse } from 'next/server'
import { getResend, EMAIL_CONFIG } from '@/lib/email'
import {
  appointmentCreatedClientEmail,
  appointmentCreatedLawyerEmail,
  appointmentCreatedAdminEmail,
  appointmentStatusChangedEmail,
} from '@/lib/email'

// Admin email to receive all notifications
const ADMIN_EMAIL = 'sinsajo.creators@gmail.com'

interface AppointmentEmailRequest {
  type: 'created' | 'status_changed'
  appointmentId: string
  clientName: string
  clientEmail: string
  lawyerName: string
  lawyerEmail: string
  appointmentDate: string
  appointmentTime: string
  appointmentType: string
  duration: number
  status?: 'confirmed' | 'cancelled' | 'completed'
}

export async function POST(request: NextRequest) {
  try {
    // Check if Resend is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured, skipping email send')
      return NextResponse.json({ success: true, sent: 0, failed: 0, message: 'Email not configured' })
    }

    const resend = getResend()
    const body: AppointmentEmailRequest = await request.json()

    const {
      type,
      appointmentId,
      clientName,
      clientEmail,
      lawyerName,
      lawyerEmail,
      appointmentDate,
      appointmentTime,
      appointmentType,
      duration,
      status,
    } = body

    const emailData = {
      clientName,
      lawyerName,
      appointmentDate,
      appointmentTime,
      appointmentType,
      duration,
      appointmentId,
    }

    const emailPromises: Promise<unknown>[] = []

    if (type === 'created') {
      // Email to client
      emailPromises.push(
        resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: clientEmail,
          subject: `Cita Confirmada con ${lawyerName} - LexAgenda`,
          html: appointmentCreatedClientEmail(emailData),
        })
      )

      // Email to lawyer
      emailPromises.push(
        resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: lawyerEmail,
          subject: `Nueva Cita: ${clientName} - ${appointmentDate} - LexAgenda`,
          html: appointmentCreatedLawyerEmail(emailData),
        })
      )

      // Email to admin (if lawyer is not admin)
      if (lawyerEmail !== ADMIN_EMAIL) {
        emailPromises.push(
          resend.emails.send({
            from: EMAIL_CONFIG.from,
            to: ADMIN_EMAIL,
            subject: `[Admin] Nueva Cita: ${clientName} con ${lawyerName} - LexAgenda`,
            html: appointmentCreatedAdminEmail(emailData),
          })
        )
      }
    } else if (type === 'status_changed' && status) {
      const statusLabels = {
        confirmed: 'Confirmada',
        cancelled: 'Cancelada',
        completed: 'Completada',
      }

      // Email to client
      emailPromises.push(
        resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: clientEmail,
          subject: `Cita ${statusLabels[status]} - LexAgenda`,
          html: appointmentStatusChangedEmail({ ...emailData, status, recipientType: 'client' }),
        })
      )

      // Email to lawyer
      emailPromises.push(
        resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: lawyerEmail,
          subject: `Cita ${statusLabels[status]}: ${clientName} - LexAgenda`,
          html: appointmentStatusChangedEmail({ ...emailData, status, recipientType: 'lawyer' }),
        })
      )
    }

    // Send all emails in parallel
    const results = await Promise.allSettled(emailPromises)

    // Check for any failures
    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length > 0) {
      console.error('Some emails failed to send:', failures)
    }

    return NextResponse.json({
      success: true,
      sent: results.filter(r => r.status === 'fulfilled').length,
      failed: failures.length,
    })
  } catch (error) {
    console.error('Error sending appointment emails:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send emails' },
      { status: 500 }
    )
  }
}
