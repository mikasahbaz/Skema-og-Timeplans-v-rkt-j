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
  /**
   * Signeringsnøglen afhænger af rollens adgangskode. Skiftes ADMIN_PASSWORD (eller
   * VIEWER_PASSWORD), bliver alle eksisterende logins for den rolle automatisk ugyldige.
   */
  private keys: Record<Role, string>;
  constructor(
    secret: string,
    passwords: { admin: string; viewer: string | null },
    private secure: boolean,
  ) {
    const derive = (role: Role, pw: string) => crypto.createHash('sha256').update(`${secret}:${role}:${pw}`).digest('hex');
    this.keys = { admin: derive('admin', passwords.admin), viewer: derive('viewer', passwords.viewer ?? '') };
  }

  private sign(payload: string, role: Role) {
    return crypto.createHmac('sha256', this.keys[role]).update(payload).digest('base64url');
  }

  issue(res: Response, role: Role) {
    const payload = b64(JSON.stringify({ r: role, exp: Date.now() + MAX_AGE_MS }));
    res.cookie(COOKIE, `${payload}.${this.sign(payload, role)}`, {
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
    if (!payload || !sig) return null;
    try {
      const { r, exp } = JSON.parse(unb64(payload)) as { r: Role; exp: number };
      if (r !== 'admin' && r !== 'viewer') return null;
      if (!safeEqual(sig, this.sign(payload, r))) return null;
      if (typeof exp !== 'number' || exp < Date.now()) return null;
      return r;
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

/**
 * Beskyttelse mod gætteangreb: højst 20 forkerte forsøg pr. IP pr. 10 minutter.
 * Grænsen er sat, så en skole bag én fælles IP-adresse ikke spærrer sig selv ude ved
 * almindelige tastefejl. Kræver TRUST_PROXY=true bag en proxy, så den rigtige IP bruges.
 */
export class LoginLimiter {
  static readonly MAX = 20;
  static readonly WINDOW_MS = 10 * 60 * 1000;
  private failures = new Map<string, number[]>();
  blocked(ip: string): boolean {
    const now = Date.now();
    const list = (this.failures.get(ip) ?? []).filter((t) => now - t < LoginLimiter.WINDOW_MS);
    if (list.length) this.failures.set(ip, list);
    else this.failures.delete(ip);
    return list.length >= LoginLimiter.MAX;
  }
  fail(ip: string) {
    // Undgå ubegrænset hukommelsesforbrug ved mange forskellige IP-adresser.
    if (this.failures.size > 10_000) {
      const now = Date.now();
      for (const [k, v] of this.failures) if (!v.some((t) => now - t < LoginLimiter.WINDOW_MS)) this.failures.delete(k);
      if (this.failures.size > 10_000) this.failures.clear();
    }
    this.failures.set(ip, [...(this.failures.get(ip) ?? []), Date.now()].slice(-LoginLimiter.MAX));
  }
  reset(ip: string) {
    this.failures.delete(ip);
  }
}
