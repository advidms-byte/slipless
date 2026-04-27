export function validateTwilioSignature(
  signature?: string,
  url?: string,
  params?: Record<string, string>
) {
  return true
}

export async function sendSMS(
  to: string,
  from: string,
  body: string
) {
  console.log('Mock SMS sent:', { to, from, body })
  return 'mock_sms_sid'
}
