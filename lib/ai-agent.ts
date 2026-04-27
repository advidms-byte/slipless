import Anthropic from '@anthropic-ai/sdk'
import { Business, Message } from './database.types'

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
const MAX_SMS_LENGTH = 320

let anthropicClient: Anthropic | null = null

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  return anthropicClient
}

function normalizeSms(text: string, fallback: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return fallback
  return cleaned.length > MAX_SMS_LENGTH ? `${cleaned.slice(0, MAX_SMS_LENGTH - 1).trim()}…` : cleaned
}

function fallbackInitialMessage(business: Business) {
  return `Hi! This is ${business.ai_persona_name} from ${business.name}. Sorry we missed your call — how can we help today?`
}

function fallbackReply() {
  return "Thanks for reaching out! Someone from our team will be in touch shortly."
}

function buildSystemPrompt(business: Business): string {
  return `You are ${business.ai_persona_name}, a friendly AI receptionist for ${business.name}.

Your job is to:
1. Warmly acknowledge the missed call
2. Find out what the customer needs (service type, urgency)
3. Offer available appointment slots if relevant
4. Capture their name if not known
5. Confirm booking or let them know someone will follow up

Tone: ${business.ai_persona_tone}
Business: ${business.name}
Your name: ${business.ai_persona_name}
Timezone: ${business.timezone}

Rules:
- Keep messages SHORT. Max 2-3 sentences. This is SMS.
- Never make up specific times. Ask what works for them.
- If they seem angry or have a complex issue, say "I'll have someone from our team call you right back."
- If they found someone else, say "No worries! We're here if you need us in the future."
- Never mention you are an AI unless directly asked. If asked say "I'm a digital assistant for ${business.name}."
- Do NOT add sign-offs like "Best regards". This is conversational SMS.`
}

export async function generateAIResponse(
  business: Business,
  conversationHistory: Message[],
  latestCustomerMessage: string
): Promise<string> {
  const fallback = fallbackReply()

  try {
    const messages: Anthropic.MessageParam[] = conversationHistory
      .filter(msg => msg.body?.trim())
      .slice(-20)
      .map(msg => ({
        role: msg.direction === 'outbound' ? 'assistant' : 'user',
        content: msg.body,
      }))

    messages.push({ role: 'user', content: latestCustomerMessage })

    const response = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 300,
      system: buildSystemPrompt(business),
      messages,
    })

    const textBlock = response.content.find(block => block.type === 'text')
    return normalizeSms(textBlock?.text || '', fallback)
  } catch (error) {
    console.error('[ai-agent] generateAIResponse failed', error)
    return fallback
  }
}

export async function generateInitialMessage(business: Business, callerPhone: string): Promise<string> {
  const fallback = fallbackInitialMessage(business)

  try {
    const response = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 150,
      system: buildSystemPrompt(business),
      messages: [{
        role: 'user',
        content: `[SYSTEM: This customer just called and we missed them. Number: ${callerPhone}. Send the opening SMS to start the conversation.]`,
      }],
    })

    const textBlock = response.content.find(block => block.type === 'text')
    return normalizeSms(textBlock?.text || '', fallback)
  } catch (error) {
    console.error('[ai-agent] generateInitialMessage failed', error)
    return fallback
  }
}

export async function classifyLeadStatus(messages: Message[]): Promise<'in-progress' | 'booked' | 'lead' | 'lost'> {
  if (messages.length < 2) return 'in-progress'

  try {
    const transcript = messages
      .slice(-30)
      .map(msg => `${msg.direction === 'outbound' ? 'AGENT' : 'CUSTOMER'}: ${msg.body}`)
      .join('\n')

    const response = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 10,
      system: 'Classify this SMS conversation with exactly one word: "booked", "lead", "lost", or "in-progress". booked=appointment confirmed. lead=interested but not booked. lost=went elsewhere. in-progress=still active.',
      messages: [{ role: 'user', content: transcript }],
    })

    const textBlock = response.content.find(block => block.type === 'text')
    const status = textBlock?.text.trim().toLowerCase()
    if (status === 'booked') return 'booked'
    if (status === 'lead') return 'lead'
    if (status === 'lost') return 'lost'
  } catch (error) {
    console.error('[ai-agent] classifyLeadStatus failed', error)
  }

  return 'in-progress'
}
