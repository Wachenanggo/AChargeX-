/**
 * Request authentication.
 *  - Production: Supabase access token (HS256 JWT) verified with SUPABASE_JWT_SECRET.
 *    Role comes from app_metadata.role (set server-side only — never user_metadata).
 *  - Demo mode: x-demo-role / x-demo-user headers (or ?role=&user= for SSE). Clearly demo-only.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isRole, type Role } from '@achargex/shared';
import type { Principal } from './csms';

export interface AuthConfig {
  demoMode: boolean;
  jwtSecret?: string;
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header: { alg?: string };
  try {
    header = JSON.parse(b64urlDecode(h).toString('utf8'));
  } catch {
    return null;
  }
  if (header.alg !== 'HS256') return null;
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const given = b64urlDecode(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p).toString('utf8')) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const DEMO_USER: Record<Role, string> = {
  guest: 'demo-guest',
  driver: 'demo-driver',
  owner: 'demo-owner',
  operator: 'demo-operator',
  admin: 'demo-admin',
  super_admin: 'demo-super',
};

export function authenticate(req: IncomingMessage, url: URL, cfg: AuthConfig): Principal {
  const authz = req.headers.authorization;
  const bearer = authz?.startsWith('Bearer ') ? authz.slice(7) : url.searchParams.get('token') ?? undefined;
  if (bearer && cfg.jwtSecret) {
    const claims = verifyHs256(bearer, cfg.jwtSecret);
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
}
