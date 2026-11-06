/**
 * Request authentication.
 *  - Production: Supabase access token verified either with the project's JWKS
 *    (asymmetric ES256/RS256 signing keys — default for newer projects) or the legacy
 *    HS256 JWT secret. Role comes from app_metadata.role (server-controlled; never user_metadata).
 *  - Demo mode: x-demo-role header (or ?role= for SSE). Clearly demo-only.
 */
import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify, type KeyObject, type JsonWebKey } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isRole, type Role } from '@achargex/shared';
import type { Principal } from './csms';

export interface AuthConfig {
  demoMode: boolean;
  /** Legacy HS256 secret (optional). */
  jwtSecret?: string;
  /** Supabase project URL — enables JWKS verification. */
  supabaseUrl?: string;
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Cached JWKS keys from <SUPABASE_URL>/auth/v1/.well-known/jwks.json */
export class Jwks {
  private keys = new Map<string, { key: KeyObject; alg: string }>();
  private lastFetch = 0;
  constructor(private url: string) {}

  async refresh(force = false) {
    if (!force && Date.now() - this.lastFetch < 60_000) return;
    this.lastFetch = Date.now();
    try {
      const r = await fetch(this.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { keys?: (JsonWebKey & { kid?: string; alg?: string })[] };
      const next = new Map<string, { key: KeyObject; alg: string }>();
      for (const k of body.keys ?? []) {
        if (!k.kid) continue;
        next.set(k.kid, { key: createPublicKey({ key: k, format: 'jwk' }), alg: k.alg ?? (k.kty === 'EC' ? 'ES256' : 'RS256') });
      }
      this.keys = next;
    } catch (e) {
      console.warn('[auth] JWKS fetch failed:', (e as Error).message);
    }
  }

  get(kid: string | undefined) {
    if (!kid) return undefined;
    const k = this.keys.get(kid);
    if (!k) void this.refresh(); // key rotation: fetch in background; this request fails closed
    return k;
  }
}

export function verifyJwt(token: string, opts: { secret?: string; jwks?: Jwks }): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(b64urlDecode(h).toString('utf8'));
  } catch {
    return null;
  }
  const signed = Buffer.from(`${h}.${p}`);
  const given = b64urlDecode(sig);
  let ok = false;
  if (header.alg === 'HS256' && opts.secret) {
    const expected = createHmac('sha256', opts.secret).update(signed).digest();
    ok = given.length === expected.length && timingSafeEqual(given, expected);
  } else if ((header.alg === 'ES256' || header.alg === 'RS256') && opts.jwks) {
    const k = opts.jwks.get(header.kid);
    if (k && k.alg === header.alg) {
      ok = cryptoVerify('sha256', signed, header.alg === 'ES256' ? { key: k.key, dsaEncoding: 'ieee-p1363' } : k.key, given);
    }
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p).toString('utf8')) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    if (payload.role === 'anon') return null; // anon key is not a user
    return payload;
  } catch {
    return null;
  }
}

/** @deprecated kept for tests */
export function verifyHs256(token: string, secret: string) {
  return verifyJwt(token, { secret });
}

const DEMO_USER: Record<Role, string> = {
  guest: 'demo-guest',
  driver: 'demo-driver',
  owner: 'demo-owner',
  operator: 'demo-operator',
  admin: 'demo-admin',
  super_admin: 'demo-super',
};

export function createAuthenticator(cfg: AuthConfig) {
  const jwks = cfg.supabaseUrl ? new Jwks(`${cfg.supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`) : undefined;
  if (jwks) void jwks.refresh(true);

  return function authenticate(req: IncomingMessage, url: URL): Principal {
    const authz = req.headers.authorization;
    const bearer = authz?.startsWith('Bearer ') ? authz.slice(7) : url.searchParams.get('token') ?? undefined;
    if (bearer && (cfg.jwtSecret || jwks)) {
      const claims = verifyJwt(bearer, { secret: cfg.jwtSecret, jwks });
      if (claims && typeof claims.sub === 'string') {
        const appRole = (claims.app_metadata as { role?: string } | undefined)?.role;
        return { userId: claims.sub, role: isRole(appRole) ? appRole : 'driver', isDemo: false };
      }
    }
    if (cfg.demoMode) {
      const r = (req.headers['x-demo-role'] as string | undefined) ?? url.searchParams.get('role') ?? 'guest';
      const role: Role = isRole(r) ? r : 'guest';
      return { userId: DEMO_USER[role], role, isDemo: true };
    }
    return { userId: 'anonymous', role: 'guest', isDemo: false };
  };
}
