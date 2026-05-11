// Stripe Webhook → Global Control Tag Fire
// Fires "Buyer-Get10Clients" tag when checkout.session.completed

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const GC_API_KEY = process.env.GC_API_KEY;
const GC_TAG_ID = '6a01361d7a98f2fec573491a'; // Buyer-Get10Clients
const GC_API_URL = `https://api.globalcontrol.io/api/ai/tags/fire-tag/${GC_TAG_ID}`;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Stripe signature
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // Only process completed checkouts
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;
  const email = session.customer_details?.email || session.customer_email;
  const name = session.customer_details?.name || '';
  const firstName = name.split(' ')[0] || '';
  const lastName = name.split(' ').slice(1).join(' ') || '';

  if (!email) {
    console.error('No email found in session');
    return res.status(200).json({ received: true, error: 'No email in session' });
  }

  console.log(`Firing GC tag for: ${email}`);

  // Fire tag in Global Control
  try {
    const gcRes = await fetch(GC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': GC_API_KEY,
      },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
      }),
    });

    const gcData = await gcRes.json();
    console.log('GC response:', JSON.stringify(gcData));

    return res.status(200).json({
      received: true,
      email,
      gc: gcData.type || 'fired',
    });
  } catch (err) {
    console.error('GC tag fire failed:', err.message);
    return res.status(200).json({ received: true, gc_error: err.message });
  }
}

// Helper to get raw body for Stripe signature verification
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });
}

export const config = {
  api: {
    bodyParser: false, // Required for Stripe signature verification
  },
};
