// Enkel adgang: én administratoradgangskode og valgfri læseadgangskode.
// Sessionen er en HMAC-signeret, HttpOnly cookie. Skriveadgang håndhæves i app.ts.
import crypto from 'node:crypto';
import type { Request, Response } from 'express';

export type Role = 'admin' | 'viewer';
export const COOKIE = 'ugeskema_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 dage

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString();

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export class Sessions {
  constructor(
    private secret: string,
    private secure: boolean,
  ) {}

  private sign(payload: string) {
    return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  issue(res: Response, role: Role) {
    const payload = b64(JSON.stringify({ r: role, exp: Date.now() + MAX_AGE_MS }));
    res.cookie(COOKIE, `${payload}.${this.sign(payload)}`, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      maxAge: MAX_AGE_MS,
      path: '/',
    });
  }

  clear(res: Response) {
    res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: this.secure });
  }

  read(req: Request): Role | null {
    const raw = parseCookies(req.headers.cookie)[COOKIE];
    if (!raw) return null;
    const [payload, sig] = raw.split('.');
    if (!payload || !sig || !safeEqual(sig, this.sign(payload))) return null;
    try {
      const { r, exp } = JSON.parse(unb64(payload)) as { r: Role; exp: number };
      if (typeof exp !== 'number' || exp < Date.now()) return null;
      return r === 'admin' || r === 'viewer' ? r : null;
    } catch {
      return null;
    }
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Simpel beskyttelse mod gætteangreb: max 8 fejl pr. IP pr. 10 minutter. */
export class LoginLimiter {
  private failures = new Map<string, number[]>();
  blocked(ip: string): boolean {
    const now = Date.now();
    const list = (this.failures.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
    this.failures.set(ip, list);
    return list.length >= 8;
  }
  fail(ip: string) {
    this.failures.set(ip, [...(this.failures.get(ip) ?? []), Date.now()]);
  }
  reset(ip: string) {
    this.failures.delete(ip);
  }
}
