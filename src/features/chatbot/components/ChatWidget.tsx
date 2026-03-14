'use client'

import { useState, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Message {
  id: string
  type: 'bot' | 'user'
  content: string
  timestamp: Date
  quickReplies?: string[]
}

interface LeadData {
  fullName?: string
  email?: string
  phone?: string
  caseType?: string
  description?: string
  urgency?: 'low' | 'medium' | 'high'
}

const CASE_TYPES = [
  'Derecho Civil',
  'Derecho Penal',
  'Derecho Familiar',
  'Derecho Laboral',
  'Derecho Mercantil',
  'Otro'
]

const INITIAL_MESSAGE: Message = {
  id: '1',
  type: 'bot',
  content: 'Hola, soy el asistente virtual de LexAgenda. Estoy aquí para ayudarte a agendar una consulta con nuestros abogados.',
  timestamp: new Date(),
  quickReplies: ['Agendar cita', 'Ver servicios', 'Horarios de atención']
}

const FAQ_RESPONSES: Record<string, string> = {
  'horarios de atención': 'Nuestro horario de atención es de Lunes a Viernes de 9:00 AM a 6:00 PM. Los sábados atendemos de 9:00 AM a 1:00 PM.',
  'ver servicios': 'Ofrecemos servicios en: Derecho Civil, Derecho Penal, Derecho Familiar, Derecho Laboral y Derecho Mercantil. ¿En qué área necesitas asesoría?',
  'precios': 'Nuestras consultas iniciales tienen un costo desde $500 MXN. El precio final depende del tipo de caso y la complejidad. ¿Te gustaría agendar una consulta inicial?',
  'ubicación': 'Nuestras oficinas están ubicadas en el centro de la ciudad. También ofrecemos consultas virtuales por videollamada.',
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [leadData, setLeadData] = useState<LeadData>({})
  const [currentStep, setCurrentStep] = useState<'greeting' | 'name' | 'email' | 'phone' | 'case_type' | 'description' | 'urgency' | 'confirm' | 'done'>('greeting')
  const [showDisclaimer, setShowDisclaimer] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([INITIAL_MESSAGE])
    }
  }, [isOpen, messages.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const addBotMessage = (content: string, quickReplies?: string[]) => {
    setIsTyping(true)
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'bot',
        content,
        timestamp: new Date(),
        quickReplies
      }])
      setIsTyping(false)
    }, 800)
  }

  const handleSend = (text: string = input) => {
    if (!text.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')

    processUserInput(text.toLowerCase())
  }

  const processUserInput = (text: string) => {
    // Check for FAQs
    for (const [key, response] of Object.entries(FAQ_RESPONSES)) {
      if (text.includes(key)) {
        addBotMessage(response, currentStep === 'greeting' ? ['Agendar cita', 'Más información'] : undefined)
        return
      }
    }

    // Handle booking flow
    if (text.includes('agendar') || text.includes('cita') || currentStep !== 'greeting') {
      handleBookingFlow(text)
      return
    }

    // Default response
    addBotMessage(
      '¿En qué puedo ayudarte hoy?',
      ['Agendar cita', 'Ver servicios', 'Horarios de atención', 'Precios']
    )
  }

  const handleBookingFlow = (text: string) => {
    switch (currentStep) {
      case 'greeting':
        setCurrentStep('name')
        addBotMessage('Para agendar tu cita, necesito algunos datos. ¿Cuál es tu nombre completo?')
        break

      case 'name':
        setLeadData(prev => ({ ...prev, fullName: text }))
        setCurrentStep('email')
        addBotMessage(`Gracias, ${text}. ¿Cuál es tu correo electrónico?`)
        break

      case 'email':
        if (!text.includes('@')) {
          addBotMessage('Por favor, ingresa un correo electrónico válido.')
          return
        }
        setLeadData(prev => ({ ...prev, email: text }))
        setCurrentStep('phone')
        addBotMessage('¿Cuál es tu número de teléfono de contacto?')
        break

      case 'phone':
        setLeadData(prev => ({ ...prev, phone: text }))
        setCurrentStep('case_type')
        addBotMessage('¿En qué área legal necesitas asesoría?', CASE_TYPES)
        break

      case 'case_type':
        const caseType = CASE_TYPES.find(t => t.toLowerCase() === text.toLowerCase()) || text
        setLeadData(prev => ({ ...prev, caseType }))
        setCurrentStep('description')
        addBotMessage('Cuéntame brevemente sobre tu caso. ¿Cuál es la situación que necesitas resolver?')
        break

      case 'description':
        setLeadData(prev => ({ ...prev, description: text }))
        setCurrentStep('urgency')
        addBotMessage('¿Qué tan urgente es tu caso?', ['Baja - Puedo esperar', 'Media - Esta semana', 'Alta - Lo antes posible'])
        break

      case 'urgency':
        let urgency: 'low' | 'medium' | 'high' = 'medium'
        if (text.includes('baja') || text.includes('esperar')) urgency = 'low'
        else if (text.includes('alta') || text.includes('antes posible')) urgency = 'high'

        setLeadData(prev => ({ ...prev, urgency }))
        setCurrentStep('confirm')

        const finalData = { ...leadData, urgency }
        addBotMessage(
          `Perfecto, estos son tus datos:\n\n` +
          `Nombre: ${finalData.fullName}\n` +
          `Email: ${finalData.email}\n` +
          `Teléfono: ${finalData.phone}\n` +
          `Área: ${finalData.caseType}\n` +
          `Urgencia: ${urgency === 'high' ? 'Alta' : urgency === 'medium' ? 'Media' : 'Baja'}\n\n` +
          `¿Los datos son correctos?`,
          ['Sí, confirmar', 'No, corregir datos']
        )
        break

      case 'confirm':
        if (text.includes('sí') || text.includes('confirmar') || text.includes('si')) {
          setCurrentStep('done')
          addBotMessage(
            '¡Excelente! Hemos registrado tu solicitud. Un abogado especializado se pondrá en contacto contigo dentro de las próximas 24 horas para agendar tu consulta.\n\n' +
            'También puedes agendar directamente desde nuestra plataforma si ya tienes una cuenta.',
            ['Crear cuenta', 'Iniciar sesión']
          )
          // Here you would typically save the lead to the database
          console.log('Lead captured:', leadData)
        } else {
          setCurrentStep('name')
          setLeadData({})
          addBotMessage('Sin problema, empecemos de nuevo. ¿Cuál es tu nombre completo?')
        }
        break

      case 'done':
        if (text.includes('crear cuenta')) {
          window.location.href = '/signup'
        } else if (text.includes('iniciar sesión')) {
          window.location.href = '/login'
        } else {
          addBotMessage('¿Hay algo más en lo que pueda ayudarte?', ['Nueva consulta', 'Crear cuenta', 'Cerrar chat'])
        }
        break
    }
  }

  const handleQuickReply = (reply: string) => {
    handleSend(reply)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        data-tour="chat-widget"
        className="fixed bottom-6 right-6 w-16 h-16 bg-primary-500 rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 transition-all hover:scale-105 z-50"
        aria-label="Abrir chat"
      >
        <ChatIcon className="w-7 h-7 text-white" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-secondary-500 rounded-full animate-pulse" />
      </button>
    )
  }

  return (
    <Card className="fixed bottom-6 right-6 w-[380px] h-[600px] flex flex-col shadow-2xl z-50 animate-scale-in overflow-hidden">
      {/* Header */}
      <div className="bg-primary-500 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary-500 rounded-full flex items-center justify-center">
            <ScaleIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">LexAgenda Asistente</h3>
            <p className="text-xs text-white/70">En línea</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Legal Disclaimer */}
      {showDisclaimer && (
        <div className="bg-warning-50 border-b border-warning-200 p-3">
          <div className="flex items-start gap-2">
            <AlertIcon className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-warning-800">
                <strong>Aviso Legal:</strong> Este asistente virtual NO proporciona asesoría legal.
                Su propósito es facilitar la programación de citas y responder preguntas generales.
              </p>
              <button
                onClick={() => setShowDisclaimer(false)}
                className="text-xs text-warning-600 underline mt-1"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.type === 'user'
                  ? 'bg-primary-500 text-white rounded-br-md'
                  : 'bg-white shadow-sm rounded-bl-md'
              }`}
            >
              <p className="text-sm whitespace-pre-line">{message.content}</p>
              <p className={`text-[10px] mt-1 ${
                message.type === 'user' ? 'text-white/60' : 'text-foreground-muted'
              }`}>
                {message.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* Quick Replies */}
        {messages.length > 0 && messages[messages.length - 1].quickReplies && (
          <div className="flex flex-wrap gap-2">
            {messages[messages.length - 1].quickReplies!.map((reply, i) => (
              <button
                key={i}
                onClick={() => handleQuickReply(reply)}
                className="px-4 py-2 bg-white border border-primary-200 text-primary-600 rounded-full text-sm hover:bg-primary-50 transition-colors"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu mensaje..."
            className="flex-1 px-4 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <Button type="submit" disabled={!input.trim() || isTyping}>
            <SendIcon className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </Card>
  )
}

// Icons
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  )
}
