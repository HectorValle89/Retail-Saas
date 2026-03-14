'use server'

import { createClient } from '@/lib/supabase/server'
import type { PaymentStatus } from '@/types/database'

export interface PaymentWithAppointment {
  id: string
  appointment_id: string
  amount: number
  status: PaymentStatus
  payment_method: string | null
  transaction_id: string | null
  paid_at: string | null
  created_at: string
  appointment: {
    id: string
    scheduled_at: string
    client: { profile: { full_name: string; email: string } }
    lawyer: { profile: { full_name: string } }
    appointment_type: { name: string; price: number } | null
  } | null
}

export const paymentService = {
  async getPaymentsByUser(userId: string, role: 'client' | 'lawyer' | 'admin') {
    const supabase = await createClient()

    let query = supabase
      .from('payments')
      .select(`
        *,
        appointment:appointments(
          id,
          scheduled_at,
          client:clients(profile:profiles(full_name, email)),
          lawyer:lawyers(profile:profiles(full_name)),
          appointment_type:appointment_types(name, price)
        )
      `)
      .order('created_at', { ascending: false })

    if (role === 'client') {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (client) {
        query = query.eq('appointment.client_id', client.id)
      }
    } else if (role === 'lawyer') {
      const { data: lawyer } = await supabase
        .from('lawyers')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (lawyer) {
        query = query.eq('appointment.lawyer_id', lawyer.id)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching payments:', error)
      return []
    }

    return data as PaymentWithAppointment[]
  },

  async getPaymentStats(userId: string, role: 'client' | 'lawyer' | 'admin') {
    const supabase = await createClient()

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    let query = supabase
      .from('payments')
      .select('amount, status, created_at')

    if (role === 'lawyer') {
      const { data: lawyer } = await supabase
        .from('lawyers')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (lawyer) {
        query = query.eq('appointment.lawyer_id', lawyer.id)
      }
    }

    const { data: payments } = await query

    if (!payments) return {
      totalRevenue: 0,
      monthlyRevenue: 0,
      pendingPayments: 0,
      completedPayments: 0
    }

    const totalRevenue = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0)

    const monthlyRevenue = payments
      .filter(p =>
        p.status === 'completed' &&
        new Date(p.created_at) >= startOfMonth
      )
      .reduce((sum, p) => sum + p.amount, 0)

    const pendingPayments = payments.filter(p => p.status === 'pending').length
    const completedPayments = payments.filter(p => p.status === 'completed').length

    return {
      totalRevenue,
      monthlyRevenue,
      pendingPayments,
      completedPayments
    }
  },

  async updatePaymentStatus(paymentId: string, status: PaymentStatus, transactionId?: string) {
    const supabase = await createClient()

    const updateData: { status: PaymentStatus; paid_at?: string; transaction_id?: string } = { status }
    if (status === 'completed') {
      updateData.paid_at = new Date().toISOString()
    }
    if (transactionId) {
      updateData.transaction_id = transactionId
    }

    const { error } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', paymentId)

    if (error) {
      return { error: error.message }
    }

    // If payment completed, update appointment status to 'paid'
    if (status === 'completed') {
      const { data: payment } = await supabase
        .from('payments')
        .select('appointment_id')
        .eq('id', paymentId)
        .single()

      if (payment) {
        await supabase
          .from('appointments')
          .update({ status: 'paid' })
          .eq('id', payment.appointment_id)
      }
    }

    return { success: true }
  }
}
