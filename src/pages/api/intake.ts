import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { sendEmail, esc } from '../../lib/email';

export const prerender = false;

const OWNER = 'hello@unakin.com';
const PORTAL_LEADS = 'https://portal.unakin.com/admin/leads';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Public project-intake. Validates + honeypot, INSERTs a lead into the shared Unakin Supabase
// (anon-insert-only), then emails the owner (reply-to = the lead) and acknowledges the sender.
// Email is best-effort: the lead is already persisted, so a Resend hiccup never fails the form.
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

  const lead = {
    name: str(b.name, 200) || null,
    email,
    company: str(b.company, 200) || null,
    project,
    budget: str(b.budget, 60) || null,
    timeline: str(b.timeline, 120) || null,
  };
  const { error } = await supabase.from('leads').insert({
    ...lead,
    source: 'unakin.com',
    meta: {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      ua: request.headers.get('user-agent')?.slice(0, 300) ?? null,
    },
  });
  if (error) return json({ error: 'Could not submit — please email hello@unakin.com.' }, 502);

  const who = lead.name || email;
  const firstName = (lead.name || '').split(/\s+/)[0] || 'there';
  const row = (k: string, v: string | null) =>
    v ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0">${esc(v)}</td></tr>` : '';

  const results = await Promise.allSettled([
    sendEmail({
      to: OWNER,
      replyTo: email,
      subject: `New lead: ${who}${lead.company ? ` · ${lead.company}` : ''}${lead.budget ? ` · ${lead.budget}` : ''}`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
        <p style="margin:0 0 14px"><b>${esc(who)}</b> just started a project on unakin.com.</p>
        <table style="border-collapse:collapse">
          ${row('Name', lead.name)}${row('Email', email)}${row('Company', lead.company)}
          ${row('Budget', lead.budget)}${row('Timeline', lead.timeline)}
        </table>
        <p style="margin:16px 0 6px;color:#6b7280">What they're building</p>
        <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #6d4aff;background:#f5f4ff;white-space:pre-wrap">${esc(project)}</blockquote>
        <p style="margin:18px 0 0">Hit <b>reply</b> to answer ${esc(firstName)} directly · <a href="${PORTAL_LEADS}">all leads in the portal</a></p>
      </div>`,
    }),
    sendEmail({
      to: email,
      subject: 'Got it — Unakin',
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">
        <p>Hi ${esc(firstName)},</p>
        <p>Thanks for reaching out — your note landed. I read every one of these myself, and I'll come back to you within a business day with first thoughts and a sketch of how we'd approach it.</p>
        <p style="margin:16px 0 6px;color:#6b7280">For reference, here's what you sent:</p>
        <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #6d4aff;background:#f5f4ff;white-space:pre-wrap">${esc(project)}</blockquote>
        <p style="margin-top:18px">If anything's urgent, just reply to this email.</p>
        <p>— David<br><span style="color:#6b7280">Unakin · design &amp; engineering studio · <a href="https://www.unakin.com" style="color:#6d4aff">unakin.com</a></span></p>
      </div>`,
    }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('lead email failed:', r.reason);
    else if (!r.value.ok && !r.value.skipped) console.error('lead email failed:', r.value.error);
  }

  return json({ ok: true });
};
