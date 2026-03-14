import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface BookingRequest {
  lawyerId: string
  appointmentTypeId: string
  scheduledAt: string
  client: {
    name: string
    email: string
    phone: string
    description?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: BookingRequest = await request.json()
    const { lawyerId, appointmentTypeId, scheduledAt, client } = body

    // Validate required fields
    if (!lawyerId || !appointmentTypeId || !scheduledAt || !client.name || !client.email || !client.phone) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get appointment type details
    const { data: appointmentType, error: typeError } = await supabase
      .from('appointment_types')
      .select('name, duration_minutes, price')
      .eq('id', appointmentTypeId)
      .single()

    if (typeError || !appointmentType) {
      return NextResponse.json(
        { error: 'Tipo de cita no encontrado' },
        { status: 404 }
      )
    }

    // Get lawyer details for email notification
    const { data: lawyer, error: lawyerError } = await supabase
      .from('lawyers')
      .select('user_id, profile:profiles(full_name, email)')
      .eq('id', lawyerId)
      .single()

    if (lawyerError || !lawyer) {
      return NextResponse.json(
        { error: 'Abogado no encontrado' },
        { status: 404 }
      )
    }

    // Check if a client with this email already exists
    let clientId: string

    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('email', client.email)
      .single()

    if (existingClient) {
      clientId = existingClient.id

      // Update client info
      await supabase
        .from('clients')
        .update({
          full_name: client.name,
          phone: client.phone
        })
        .eq('id', clientId)
    } else {
      // Create new guest client
      const { data: newClient, error: createClientError } = await supabase
        .from('clients')
        .insert({
          full_name: client.name,
          email: client.email,
          phone: client.phone,
          user_id: null // Guest client, no user account
        })
        .select('id')
        .single()

      if (createClientError) {
        console.error('Error creating client:', createClientError)
        return NextResponse.json(
          { error: 'Error al crear cliente: ' + createClientError.message },
          { status: 500 }
        )
      }

      clientId = newClient.id
    }

    // Create the appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        lawyer_id: lawyerId,
        client_id: clientId,
        appointment_type_id: appointmentTypeId,
        scheduled_at: scheduledAt,
        duration_minutes: appointmentType.duration_minutes,
        status: 'pending',
        notes: client.description || null
      })
      .select('id')
      .single()

    if (appointmentError) {
      console.error('Error creating appointment:', appointmentError)
      return NextResponse.json(
        { error: 'Error al crear cita: ' + appointmentError.message },
        { status: 500 }
      )
    }

    // Send email notifications (non-blocking)
    try {
      const lawyerProfile = Array.isArray(lawyer.profile) ? lawyer.profile[0] : lawyer.profile
      const scheduledDate = new Date(scheduledAt)
      const appointmentDate = scheduledDate.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      const appointmentTime = scheduledDate.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      })

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saas-factory-theta.vercel.app'

      await fetch(`${baseUrl}/api/email/appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'created',
          appointmentId: appointment.id,
          clientName: client.name,
          clientEmail: client.email,
          lawyerName: lawyerProfile?.full_name || 'Abogado',
          lawyerEmail: lawyerProfile?.email || '',
          appointmentDate,
          appointmentTime,
          appointmentType: appointmentType.name,
          duration: appointmentType.duration_minutes,
        }),
      })
    } catch (emailError) {
      console.error('Error sending email notifications:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      appointmentId: appointment.id,
      message: 'Cita creada exitosamente'
    })

  } catch (error) {
    console.error('Public booking error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
