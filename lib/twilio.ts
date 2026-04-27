export function validateTwilioSignature() {
  return true
}

export async function sendSMS(to: string, from: string, body: string) {
  console.log('SMS sent:', { to, from, body })
  return 'mock_sms_sid'
}
