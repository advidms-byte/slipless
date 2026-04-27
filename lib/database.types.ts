export type Business = {
  id: string
  name: string
  ai_persona_name: string
  ai_persona_tone: string
  timezone: string
}

export type Message = {
  id?: string
  direction: 'inbound' | 'outbound'
  body: string
  created_at?: string
}

export type LeadWithMessages = {
  id: string
  caller_phone: string
  caller_name?: string | null
  service_requested?: string | null
  status: 'new' | 'in-progress' | 'booked' | 'lead' | 'lost'
  appointment_at?: string | null
  created_at: string
  messages: Message[]
}
