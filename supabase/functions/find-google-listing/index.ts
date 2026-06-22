import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { action, shop_name, city, state, review_url, user_id } = await req.json()
    const GKEY = Deno.env.get('GOOGLE_PLACES_API_KEY')

    // ── FIND: search Google Places for the business ─────────────────
    if (action === 'find') {
      const query = [shop_name, city, state].filter(Boolean).join(' ')
      const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
        `?input=${encodeURIComponent(query)}` +
        `&inputtype=textquery` +
        `&fields=place_id,name,rating,user_ratings_total,formatted_address` +
        `&key=${GKEY}`

      const res = await fetch(url)
      const data = await res.json()

      if (data.status === 'OK' && data.candidates?.length > 0) {
        const p = data.candidates[0]
        return new Response(JSON.stringify({
          found: true,
          place_id: p.place_id,
          name: p.name,
          address: p.formatted_address,
          rating: p.rating,
          review_count: p.user_ratings_total,
          review_url: `https://search.google.com/local/writereview?placeid=${p.place_id}`,
        }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ found: false, searched: [shop_name, city, state].filter(Boolean).join(', ') }),
        { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── REFRESH: re-fetch rating from stored place_id ───────────────
    if (action === 'refresh' && review_url && user_id) {
      const match = review_url.match(/placeid=([^&]+)/)
      const place_id = match?.[1]
      if (!place_id) return new Response(JSON.stringify({ error: 'No place_id in review_url' }), { headers: cors })

      const url = `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${place_id}` +
        `&fields=rating,user_ratings_total` +
        `&key=${GKEY}`

      const res = await fetch(url)
      const data = await res.json()

      if (data.status === 'OK') {
        const sb = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        await sb.from('profiles').update({
          google_rating: data.result.rating,
          google_review_count: data.result.user_ratings_total,
        }).eq('id', user_id)

        return new Response(JSON.stringify({
          rating: data.result.rating,
          review_count: data.result.user_ratings_total,
        }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { headers: cors })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors })
  }
})
