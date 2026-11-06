import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOcppServer } from './app';

let dir = '';
let base = '';
let app: ReturnType<typeof createOcppServer>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'axstatic-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>AChargeX</title>' + 'x'.repeat(2000));
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1);' + ' '.repeat(2000));
  app = createOcppServer({
    port: 0, demoMode: true, simulator: false, simSpeed: 1, allowUnregistered: false, publicAppUrl: 'http://x',
    heartbeatS: 60, corsOrigin: '*', allowDemoPaymentOnReal: false, quiet: true, staticDir: dir,
  });
  base = `http://127.0.0.1:${await app.start()}`;
});
afterAll(async () => {
  await app.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('single-service static hosting', () => {
  it('serves index.html at / and for app routes (SPA fallback)', async () => {
    for (const p of ['/', '/find', '/station/stn-matina', '/control/chargers']) {
      const r = await fetch(base + p);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/html');
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(await r.text()).toContain('<title>AChargeX</title>');
    }
  });
  it('serves hashed assets as immutable and gzipped', async () => {
    const r = await fetch(base + '/assets/app-abc123.js', { headers: { 'accept-encoding': 'gzip' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(r.headers.get('content-encoding')).toBe('gzip');
  });
  it('keeps the API working on the same origin and 404s missing files / traversal', async () => {
    expect((await (await fetch(base + '/api/health')).json()).ok).toBe(true);
    expect((await fetch(base + '/missing.png')).status).toBe(404);
    // Traversal is rejected by the guard and falls back to the app shell — never file contents.
    const t = await (await fetch(base + '/..%2f..%2fetc%2fpasswd')).text();
    expect(t).toContain('<title>AChargeX</title>');
    expect(t).not.toContain('root:');
    expect(await (await fetch(base + '/healthz')).text()).toContain('AChargeX');
  });
});
