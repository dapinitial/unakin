// Password gate for private case studies. One shared password (CASE_STUDY_PASSWORD) unlocks a
// signed, HttpOnly cookie for 14 days; the page checks the signature, never the password again.
// CASE_STUDY_SECRET signs the cookie (falls back to a hash of the password if unset).
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import type { AstroCookies } from 'astro';

const env = (k: string) => process.env[k] ?? (import.meta.env as any)[k];
export const COOKIE = 'unakin_cs';
const DAYS = 14;

const secret = () => env('CASE_STUDY_SECRET') || createHash('sha256').update('cs:' + (env('CASE_STUDY_PASSWORD') ?? '')).digest('hex');
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export const gateConfigured = () => !!env('CASE_STUDY_PASSWORD');

/** Constant-time password check. */
export function passwordOk(input: string): boolean {
  const want = env('CASE_STUDY_PASSWORD');
  if (!want) return false;
  const a = Buffer.from(String(input).trim()), b = Buffer.from(String(want));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mint the cookie value: expiry + signature. */
export function mintToken(): { value: string; expires: Date } {
  const exp = Date.now() + DAYS * 864e5;
  const payload = String(exp);
  return { value: `${payload}.${sign(payload)}`, expires: new Date(exp) };
}

/** True when the request carries a valid, unexpired token. */
export function isUnlocked(cookies: AstroCookies): boolean {
  const raw = cookies.get(COOKIE)?.value;
  if (!raw) return false;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return false;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
