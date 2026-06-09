/**
 * POST /api/signup — adds an email to the unakin Resend Audience (the roster).
 *
 * DigitalOcean Functions web action. No email is sent here, so no verified
 * sending domain is required — this just writes to the list.
 *
 * OPSEC:
 *  - RESEND_API_KEY lives only in the encrypted env var, never client-side
 *  - honeypot + email validation + best-effort rate limit
 *  - IPs are hashed, never stored raw
 *  - duplicates return the same success as new signups → no membership
 *    enumeration
 *  - CORS locked to the unakin origins
 */
const crypto = require('crypto');

const ALLOWED_ORIGINS = new Set([
  'https://unakin.com',
  'https://www.unakin.com',
  'http://localhost:5173',
  'http://localhost:4173',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Warm-container memory only — a hard limiter would need an external store,
// but combined with the honeypot + validation it's enough friction for a
// waitlist. Keyed by hashed IP.
const hits = new Map();
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

let cachedAudienceId = null;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin)
      ? origin
      : 'https://www.unakin.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Content-Type': 'application/json',
  };
}

function reply(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

async function resolveAudienceId(key) {
  if (cachedAudienceId) return cachedAudienceId;
  const res = await fetch('https://api.resend.com/audiences', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`list audiences ${res.status}`);
  const { data } = await res.json();
  if (!data || !data.length) throw new Error('no audiences exist');
  cachedAudienceId = data[0].id; // default "General Audience"
  return cachedAudienceId;
}

async function main(args) {
  const headers = args.__ow_headers || {};
  const origin = headers.origin || '';
  const cors = corsHeaders(origin);
  const method = (args.__ow_method || 'post').toUpperCase();

  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (method !== 'POST') return reply(405, cors, { error: 'method_not_allowed' });

  // Body: DO parses JSON into args; fall back to raw base64 body if needed.
  let email = args.email;
  let company = args.company;
  if (email === undefined && args.__ow_body) {
    try {
      const raw = Buffer.from(args.__ow_body, 'base64').toString('utf8');
      const parsed = JSON.parse(raw);
      email = parsed.email;
      company = parsed.company;
    } catch {
      /* ignore — validation below catches it */
    }
  }

  // Honeypot: a bot filled the hidden field. Accept silently, do nothing.
  if (company) return reply(200, cors, { ok: true });

  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return reply(400, cors, { error: 'invalid_email' });
  }

  // Best-effort per-IP rate limit (hashed IP).
  const ip = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
  const now = Date.now();
  const rec = hits.get(ipHash);
  if (!rec || now > rec.reset) {
    hits.set(ipHash, { n: 1, reset: now + RATE_WINDOW_MS });
  } else if (++rec.n > RATE_MAX) {
    return reply(429, cors, { error: 'rate_limited' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return reply(500, cors, { error: 'server_misconfigured' });

  try {
    const audienceId = process.env.RESEND_AUDIENCE_ID || (await resolveAudienceId(key));
    const res = await fetch(
      `https://api.resend.com/audiences/${audienceId}/contacts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, unsubscribed: false }),
        signal: AbortSignal.timeout(8000),
      }
    );
    // Treat an already-existing contact as success — no enumeration.
    if (!res.ok && res.status !== 409) {
      const detail = await res.text();
      console.error('resend contact failed:', res.status, detail);
      return reply(502, cors, { error: 'upstream' });
    }
    return reply(200, cors, { ok: true });
  } catch (err) {
    console.error('signup error:', err.message);
    return reply(502, cors, { error: 'upstream' });
  }
}

exports.main = main;
