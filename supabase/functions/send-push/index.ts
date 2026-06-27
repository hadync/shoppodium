import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Base64url helpers
const b64url = (buf: Uint8Array) => btoa(String.fromCharCode(...buf))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

const b64urlDecode = (str: string) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

async function buildVapidAuth(audience: string): Promise<string> {
  const privateKeyRaw = b64urlDecode(Deno.env.get('VAPID_PRIVATE_KEY') || '')
  const publicKeyRaw  = b64urlDecode(Deno.env.get('VAPID_PUBLIC_KEY')  || '')

  const header  = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: 'mailto:hello@shoppodium.com',
  })))

  const sigInput = new TextEncoder().encode(`${header}.${payload}`)

  const key = await crypto.subtle.importKey(
    'raw', privateKeyRaw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, sigInput)
  const jwt = `${header}.${payload}.${b64url(new Uint8Array(sig))}`

  return `vapid t=${jwt},k=${b64url(publicKeyRaw)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { tinter_id, title, body, url } = await req.json()
    if (!tinter_id) return new Response(JSON.stringify({ error: 'Missing tinter_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )

    // Get all push subscriptions for this tinter
    const { data: subs } = await sb
      .from('push_subscriptions')
      .select('*')
      .eq('tinter_id', tinter_id)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const payload = JSON.stringify({ title, body, url: url || '/app2.html' })
    let sent = 0

    for (const sub of subs) {
      try {
        const endpoint = sub.endpoint
        const origin   = new URL(endpoint).origin
        const auth     = await buildVapidAuth(origin)

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': auth,
            'Content-Type':  'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
          },
          body: new TextEncoder().encode(payload),
        })

        if (res.status === 410 || res.status === 404) {
          // Subscription expired — remove it
          await sb.from('push_subscriptions').delete().eq('id', sub.id)
        } else if (res.ok || res.status === 201) {
          sent++
        }
      } catch (e) {
        console.error('Push send error:', e)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
