import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { to, message, type } = await req.json()

    if (!to || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, message' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Credentials stored as Supabase secrets — never in client code
    const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')
    const FROM_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
      console.error('Missing Twilio environment variables')
      return new Response(
        JSON.stringify({ error: 'Twilio not configured' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Normalize phone number to E.164 format for Twilio
    const digits = to.replace(/\D/g, '')
    const normalized = digits.startsWith('1') ? '+' + digits : '+1' + digits

    const body = new URLSearchParams({
      To:   normalized,
      From: FROM_NUMBER,
      Body: message,
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error('Twilio error:', result)
      return new Response(
        JSON.stringify({ error: result.message || 'SMS failed', code: result.code }),
        { status: response.status, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`SMS sent [${type || 'general'}] → ${normalized} | SID: ${result.sid}`)

    return new Response(
      JSON.stringify({ success: true, sid: result.sid }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-sms function error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
