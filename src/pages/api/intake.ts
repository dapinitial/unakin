import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Public project-intake. Validates + honeypot, then INSERTs a lead into the shared Unakin
// Supabase (anon-insert-only). The owner reviews leads in the portal.
export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  // Honeypot: real users never fill "website". Silently accept + drop.
  if (str(b.website, 100)) return json({ ok: true });

  const email = str(b.email, 200);
  const project = str(b.project, 5000);
  if (!/.+@.+\..+/.test(email)) return json({ error: 'A valid email is required.' }, 400);
  if (!project) return json({ error: 'Tell us a little about the project.' }, 400);
  if (!supabase) return json({ error: 'Intake is not configured yet.' }, 500);

  const { error } = await supabase.from('leads').insert({
    name: str(b.name, 200) || null,
    email,
    company: str(b.company, 200) || null,
    project,
    budget: str(b.budget, 60) || null,
    timeline: str(b.timeline, 120) || null,
    source: 'unakin.com',
    meta: {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      ua: request.headers.get('user-agent')?.slice(0, 300) ?? null,
    },
  });
  if (error) return json({ error: 'Could not submit — please email hello@unakin.com.' }, 502);
  return json({ ok: true });
};
