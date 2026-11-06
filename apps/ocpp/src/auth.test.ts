import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { verifyJwt, Jwks, createAuthenticator } from './auth';
import type { IncomingMessage } from 'node:http';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const claims = (extra: object = {}) => ({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600, app_metadata: { role: 'owner' }, ...extra });

function hs256(payload: object, secret: string) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${b64u(createHmac('sha256', secret).update(`${h}.${p}`).digest())}`;
}

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig' };
function es256(payload: object, kid = 'k1') {
  const h = b64u(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${b64u(sign('sha256', Buffer.from(`${h}.${p}`), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' }))}`;
}

let server: Server;
let jwks: Jwks;
let url = '';
beforeAll(async () => {
  server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })));
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  jwks = new Jwks(`${url}/auth/v1/.well-known/jwks.json`);
  await jwks.refresh(true);
});
afterAll(() => server.close());

describe('JWT verification', () => {
  it('accepts valid HS256 and rejects wrong secret / expired / tampered', () => {
    expect(verifyJwt(hs256(claims(), 's3cret'), { secret: 's3cret' })?.sub).toBe('user-1');
    expect(verifyJwt(hs256(claims(), 'other'), { secret: 's3cret' })).toBeNull();
    expect(verifyJwt(hs256(claims({ exp: 1 }), 's3cret'), { secret: 's3cret' })).toBeNull();
    const t = hs256(claims(), 's3cret').split('.');
    t[1] = b64u(JSON.stringify(claims({ app_metadata: { role: 'super_admin' } })));
    expect(verifyJwt(t.join('.'), { secret: 's3cret' })).toBeNull();
  });

  it('accepts ES256 signed by a JWKS key and rejects unknown kid / alg none', () => {
    expect(verifyJwt(es256(claims()), { jwks })?.sub).toBe('user-1');
    expect(verifyJwt(es256(claims(), 'unknown'), { jwks })).toBeNull();
    const none = `${b64u(JSON.stringify({ alg: 'none' }))}.${b64u(JSON.stringify(claims()))}.`;
    expect(verifyJwt(none, { jwks, secret: 'x' })).toBeNull();
  });

  it('maps app_metadata.role and ignores demo headers outside demo mode', async () => {
    const auth = createAuthenticator({ demoMode: false, supabaseUrl: url });
    await new Promise((r) => setTimeout(r, 50));
    const req = (h: Record<string, string>) => ({ headers: h }) as unknown as IncomingMessage;
    const u = new URL('http://x/api');
    expect(auth(req({ authorization: `Bearer ${es256(claims())}` }), u)).toMatchObject({ userId: 'user-1', role: 'owner', isDemo: false });
    expect(auth(req({ 'x-demo-role': 'super_admin' }), u)).toMatchObject({ role: 'guest' });
  });
});
