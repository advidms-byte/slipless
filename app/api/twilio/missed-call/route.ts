import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase'
import { sendSMS, validateTwilioSignature } from '../../../../lib/twilio'
import { generateInitialMessage } from '../../../../lib/ai-agent'

const MISSED_CALL_STATUSES = new Set(['no-answer', 'busy', 'failed'])
const REQUIRED_TWILIO_FIELDS = ['CallStatus', 'From', 'To', 'CallSid'] as const

type TwilioParams = Record<string, string>

function jsonError(message: string, status: number, details?: unknown) {
  console.error(`[twilio/missed-call] ${message}`, details ?? '')
  return NextResponse.json({ error: message }, { status })
}

function getWebhookUrl(req: NextRequest) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  return configuredBaseUrl ? `${configuredBaseUrl}/api/twilio/missed-call` : req.url
}

function validateRequiredParams(params: TwilioParams) {
  return REQUIRED_TWILIO_FIELDS.filter(field => !params[field])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params: TwilioParams = Object.fromEntries(new URLSearchParams(body))

    const missingParams = validateRequiredParams(params)
    if (missingParams.length > 0) {
      return jsonError(`Missing Twilio parameter(s): ${missingParams.join(', ')}`, 400)
    }

    const signature = req.headers.get('x-twilio-signature') || ''
    const url = getWebhookUrl(req)
    if (!signature || !validateTwilioSignature(signature, url, params)) {
      return jsonError('Invalid Twilio signature', 403)
    }

    const callStatus = params.CallStatus
    if (!MISSED_CALL_STATUSES.has(callStatus)) {
      return NextResponse.json({ skipped: true, reason: `CallStatus ${callStatus} does not require follow-up` })
    }

    const callerPhone = params.From
    const twilioNumber = params.To
    const callSid = params.CallSid
    const supabase = createAdminClient()

    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('*')
      .eq('twilio_number', twilioNumber)
      .maybeSingle()

    if (bizError) return jsonError('Failed to look up business', 500, bizError)
    if (!business) return jsonError('Business not found for Twilio number', 404)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: existingLead, error: existingLeadError } = await supabase
      .from('leads')
      .select('id')
      .eq('business_id', business.id)
      .eq('caller_phone', callerPhone)
      .in('status', ['new', 'in-progress'])
      .gte('created_at', todayStart.toISOString())
      .maybeSingle()

    if (existingLeadError) return jsonError('Failed to check duplicate lead', 500, existingLeadError)
    if (existingLead) return NextResponse.json({ skipped: true, reason: 'duplicate', leadId: existingLead.id })

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({ business_id: business.id, caller_phone: callerPhone, call_sid: callSid, status: 'new' })
      .select()
      .single()

    if (leadError || !lead) return jsonError('Failed to create lead', 500, leadError)

    let messageBody: string
    try {
      messageBody = await generateInitialMessage(business, callerPhone)
    } catch (error) {
      messageBody = `Hi! This is ${business.ai_persona_name} from ${business.name}. Sorry we missed your call — how can we help today?`
      console.error('[twilio/missed-call] AI generation failed; using fallback message', error)
    }

    let smsSid: string
    try {
      smsSid = await sendSMS(callerPhone, twilioNumber, messageBody)
    } catch (error) {
      await supabase.from('leads').update({ status: 'lead' }).eq('id', lead.id)
      return jsonError('Failed to send SMS follow-up', 502, error)
    }

    const { error: messageError } = await supabase.from('messages').insert({
      lead_id: lead.id,
      business_id: business.id,
      direction: 'outbound',
      body: messageBody,
      twilio_sid: smsSid,
    })

    if (messageError) return jsonError('SMS sent, but failed to save message', 500, messageError)

    const { error: updateError } = await supabase
      .from('leads')
      .update({ status: 'in-progress' })
      .eq('id', lead.id)

    if (updateError) return jsonError('Lead created, but failed to update status', 500, updateError)

    return NextResponse.json({ success: true, leadId: lead.id })
  } catch (error) {
    return jsonError('Unexpected missed-call webhook error', 500, error)
  }
}
