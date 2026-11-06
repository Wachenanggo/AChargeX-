/**
 * AChargeX OCPP service factory.
 *   ws(s)://<host>/ocpp/<chargePointId>   — chargers (OCPP 2.0.1 / 1.6J, negotiated)
 *   http(s)://<host>/api/...               — REST + SSE for the web app
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { negotiateSubprotocol, DEMO_INITIAL_STATUS, type OcppVersion } from '@achargex/shared';
import { Store } from './store';
import { Csms } from './csms';
import { createApi } from './api';
import { SimulatedChargePoint } from './sim/simulator';
import { startSupabaseMirror } from './supabase-mirror';

export interface OcppServerOptions {
  port: number;
  demoMode: boolean;
  simulator: boolean;
  simSpeed: number;
  simMeterIntervalMs?: number;
  simSecret?: string;
  allowUnregistered: boolean;
  publicOcppUrl?: string;
  publicAppUrl: string;
  heartbeatS: number;
  corsOrigin: string;
  allowDemoPaymentOnReal: boolean;
  supabase?: { url: string; serviceKey: string; jwtSecret: string };
  quiet?: boolean;
}

export function createOcppServer(o: OcppServerOptions) {
  const log = (...a: unknown[]) => !o.quiet && console.log(...a);
  const SIM_SECRET = o.simSecret ?? randomBytes(24).toString('hex');
  const store = new Store();
  if (o.demoMode) store.seedDemo();
  const csms = new Csms(store, { allowDemoPaymentOnReal: o.allowDemoPaymentOnReal, heartbeatIntervalS: o.heartbeatS });
  let publicOcppUrl = o.publicOcppUrl ?? `ws://localhost:${o.port}/ocpp`;
  const apiCfg = {
    demoMode: o.demoMode,
    jwtSecret: o.supabase?.jwtSecret,
    publicOcppUrl,
    publicAppUrl: o.publicAppUrl,
    corsOrigin: o.corsOrigin,
    supabaseConfigured: !!o.supabase,
  };
  const api = createApi(store, csms, apiCfg);

  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('AChargeX OCPP service — chargers connect to /ocpp/<identity>\n');
      return;
    }
    void api(req, res);
  });

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => negotiateSubprotocol([...protocols]) ?? false,
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const m = url.pathname.match(/^\/ocpp\/([^/]+)\/?$/);
    const reject = (code: number, msg: string) => {
      socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (!m) return reject(404, 'Not Found');
    const identity = decodeURIComponent(m[1]);
    if (!/^[A-Za-z0-9._:\-*]{1,48}$/.test(identity)) return reject(400, 'Bad Identity');

    const offered = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const proto = negotiateSubprotocol(offered);
    if (!proto) return reject(400, 'Unsupported OCPP subprotocol (offer ocpp2.0.1 or ocpp1.6)');
    const version: OcppVersion = proto === 'ocpp2.0.1' ? '2.0.1' : '1.6';

    // --- simulator isolation ---
    const simHeader = req.headers['x-achargex-simulator'];
    const isSimId = identity.startsWith('SIM-');
    const isSim = simHeader === SIM_SECRET;
    if (isSimId && !isSim) return reject(403, 'Forbidden');
    if (!isSimId && simHeader) return reject(403, 'Forbidden');

    // --- charger authentication (Security Profile 1) ---
    if (!isSim) {
      const registered = store.findCharger(identity);
      if (registered) {
        const auth = req.headers.authorization;
        const decoded = auth?.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString('utf8') : '';
        const idx = decoded.indexOf(':');
        const user = idx >= 0 ? decoded.slice(0, idx) : '';
        const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
        if (store.chargerSecrets.has(identity) && (user !== identity || !store.verifyChargerPassword(identity, pass))) return reject(401, 'Unauthorized');
      } else if (!o.allowUnregistered) {
        return reject(404, 'Unknown charger');
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = csms.attach(identity, version, isSim, (t) => ws.send(t), () => ws.terminate());
      log(`[ocpp] ${identity} connected (OCPP ${version}${isSim ? ', SIMULATOR' : ''})`);
      ws.on('message', (data) => void conn.receive(data.toString()));
      ws.on('close', () => {
        conn.closed();
        log(`[ocpp] ${identity} disconnected`);
      });
      ws.on('error', (e) => log(`[ocpp] ${identity} socket error`, e.message));
    });
  });

  const sweep = setInterval(() => csms.sweepStale(), 30_000);
  sweep.unref();
  const sims: SimulatedChargePoint[] = [];

  async function start(): Promise<number> {
    await new Promise<void>((r) => server.listen(o.port, r));
    const port = (server.address() as AddressInfo).port;
    if (!o.publicOcppUrl) {
      publicOcppUrl = `ws://localhost:${port}/ocpp`;
      apiCfg.publicOcppUrl = publicOcppUrl;
    }
    log(`AChargeX OCPP service on :${port}`);
    log(`  mode: ${o.demoMode ? 'DEMO' : 'LIVE'} · supabase: ${o.supabase ? 'on' : 'off'} · simulator: ${o.simulator ? 'on' : 'off'}`);
    log(`  chargers connect to: ${publicOcppUrl}/<identity>`);

    if (o.supabase) {
      await startSupabaseMirror(store, { url: o.supabase.url, serviceKey: o.supabase.serviceKey }).catch((e) =>
        console.error('[supabase] mirror failed to start:', (e as Error).message),
      );
    }

    if (o.simulator) {
      // The simulator connects over a real socket to this same server.
      let i = 0;
      for (const station of store.stations.values()) {
        for (const charger of station.chargers.filter((c) => c.isSimulated)) {
          const cons = station.connectors.filter((c) => c.chargerId === charger.id);
          const version: OcppVersion = i++ % 3 === 1 ? '2.0.1' : '1.6';
          sims.push(
            new SimulatedChargePoint({
              url: `ws://127.0.0.1:${port}/ocpp`,
              identity: charger.ocppIdentity,
              version,
              secret: SIM_SECRET,
              speed: o.simSpeed,
              meterIntervalMs: o.simMeterIntervalMs,
              model: charger.model,
              connectors: cons.map((c) => {
                const s = DEMO_INITIAL_STATUS[c.label] ?? 'Available';
                return { id: c.ocppConnectorId, maxKw: c.powerKw, status: s, occupiedByOther: s === 'Charging' };
              }),
            }),
          );
        }
      }
      sims.forEach((s, idx) => setTimeout(() => s.start(), 50 + idx * 40));
      log(`  simulator: ${sims.length} simulated charge points (SIM-*), speed x${o.simSpeed}`);
    }
    return port;
  }

  async function stop() {
    for (const s of sims) s.stop();
    clearInterval(sweep);
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((r) => server.close(() => r()));
  }

  return { store, csms, server, start, stop };
}
