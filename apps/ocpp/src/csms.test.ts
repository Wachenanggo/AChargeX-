/**
 * End-to-end: real HTTP + WebSocket server, simulated charge points over real sockets,
 * full charging session lifecycle on OCPP 1.6J and 2.0.1, commands and security checks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createOcppServer } from './app';
import type { ChargingSession } from '@achargex/shared';

let app: ReturnType<typeof createOcppServer>;
let base = '';
let port = 0;

const api = async (path: string, role = 'driver', init: RequestInit = {}) => {
  const r = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', 'x-demo-role': role, ...(init.headers ?? {}) } });
  return { status: r.status, body: (await r.json()) as any };
};

async function waitFor<T>(fn: () => T | undefined | false | Promise<T | undefined | false>, ms = 15000, step = 100): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error('waitFor timed out');
}

beforeAll(async () => {
  app = createOcppServer({
    port: 0,
    demoMode: true,
    simulator: true,
    simSpeed: 400,
    simMeterIntervalMs: 150,
    allowUnregistered: true,
    publicAppUrl: 'http://localhost:5173',
    heartbeatS: 60,
    corsOrigin: '*',
    allowDemoPaymentOnReal: false,
    quiet: true,
  });
  port = await app.start();
  base = `http://127.0.0.1:${port}`;
  await waitFor(() => app.csms.connections.size >= 10);
  await waitFor(() => app.store.findConnector('con-mtn-b131-1')?.connector.status === 'Available');
  await waitFor(() => app.store.findConnector('con-bgc-d180-1')?.connector.status === 'Available');
}, 30000);

afterAll(async () => {
  await app?.stop();
});

async function runSession(connectorId: string, limitPhp: number) {
  const start = await api('/api/sessions', 'driver', {
    method: 'POST',
    body: JSON.stringify({ connectorId, limitPhp, provider: 'demo', idempotencyKey: 'key-' + Math.random().toString(36).slice(2) }),
  });
  expect(start.status).toBe(200);
  const id = start.body.id as string;
  const charging = await waitFor(async () => {
    const s = (await api(`/api/sessions/${id}`)).body.session as ChargingSession;
    return s.state === 'charging' && s.energyWh > 0 ? s : undefined;
  });
  return { id, charging };
}

describe('CSMS end-to-end', () => {
  it('negotiated both OCPP versions with simulators', () => {
    const versions = new Set([...app.csms.connections.values()].map((c) => c.version));
    expect(versions.has('1.6')).toBe(true);
    expect(versions.has('2.0.1')).toBe(true);
    for (const c of app.csms.connections.values()) expect(c.isSimulated).toBe(true);
  });

  it('runs a full OCPP 1.6 session: authorize → start → meter → stop → capture', async () => {
    expect(app.csms.connections.get('SIM-MTN-B131')?.version).toBe('1.6');
    const { id, charging } = await runSession('con-mtn-b131-1', 500);
    expect(charging.ocppTransactionId).toBeTruthy();
    expect(charging.costPhp).toBeGreaterThan(0);

    const stop = await api(`/api/sessions/${id}/stop`, 'driver', { method: 'POST' });
    expect(stop.status).toBe(200);
    const done = await waitFor(async () => {
      const r = (await api(`/api/sessions/${id}`)).body;
      return r.session.state === 'completed' ? r : undefined;
    });
    expect(done.session.meterStopWh).toBeGreaterThan(done.session.meterStartWh);
    expect(done.payment.state).toBe('captured');
    expect(done.payment.capturedAmount).toBeLessThanOrEqual(500);
    expect(done.payment.isDemo).toBe(true);
  }, 30000);

  it('runs a full OCPP 2.0.1 session via TransactionEvent', async () => {
    expect(app.csms.connections.get('SIM-BGC-D180')?.version).toBe('2.0.1');
    const { id } = await runSession('con-bgc-d180-1', 500);
    await api(`/api/sessions/${id}/stop`, 'driver', { method: 'POST' });
    const done = await waitFor(async () => {
      const r = (await api(`/api/sessions/${id}`)).body;
      return r.session.state === 'completed' ? r : undefined;
    });
    expect(done.session.energyWh).toBeGreaterThan(0);
    expect(done.payment.state).toBe('captured');
  }, 30000);

  it('auto-stops when the spending limit is reached and never charges above the hold', async () => {
    const { id } = await runSession('con-qcc-d060-1', 5);
    const done = await waitFor(async () => {
      const r = (await api(`/api/sessions/${id}`)).body;
      return r.session.state === 'completed' ? r : undefined;
    }, 20000);
    expect(done.session.stopReason).toBe('LimitReached');
    expect(done.payment.capturedAmount).toBeLessThanOrEqual(5);
  }, 30000);

  it('refuses to start on a faulted connector and for guests', async () => {
    const faulted = await api('/api/sessions', 'driver', { method: 'POST', body: JSON.stringify({ connectorId: 'con-mtn-a022-1', limitPhp: 200, provider: 'demo', idempotencyKey: 'k-faulted-1' }) });
    expect(faulted.status).toBe(409);
    const guest = await api('/api/sessions', 'guest', { method: 'POST', body: JSON.stringify({ connectorId: 'con-mtn-b131-1', limitPhp: 200, provider: 'demo', idempotencyKey: 'k-guest-1' }) });
    expect(guest.status).toBe(401);
    const unbounded = await api('/api/sessions', 'driver', { method: 'POST', body: JSON.stringify({ connectorId: 'con-mtn-b131-1', limitPhp: 99999, provider: 'demo', idempotencyKey: 'k-big-1' }) });
    expect(unbounded.status).toBe(400);
  });

  it('reports command status only after the charger CALLRESULT', async () => {
    const cmd = await api('/api/control/chargers/SIM-LNG-A201/commands', 'admin', { method: 'POST', body: JSON.stringify({ command: 'getConfig' }) });
    expect(cmd.body.status).toBe('pending');
    const done = await waitFor(async () => {
      const r = (await api(`/api/control/commands/${cmd.body.id}`, 'admin')).body;
      return r.status !== 'pending' ? r : undefined;
    });
    expect(done.status).toBe('Accepted');
    expect(Array.isArray(done.detail)).toBe(true);

    const denied = await api('/api/control/chargers/SIM-LNG-A201/commands', 'operator', { method: 'POST', body: JSON.stringify({ command: 'reset' }) });
    expect(denied.status).toBe(403);
  });

  it('QR resolves, rejects revoked, and never starts anything', async () => {
    const ok = await api('/api/qr/demo_axmtnb1311_qr0001', 'guest');
    expect(ok.body).toEqual({ ok: true, stationId: 'stn-matina', connectorId: 'con-mtn-b131-1' });
    const revoked = await api('/api/qr/demo_revoked_example_qr01', 'guest');
    expect(revoked.body.reason).toBe('revoked');
    expect([...app.store.sessions.values()].some((s) => s.state === 'starting' && s.userId === 'demo-guest')).toBe(false);
  });

  it('rejects a real socket pretending to be a SIM- charger', async () => {
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ocpp/SIM-MTN-B131`, ['ocpp1.6']);
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve(101));
    });
    expect(code).toBe(403);
  });

  it('rejects unsupported subprotocols', async () => {
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ocpp/AX-TEST`, ['ocpp1.5']);
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve(101));
      ws.on('error', () => {});
    });
    expect(code).toBe(400);
  });

  it('owner registers a station, gets charger credentials, and a real charger connects with Basic auth', async () => {
    const created = await api('/api/stations', 'owner', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Owner Station',
        address: 'Test St',
        city: 'Davao City',
        lat: 7.07,
        lng: 125.6,
        is24h: true,
        chargers: [{ vendor: 'TestCo', ocppVersion: '1.6', connectors: [{ type: 'Type2', current: 'AC', powerKw: 22, pricePerKwh: 25 }] }],
      }),
    });
    expect(created.status).toBe(200);
    const cred = created.body.credentials[0];
    expect(created.body.station.listingStatus).toBe('draft');
    expect(cred.url).toContain(`/ocpp/${cred.identity}`);

    const tryConnect = (user: string, pass: string) =>
      new Promise<number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ocpp/${cred.identity}`, ['ocpp1.6'], {
          headers: { authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') },
        });
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
        ws.on('open', () => {
          resolve(101);
          ws.close();
        });
        ws.on('error', () => {});
      });
    expect(await tryConnect(cred.identity, 'wrong')).toBe(401);
    expect(await tryConnect(cred.identity, cred.password)).toBe(101);

    // Real charger + draft station → cannot charge.
    const conId = created.body.station.connectors[0].id;
    const start = await api('/api/sessions', 'driver', { method: 'POST', body: JSON.stringify({ connectorId: conId, limitPhp: 200, provider: 'demo', idempotencyKey: 'k-owner-1' }) });
    expect(start.status).toBe(409);

    // Owner cannot approve own station.
    const sid = created.body.station.id;
    expect((await api(`/api/stations/${sid}/status`, 'owner', { method: 'POST', body: JSON.stringify({ to: 'pending' }) })).status).toBe(200);
    expect((await api(`/api/stations/${sid}/status`, 'owner', { method: 'POST', body: JSON.stringify({ to: 'approved' }) })).status).toBe(409);
    expect((await api(`/api/stations/${sid}/status`, 'admin', { method: 'POST', body: JSON.stringify({ to: 'approved' }) })).status).toBe(200);
  });
});
