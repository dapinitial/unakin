import type { APIRoute } from 'astro';
import { passwordOk, mintToken, COOKIE } from '../../lib/gate';

export const prerender = false;

// POST { password, next } from the lock screen → signed cookie → back to the case study.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const f = await request.formData();
  const password = String(f.get('password') ?? '');
  let next = String(f.get('next') ?? '/case-studies/sonosite');
  if (!next.startsWith('/') || next.startsWith('//')) next = '/'; // same-origin only

  if (!passwordOk(password)) {
    await new Promise((r) => setTimeout(r, 400)); // gentle brake on guessing
    return redirect(`${next}${next.includes('?') ? '&' : '?'}e=1`, 303);
  }
  const { value, expires } = mintToken();
  cookies.set(COOKIE, value, { path: '/', httpOnly: true, secure: request.url.startsWith('https'), sameSite: 'lax', expires });
  return redirect(next, 303);
};
