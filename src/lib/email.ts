// Transactional email via Resend's HTTP API (same helper shape as the portal). hello@unakin.com
// is a verified Resend sender. No-ops cleanly (ok:false, skipped:true) if the key is unset —
// a lead is never lost because email is down: it's already in Supabase before we get here.
const env = (k: string) => process.env[k] ?? (import.meta.env as any)[k];

/** HTML-escape a user-supplied string before interpolating it into email markup. */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const key = env('RESEND_API_KEY');
  if (!key) return { ok: false, skipped: true };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Unakin <hello@unakin.com>',
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'send failed' };
  }
}
