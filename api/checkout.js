// Creates a Stripe Checkout session. Defaults to a one-time payment (mode:'payment').
// Pass { mode: 'subscription' } explicitly if a recurring order is ever wanted again.
// Uses plain fetch (no stripe npm package) so it never breaks the build.
// Needs env var STRIPE_SECRET_KEY.

// Public anon key, same one already embedded throughout the frontend - protected by RLS,
// safe to use server-side for read-only public catalog/pricing lookups.
const SUPABASE_URL = 'https://cajerxgiwbgevfjzkkoy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhamVyeGdpd2JnZXZmanpra295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDY0NDcsImV4cCI6MjA5NjAyMjQ0N30.8dCTpfeWkdUIjmKGgfnrOqlBa1jIwDt_yqg3Dlt1a0M';

// Looks up the correct price server-side for a given product+quantity. Checks pricing_tiers
// first (quantity-based pricing, e.g. the monthly kit); falls back to the product's flat
// price_per_unit for non-tiered products. Never trusts anything the client sent about price.
async function resolveServerPrice(productSlug, quantity) {
  const prodRes = await fetch(
    SUPABASE_URL + '/rest/v1/products?slug=eq.' + encodeURIComponent(productSlug) + '&active=eq.true&select=*',
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
  );
  const prodRows = await prodRes.json();
  const product = Array.isArray(prodRows) ? prodRows[0] : null;
  if (!product) return null;

  const tierRes = await fetch(
    SUPABASE_URL + '/rest/v1/pricing_tiers?product_slug=eq.' + encodeURIComponent(productSlug) +
      '&active=eq.true&min_quantity=lte.' + quantity + '&select=*',
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
  );
  const tierRows = await tierRes.json();
  const tier = Array.isArray(tierRows)
    ? tierRows.find((t) => t.max_quantity === null || quantity <= t.max_quantity)
    : null;

  if (tier) {
    return {
      unitAmount: parseFloat(tier.price_per_unit),
      stripePriceId: tier.stripe_price_id || null,
      minQuantity: product.minimum_quantity,
    };
  }
  if (product.price_per_unit != null) {
    return {
      unitAmount: parseFloat(product.price_per_unit),
      stripePriceId: product.stripe_price_id || null,
      minQuantity: product.minimum_quantity,
    };
  }
  return null;
}

// Looks up per-unit prices for a list of product slugs directly, ignoring any
// pricing_tiers rows (only the base monthly-customer-kits product uses tiers) -
// used for the individually-priced kit components/extras a customer can add or remove.
async function resolveComponentPrices(slugs) {
  if (!slugs || slugs.length === 0) return {};
  const orFilter = slugs.map((s) => 'slug.eq.' + encodeURIComponent(s)).join(',');
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/products?or=(' + orFilter + ')&active=eq.true&select=slug,price_per_unit',
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
  );
  const rows = await res.json();
  const priceMap = {};
  if (Array.isArray(rows)) {
    rows.forEach((r) => { priceMap[r.slug] = parseFloat(r.price_per_unit) || 0; });
  }
  return priceMap;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    const mode = body.mode === 'subscription' ? 'subscription' : 'payment';
    const summary = (body.summary || 'Brandr order').toString().slice(0, 250);
    const ref = (body.ref || '').toString().slice(0, 100);

    // ---- Server-verified path: client sends ONLY productSlug + quantity. ----
    // The server independently looks up the correct price (tiered or flat) and the
    // matching Stripe Price ID. Any dollar amount the client might also send is ignored
    // entirely on this path - this is the only path that should be used for pricing
    // that can change by quantity tier (e.g. the monthly kit).
    const hasProductSlug = typeof body.productSlug === 'string' && body.productSlug.length > 0;

    // ---- Per-unit x quantity path (legacy/individual products: trusted unitAmount) ----
    const hasUnitQty = !hasProductSlug && body.unitAmount !== undefined && body.quantity !== undefined;

    let amount, quantity, unitAmount, resolvedStripePriceId = null;
    let selectedComponents = null;
    let selectedExtras = null;

    if (hasProductSlug) {
      quantity = parseInt(body.quantity, 10);
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }
      const resolved = await resolveServerPrice(body.productSlug, quantity);
      if (!resolved) {
        return res.status(400).json({ error: 'Unknown product or pricing not configured' });
      }
      if (resolved.minQuantity && quantity < resolved.minQuantity) {
        return res.status(400).json({ error: 'Quantity below minimum order of ' + resolved.minQuantity });
      }
      unitAmount = resolved.unitAmount;
      resolvedStripePriceId = resolved.stripePriceId;

      // Kit customization: the monthly kit's base price assumes all 4 removable
      // components are included. If the client is removing/adding any, adjust the
      // per-unit price server-side using each component's own real price - never trust
      // a client-sent price delta. A Stripe Price ID only applies to the *unmodified*
      // bundle, so any customization forces the inline price_data path below.
      const DEFAULT_KIT_COMPONENTS = ['branded-air-fresheners', 'branded-microfiber-towels', 'referral-cards', 'thank-you-cards', 'review-cards'];
      const KNOWN_EXTRAS = ['key-tags', 'stickers', 'decals', 'business-cards'];
      if (body.productSlug === 'monthly-customer-kits') {
        const requestedComponents = Array.isArray(body.components)
          ? body.components.filter((s) => DEFAULT_KIT_COMPONENTS.includes(s))
          : DEFAULT_KIT_COMPONENTS; // no selection sent: assume the unmodified default kit
        const requestedExtras = Array.isArray(body.extras)
          ? body.extras.filter((s) => KNOWN_EXTRAS.includes(s))
          : [];
        const isCustomized = requestedComponents.length !== DEFAULT_KIT_COMPONENTS.length || requestedExtras.length > 0;
        if (isCustomized) {
          const priceMap = await resolveComponentPrices([...DEFAULT_KIT_COMPONENTS, ...KNOWN_EXTRAS]);
          const removed = DEFAULT_KIT_COMPONENTS
            .filter((s) => !requestedComponents.includes(s))
            .reduce((sum, s) => sum + (priceMap[s] || 0), 0);
          const added = requestedExtras.reduce((sum, s) => sum + (priceMap[s] || 0), 0);
          unitAmount = Math.max(1, unitAmount - removed + added);
          resolvedStripePriceId = null; // force inline price_data, a saved Price ID can't reflect this
        }
        selectedComponents = requestedComponents;
        selectedExtras = requestedExtras;
      }
      amount = unitAmount * quantity;
    } else if (hasUnitQty) {
      unitAmount = parseFloat(body.unitAmount);
      quantity = parseInt(body.quantity, 10);
      if (!unitAmount || unitAmount <= 0 || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Invalid unitAmount/quantity' });
      }
      amount = unitAmount * quantity;
    } else {
      amount = parseInt(body.amount, 10);
      quantity = 1;
    }

    // $30 floor matches the site's minimum one-time order; $10000 ceiling covers the
    // largest realistic monthly-kit order (500 customers) with headroom.
    if (!amount || amount < 30 || amount > 10000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const origin = req.headers.origin || 'https://shoppodium.vercel.app';
    const productName = mode === 'subscription' ? 'Brandr monthly bags' : 'Brandr order';
    // Optional per-call redirect override (same-origin only). Falls back to the original
    // ShopPodium defaults so every existing caller keeps working exactly as before.
    const isSafePath = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
    const successUrl = isSafePath(body.successUrl) ? origin + body.successUrl : origin + '/shoppodium-thankyou.html';
    const cancelUrl = isSafePath(body.cancelUrl) ? origin + body.cancelUrl : origin + '/volt.html';

    // Build form-encoded params for Stripe's API
    const params = new URLSearchParams();
    params.append('mode', mode);
    if (mode === 'subscription') {
      params.append('custom_text[submit][message]', 'Cancel anytime. No long-term commitment. Billed month to month.');
    }
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);

    // ================================================================
    // >>> WHERE THE REAL STRIPE PRICE IDs GO, ONCE THEY EXIST <<<
    // For quantity-tiered products (the monthly kit): set stripe_price_id on each row
    // of the `pricing_tiers` table in Supabase (one Stripe recurring Price per tier).
    // For flat-priced products: set stripe_price_id on the product's row in `products`.
    // resolveServerPrice() above already reads both of those columns automatically -
    // no code changes needed here once the real IDs are inserted into the database.
    // ================================================================
    const BRANDR_KIT_PRICE_ID = process.env.BRANDR_KIT_PRICE_ID || null; // legacy single-price fallback, pre-tiers

    if (hasProductSlug && resolvedStripePriceId) {
      params.append('line_items[0][price]', resolvedStripePriceId);
      params.append('line_items[0][quantity]', String(quantity));
    } else if (hasProductSlug) {
      // No Stripe Price saved for this tier/product yet: still real server-computed
      // unit-price x quantity math, built inline until a real Price ID is added.
      params.append('line_items[0][quantity]', String(quantity));
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(unitAmount * 100)));
      if (mode === 'subscription') {
        params.append('line_items[0][price_data][recurring][interval]', 'month');
      }
      params.append('line_items[0][price_data][product_data][name]', productName);
      params.append('line_items[0][price_data][product_data][description]', summary);
    } else if (hasUnitQty && BRANDR_KIT_PRICE_ID) {
      params.append('line_items[0][price]', BRANDR_KIT_PRICE_ID);
      params.append('line_items[0][quantity]', String(quantity));
    } else if (hasUnitQty) {
      params.append('line_items[0][quantity]', String(quantity));
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(unitAmount * 100)));
      if (mode === 'subscription') {
        params.append('line_items[0][price_data][recurring][interval]', 'month');
      }
      params.append('line_items[0][price_data][product_data][name]', productName);
      params.append('line_items[0][price_data][product_data][description]', summary);
    } else {
      // Original flat-amount path, unchanged, for every existing caller.
      params.append('line_items[0][quantity]', '1');
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(amount * 100));
      if (mode === 'subscription') {
        params.append('line_items[0][price_data][recurring][interval]', 'month');
      }
      params.append('line_items[0][price_data][product_data][name]', productName);
      params.append('line_items[0][price_data][product_data][description]', summary);
    }

    params.append('shipping_address_collection[allowed_countries][0]', 'US');
    if (ref) {
      params.append('metadata[ref]', ref);
      if (mode === 'subscription') params.append('subscription_data[metadata][ref]', ref);
    }
    params.append('metadata[summary]', summary);
    params.append('metadata[mode]', mode);
    if (hasProductSlug || hasUnitQty) {
      params.append('metadata[quantity]', String(quantity));
      params.append('metadata[unit_amount]', String(unitAmount));
      if (mode === 'subscription') {
        params.append('subscription_data[metadata][quantity]', String(quantity));
      }
    }
    if (hasProductSlug) params.append('metadata[product_slug]', body.productSlug);
    if (mode === 'subscription' && hasProductSlug) params.append('subscription_data[metadata][product_slug]', body.productSlug);
    // Kit customization selection, read by the webhook to build the right fulfillment
    // items instead of always assuming the fixed default 5-component kit.
    if (selectedComponents) {
      const componentsJson = JSON.stringify(selectedComponents).slice(0, 480);
      params.append('metadata[selected_components]', componentsJson);
      if (mode === 'subscription') params.append('subscription_data[metadata][selected_components]', componentsJson);
    }
    if (selectedExtras && selectedExtras.length > 0) {
      const extrasJson = JSON.stringify(selectedExtras).slice(0, 480);
      params.append('metadata[selected_extras]', extrasJson);
      if (mode === 'subscription') params.append('subscription_data[metadata][selected_extras]', extrasJson);
    }
    // Business info collected on the Brandr setup page. Mirrored onto the subscription
    // itself (not just this checkout session) so every future renewal invoice - which
    // only has access to the subscription's own metadata, not this session's - can still
    // build a correct fulfillment order.
    if (body.bizName) {
      params.append('metadata[biz_name]', String(body.bizName).slice(0, 200));
      if (mode === 'subscription') params.append('subscription_data[metadata][biz_name]', String(body.bizName).slice(0, 200));
    }
    if (body.bizWeb) {
      params.append('metadata[biz_web]', String(body.bizWeb).slice(0, 200));
      if (mode === 'subscription') params.append('subscription_data[metadata][biz_web]', String(body.bizWeb).slice(0, 200));
    }
    if (body.bizEmail) {
      const email = String(body.bizEmail).slice(0, 200);
      params.append('metadata[biz_email]', email);
      params.append('customer_email', email);
      if (mode === 'subscription') params.append('subscription_data[metadata][biz_email]', email);
    }
    if (body.logoUrl) {
      params.append('metadata[logo_url]', String(body.logoUrl).slice(0, 500));
      if (mode === 'subscription') params.append('subscription_data[metadata][logo_url]', String(body.logoUrl).slice(0, 500));
    }
    if (body.reviewLink) {
      params.append('metadata[review_link]', String(body.reviewLink).slice(0, 500));
      if (mode === 'subscription') params.append('subscription_data[metadata][review_link]', String(body.reviewLink).slice(0, 500));
    }

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json({ url: data.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
