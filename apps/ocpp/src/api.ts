/** REST + SSE API used by the AChargeX web app (Go / Network / Control). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  can,
  canTransitionListing,
  validateQr,
  parseQrPayload,
  qrUrl,
  type Permission,
  type StationWithDetail,
  type Charger,
  type Connector,
  type Tariff,
  type ConnectorType,
  type CurrentType,
  type ListingStatus,
  type Vehicle,
  type OcppVersion,
} from '@achargex/shared';
import type { Store, BusEvent } from './store';
import { Csms, HttpError, type Principal } from './csms';
import { createAuthenticator, type AuthConfig } from './auth';
import { configuredProviders } from './payments';

export interface ApiConfig extends AuthConfig {
  publicOcppUrl: string;
  publicAppUrl: string;
  corsOrigin: string;
  supabaseConfigured: boolean;
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  p: Principal;
  body: Record<string, unknown>;
}

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  return { method, pattern, keys, handler };
}

function need(p: Principal, perm: Permission) {
  if (!can(p.role, perm)) throw new HttpError(p.role === 'guest' ? 401 : 403, p.role === 'guest' ? 'Sign in required.' : 'You do not have permission for this action.');
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, 'Body too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'Type2', 'CHAdeMO', 'GBT', 'CCS1', 'Type1'];

function str(v: unknown, field: string, max = 200): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required`);
  if (v.length > max) throw new HttpError(400, `${field} is too long`);
  return v.trim();
}
function numIn(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} must be between ${min} and ${max}`);
  return n;
}

export function createApi(store: Store, csms: Csms, cfg: ApiConfig) {
  const authenticate = createAuthenticator(cfg);
  // CORS: "*" or a comma-separated allow-list (include capacitor://localhost and https://localhost for native apps).
  const allowList = cfg.corsOrigin === '*' ? null : cfg.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  const isControl = (p: Principal) => can(p.role, 'control:view');
  const ownsStation = (p: Principal, s: StationWithDetail) => s.ownerId === p.userId;
  const canSeeStation = (p: Principal, s: StationWithDetail) => s.listingStatus === 'approved' || ownsStation(p, s) || isControl(p) || can(p.role, 'admin:approve_stations');

  const withLive = (s: StationWithDetail): StationWithDetail => ({
    ...s,
    chargers: s.chargers.map((c) => ({ ...c, connected: csms.connections.has(c.ocppIdentity) })),
  });

  const getStation = (p: Principal, id: string) => {
    const s = store.stations.get(id);
    if (!s || !canSeeStation(p, s)) throw new HttpError(404, 'Station not found');
    return s;
  };

  const getOwnStation = (p: Principal, id: string) => {
    const s = store.stations.get(id);
    if (!s) throw new HttpError(404, 'Station not found');
    if (!ownsStation(p, s) && !can(p.role, 'admin:approve_stations')) throw new HttpError(403, 'You can only manage your own stations.');
    return s;
  };

  const connectionCard = (identity: string, password?: string) => ({
    identity,
    url: `${cfg.publicOcppUrl.replace(/\/$/, '')}/${identity}`,
    password,
    supportedVersions: ['OCPP 2.0.1', 'OCPP 1.6J'],
    security: 'Security Profile 1 — HTTP Basic auth (username = charge point identity). Use wss:// (TLS) in production.',
  });

  const routes: Route[] = [
    route('GET', '/api/health', () => ({ ok: true, time: new Date().toISOString() })),

    route('GET', '/api/config', ({ p }) => ({
      demoMode: cfg.demoMode,
      supabaseConfigured: cfg.supabaseConfigured,
      ocppUrl: cfg.publicOcppUrl,
      paymentProviders: configuredProviders().filter((x) => x.enabled),
      principal: p,
    })),

    // ---------------- stations (public / driver) ----------------
    route('GET', '/api/stations', ({ p, url }) => {
      const scope = url.searchParams.get('scope');
      let list = [...store.stations.values()];
      if (scope === 'mine') {
        need(p, 'network:manage_own_stations');
        list = list.filter((s) => ownsStation(p, s));
      } else if (scope === 'all') {
        need(p, 'control:view');
      } else {
        list = list.filter((s) => s.listingStatus === 'approved');
      }
      return list.map(withLive);
    }),

    route('GET', '/api/stations/:id', ({ p, params }) => withLive(getStation(p, params.id))),

    // ---------------- QR ----------------
    route('GET', '/api/qr/:token', ({ params }) => {
      const token = parseQrPayload(decodeURIComponent(params.token));
      if (!token) return { ok: false, reason: 'malformed' };
      const v = validateQr(store.qrCodes.get(token));
      if (!v.ok) return v;
      const station = store.stations.get(v.qr.stationId);
      if (!station || station.listingStatus !== 'approved') return { ok: false, reason: 'not_found' };
      const connector = v.qr.connectorId ? station.connectors.find((c) => c.id === v.qr.connectorId) : undefined;
      if (v.qr.connectorId && !connector) return { ok: false, reason: 'not_found' };
      // Resolution only. Never starts charging, authorizes, or changes status.
      return { ok: true, stationId: station.id, connectorId: connector?.id };
    }),

    route('GET', '/api/stations/:id/qr', ({ p, params }) => {
      const s = getOwnStation(p, params.id);
      return [...store.qrCodes.values()]
        .filter((q) => q.stationId === s.id)
        .map((q) => ({ ...q, url: qrUrl(cfg.publicAppUrl, q.token) }));
    }),

    route('POST', '/api/stations/:id/qr', ({ p, params, body }) => {
      const s = getOwnStation(p, params.id);
      if (s.listingStatus !== 'approved') throw new HttpError(409, 'QR labels can be generated only for approved stations.');
      const connectorId = body.connectorId ? String(body.connectorId) : undefined;
      if (connectorId && !s.connectors.find((c) => c.id === connectorId)) throw new HttpError(400, 'Unknown connector');
      // Duplicate handling: reuse an active, non-expiring code for the same target.
      const existing = [...store.qrCodes.values()].find((q) => q.stationId === s.id && q.connectorId === connectorId && !q.revokedAt && !q.expiresAt);
      if (existing && !body.forceNew) return { ...existing, url: qrUrl(cfg.publicAppUrl, existing.token), reused: true };
      const expiresAt = body.expiresInHours ? new Date(Date.now() + numIn(body.expiresInHours, 'expiresInHours', 1, 24 * 90) * 3600_000).toISOString() : undefined;
      const qr = store.newQr(s.id, connectorId, expiresAt);
      store.addAudit(p.userId, p.role, 'qr.create', qr.token, connectorId);
      return { ...qr, url: qrUrl(cfg.publicAppUrl, qr.token) };
    }),

    route('POST', '/api/qr/:token/revoke', ({ p, params }) => {
      const q = store.qrCodes.get(params.token);
      if (!q) throw new HttpError(404, 'QR not found');
      getOwnStation(p, q.stationId);
      q.revokedAt = new Date().toISOString();
      store.addAudit(p.userId, p.role, 'qr.revoke', q.token);
      return q;
    }),

    // ---------------- sessions (driver) ----------------
    route('POST', '/api/sessions', async ({ p, body }) => {
      need(p, 'sessions:start');
      return csms.startSession(p, {
        connectorId: str(body.connectorId, 'connectorId'),
        limitPhp: Number(body.limitPhp),
        provider: str(body.provider, 'provider', 20),
        idempotencyKey: str(body.idempotencyKey, 'idempotencyKey', 80),
        vehicleId: body.vehicleId ? String(body.vehicleId) : undefined,
      });
    }),
    route('GET', '/api/sessions', ({ p }) => {
      need(p, 'sessions:own');
      return [...store.sessions.values()].filter((s) => s.userId === p.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),
    route('GET', '/api/sessions/:id', ({ p, params }) => {
      const s = store.sessions.get(params.id);
      if (!s || (s.userId !== p.userId && !isControl(p))) throw new HttpError(404, 'Session not found');
      const payment = s.paymentTransactionId ? store.payments.get(s.paymentTransactionId) : undefined;
      const station = store.stations.get(s.stationId);
      const connector = station?.connectors.find((c) => c.id === s.connectorId);
      return { session: s, payment, station: station && { id: station.id, name: station.name, address: station.address, city: station.city }, connector };
    }),
    route('POST', '/api/sessions/:id/stop', ({ p, params }) => csms.stopSession(p, params.id)),

    route('GET', '/api/payments', ({ p }) => {
      need(p, 'payments:own');
      return [...store.payments.values()].filter((x) => x.userId === p.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),

    // ---------------- vehicles ----------------
    route('GET', '/api/vehicles', ({ p }) => {
      need(p, 'vehicles:own');
      return store.vehiclesFor(p.userId);
    }),
    route('POST', '/api/vehicles', ({ p, body }) => {
      need(p, 'vehicles:own');
      const list = store.vehiclesFor(p.userId);
      if (list.length >= 10) throw new HttpError(409, 'Vehicle limit reached');
      const connectors = (Array.isArray(body.connectors) ? body.connectors : []).filter((c): c is ConnectorType => CONNECTOR_TYPES.includes(c as ConnectorType));
      if (!connectors.length) throw new HttpError(400, 'Select at least one connector type');
      const v: Vehicle = {
        id: randomUUID(),
        userId: p.userId,
        make: str(body.make, 'make', 40),
        model: str(body.model, 'model', 60),
        nickname: body.nickname ? String(body.nickname).slice(0, 40) : undefined,
        batteryKwh: body.batteryKwh ? numIn(body.batteryKwh, 'batteryKwh', 1, 250) : undefined,
        connectors,
        bodyType: (['sedan', 'suv', 'hatch', 'trike', 'van'] as const).includes(body.bodyType as Vehicle['bodyType']) ? (body.bodyType as Vehicle['bodyType']) : 'sedan',
        plate: body.plate ? String(body.plate).slice(0, 12) : undefined,
        isSelected: list.length === 0,
      };
      list.push(v);
      store.vehiclesChanged(p.userId);
      return v;
    }),
    route('PATCH', '/api/vehicles/:id', ({ p, params, body }) => {
      need(p, 'vehicles:own');
      const list = store.vehiclesFor(p.userId);
      const v = list.find((x) => x.id === params.id);
      if (!v) throw new HttpError(404, 'Vehicle not found');
      if (body.isSelected === true) for (const x of list) x.isSelected = x.id === v.id;
      if (typeof body.nickname === 'string') v.nickname = body.nickname.slice(0, 40);
      if (typeof body.plate === 'string') v.plate = body.plate.slice(0, 12);
      if (body.batteryKwh !== undefined) v.batteryKwh = numIn(body.batteryKwh, 'batteryKwh', 1, 250);
      if (Array.isArray(body.connectors)) {
        const c = body.connectors.filter((x): x is ConnectorType => CONNECTOR_TYPES.includes(x as ConnectorType));
        if (c.length) v.connectors = c;
      }
      store.vehiclesChanged(p.userId);
      return v;
    }),
    route('DELETE', '/api/vehicles/:id', ({ p, params }) => {
      need(p, 'vehicles:own');
      const list = store.vehiclesFor(p.userId);
      const i = list.findIndex((x) => x.id === params.id);
      if (i < 0) throw new HttpError(404, 'Vehicle not found');
      const [removed] = list.splice(i, 1);
      if (removed.isSelected && list[0]) list[0].isSelected = true;
      store.vehiclesChanged(p.userId);
      return { ok: true };
    }),

    // ---------------- Network (owners) ----------------
    route('POST', '/api/stations', ({ p, body }) => {
      need(p, 'network:manage_own_stations');
      const id = 'stn-' + randomBytes(6).toString('hex');
      const chargersIn = Array.isArray(body.chargers) ? (body.chargers as Record<string, unknown>[]) : [];
      if (!chargersIn.length || chargersIn.length > 20) throw new HttpError(400, 'Add between 1 and 20 chargers');
      const chargers: Charger[] = [];
      const connectors: Connector[] = [];
      const tariffs: Tariff[] = [];
      const credentials: ReturnType<typeof connectionCard>[] = [];
      chargersIn.forEach((cIn, ci) => {
        const identity = `AX-${randomBytes(4).toString('hex').toUpperCase()}`;
        const chargerId = `chg-${randomBytes(5).toString('hex')}`;
        chargers.push({
          id: chargerId,
          stationId: id,
          ocppIdentity: identity,
          vendor: cIn.vendor ? String(cIn.vendor).slice(0, 60) : undefined,
          model: cIn.model ? String(cIn.model).slice(0, 60) : undefined,
          ocppVersion: (['1.6', '2.0.1'] as OcppVersion[]).includes(cIn.ocppVersion as OcppVersion) ? (cIn.ocppVersion as OcppVersion) : undefined,
          isSimulated: false,
          connected: false,
          commissioned: false,
        });
        credentials.push(connectionCard(identity, store.setChargerPassword(identity)));
        const consIn = Array.isArray(cIn.connectors) ? (cIn.connectors as Record<string, unknown>[]) : [];
        if (!consIn.length || consIn.length > 8) throw new HttpError(400, `Charger ${ci + 1}: add 1–8 connectors`);
        consIn.forEach((k, ki) => {
          const type = k.type as ConnectorType;
          if (!CONNECTOR_TYPES.includes(type)) throw new HttpError(400, `Charger ${ci + 1}: invalid connector type`);
          const current: CurrentType = k.current === 'DC' ? 'DC' : 'AC';
          const price = numIn(k.pricePerKwh, 'pricePerKwh', 1, 200);
          const tariffId = `trf-${id}-${current}-${price}`;
          if (!tariffs.find((t) => t.id === tariffId)) tariffs.push({ id: tariffId, pricePerKwh: price });
          connectors.push({
            id: `con-${randomBytes(5).toString('hex')}`,
            chargerId,
            ocppConnectorId: ki + 1,
            label: `${identity}-${ki + 1}`,
            type,
            current,
            powerKw: numIn(k.powerKw, 'powerKw', 1, 400),
            status: 'Unknown',
            statusUpdatedAt: new Date().toISOString(),
            tariffId,
          });
        });
      });
      const station: StationWithDetail = {
        id,
        ownerId: p.userId,
        name: str(body.name, 'name', 80),
        address: str(body.address, 'address', 160),
        city: str(body.city, 'city', 60),
        lat: numIn(body.lat, 'lat', 4, 22),
        lng: numIn(body.lng, 'lng', 116, 127),
        listingStatus: 'draft',
        openingHours: body.is24h ? 'Open 24 hours' : str(body.openingHours ?? '8:00 AM – 8:00 PM', 'openingHours', 60),
        is24h: !!body.is24h,
        access: (['public', 'customers', 'private'] as const).includes(body.access as 'public') ? (body.access as 'public') : 'public',
        amenities: Array.isArray(body.amenities) ? body.amenities.map(String).slice(0, 10) : [],
        isDemo: p.isDemo,
        source: 'owner',
        updatedAt: new Date().toISOString(),
        chargers,
        connectors,
        tariffs,
      };
      store.putStation(station);
      store.addAudit(p.userId, p.role, 'station.create', id, station.name);
      return { station, credentials };
    }),

    route('PATCH', '/api/stations/:id', ({ p, params, body }) => {
      const s = getOwnStation(p, params.id);
      if (typeof body.name === 'string') s.name = str(body.name, 'name', 80);
      if (typeof body.address === 'string') s.address = str(body.address, 'address', 160);
      if (typeof body.openingHours === 'string') s.openingHours = str(body.openingHours, 'openingHours', 60);
      if (typeof body.is24h === 'boolean') {
        s.is24h = body.is24h;
        if (s.is24h) s.openingHours = 'Open 24 hours';
      }
      if (Array.isArray(body.tariffs)) {
        for (const t of body.tariffs as { id: string; pricePerKwh: number }[]) {
          const existing = s.tariffs.find((x) => x.id === t.id);
          if (existing) existing.pricePerKwh = numIn(t.pricePerKwh, 'pricePerKwh', 1, 200);
        }
      }
      store.putStation(s);
      store.addAudit(p.userId, p.role, 'station.update', s.id);
      return withLive(s);
    }),

    route('POST', '/api/stations/:id/status', ({ p, params, body }) => {
      const s = store.stations.get(params.id);
      if (!s) throw new HttpError(404, 'Station not found');
      const to = body.to as ListingStatus;
      const asAdmin = can(p.role, 'admin:approve_stations');
      if (!asAdmin && !ownsStation(p, s)) throw new HttpError(403, 'Not your station');
      if (!canTransitionListing(s.listingStatus, to, asAdmin ? 'admin' : 'owner')) throw new HttpError(409, `Cannot change ${s.listingStatus} → ${to}`);
      s.listingStatus = to;
      // Suspension decommissions chargers; they must be re-verified after reinstatement.
      if (to === 'suspended') for (const c of s.chargers) c.commissioned = false;
      store.putStation(s);
      store.addAudit(p.userId, p.role, `station.${to}`, s.id, typeof body.note === 'string' ? body.note.slice(0, 300) : undefined);
      return withLive(s);
    }),

    route('POST', '/api/stations/:id/chargers/:chargerId/commission', ({ p, params }) => {
      need(p, 'admin:approve_stations');
      const s = store.stations.get(params.id);
      const c = s?.chargers.find((x) => x.id === params.chargerId);
      if (!s || !c) throw new HttpError(404, 'Charger not found');
      if (s.listingStatus !== 'approved') throw new HttpError(409, 'Approve the station before commissioning chargers.');
      if (!csms.connections.has(c.ocppIdentity)) throw new HttpError(409, 'The charger must be connected (verified BootNotification) before commissioning.');
      c.commissioned = true;
      store.putStation(s);
      store.addAudit(p.userId, p.role, 'charger.commission', c.ocppIdentity);
      return withLive(s);
    }),

    route('POST', '/api/stations/:id/chargers/:chargerId/rotate-password', ({ p, params }) => {
      const s = getOwnStation(p, params.id);
      const c = s.chargers.find((x) => x.id === params.chargerId);
      if (!c) throw new HttpError(404, 'Charger not found');
      if (c.isSimulated) throw new HttpError(409, 'Simulated chargers do not use passwords.');
      store.addAudit(p.userId, p.role, 'charger.rotate_password', c.ocppIdentity);
      return connectionCard(c.ocppIdentity, store.setChargerPassword(c.ocppIdentity));
    }),

    route('GET', '/api/stations/:id/chargers/:chargerId/connection', ({ p, params }) => {
      const s = getOwnStation(p, params.id);
      const c = s.chargers.find((x) => x.id === params.chargerId);
      if (!c) throw new HttpError(404, 'Charger not found');
      return { ...connectionCard(c.ocppIdentity), live: csms.connectionInfo(c.ocppIdentity), charger: c };
    }),

    route('GET', '/api/network/sessions', ({ p }) => {
      need(p, 'network:manage_own_stations');
      const mine = new Set([...store.stations.values()].filter((s) => ownsStation(p, s)).map((s) => s.id));
      // Owners see session records for their stations without driver identity.
      return [...store.sessions.values()]
        .filter((s) => mine.has(s.stationId))
        .map(({ userId: _u, paymentTransactionId: _pt, ...rest }) => rest)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),

    // ---------------- Control (CSMS) ----------------
    route('GET', '/api/control/overview', ({ p }) => {
      need(p, 'control:view');
      const stations = [...store.stations.values()];
      const chargers = stations.flatMap((s) => s.chargers);
      const connectors = stations.flatMap((s) => s.connectors);
      const sessions = [...store.sessions.values()];
      const count = (f: (c: Connector) => boolean) => connectors.filter(f).length;
      return {
        stations: { total: stations.length, approved: stations.filter((s) => s.listingStatus === 'approved').length, pending: stations.filter((s) => s.listingStatus === 'pending').length },
        chargers: { total: chargers.length, online: chargers.filter((c) => csms.connections.has(c.ocppIdentity)).length, simulated: chargers.filter((c) => c.isSimulated).length },
        connectors: {
          available: count((c) => c.status === 'Available'),
          charging: count((c) => ['Charging', 'Preparing', 'SuspendedEV', 'SuspendedEVSE', 'Finishing'].includes(c.status)),
          faulted: count((c) => c.status === 'Faulted'),
          offline: count((c) => ['Offline', 'Unavailable', 'Unknown'].includes(c.status)),
        },
        sessions: {
          active: sessions.filter((s) => ['starting', 'charging', 'stopping'].includes(s.state)).length,
          completed: sessions.filter((s) => s.state === 'completed').length,
          energyKwh: Math.round(sessions.reduce((a, s) => a + s.energyWh, 0) / 10) / 100,
        },
        alerts: store.alerts.filter((a) => !a.acknowledged).length,
        unregistered: [...store.unregistered.entries()].map(([identity, u]) => ({ identity, ...u, connected: csms.connections.has(identity) })),
      };
    }),

    route('GET', '/api/control/chargers', ({ p }) => {
      need(p, 'control:view');
      return [...store.stations.values()].flatMap((s) =>
        s.chargers.map((c) => ({
          ...c,
          connected: csms.connections.has(c.ocppIdentity),
          live: csms.connectionInfo(c.ocppIdentity),
          station: { id: s.id, name: s.name, city: s.city, listingStatus: s.listingStatus },
          connectors: s.connectors.filter((k) => k.chargerId === c.id),
        })),
      );
    }),

    route('GET', '/api/control/chargers/:identity', ({ p, params }) => {
      need(p, 'control:view');
      const f = store.findCharger(params.identity);
      if (!f) throw new HttpError(404, 'Charger not found');
      return {
        charger: { ...f.charger, connected: csms.connections.has(f.charger.ocppIdentity) },
        live: csms.connectionInfo(f.charger.ocppIdentity),
        station: { id: f.station.id, name: f.station.name, city: f.station.city, listingStatus: f.station.listingStatus },
        connectors: f.station.connectors.filter((k) => k.chargerId === f.charger.id),
        sessions: [...store.sessions.values()].filter((s) => s.chargerIdentity === f.charger.ocppIdentity).slice(-20).reverse(),
        log: (store.ocppLog.get(f.charger.ocppIdentity) ?? []).slice(-100),
        commands: [...store.commands.values()].filter((c) => c.chargerIdentity === f.charger.ocppIdentity).slice(-20).reverse(),
      };
    }),

    route('POST', '/api/control/chargers/:identity/commands', ({ p, params, body }) => {
      need(p, 'control:view');
      return csms.command(p, params.identity, str(body.command, 'command', 30), (body.params as Record<string, unknown>) ?? {});
    }),

    route('GET', '/api/control/commands/:id', ({ p, params }) => {
      need(p, 'control:view');
      const c = store.commands.get(params.id);
      if (!c) throw new HttpError(404, 'Command not found');
      return c;
    }),

    route('GET', '/api/control/sessions', ({ p }) => {
      need(p, 'control:view');
      return [...store.sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
    }),

    route('GET', '/api/control/payments', ({ p }) => {
      need(p, 'admin:audit');
      return [...store.payments.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
    }),

    route('GET', '/api/control/alerts', ({ p }) => {
      need(p, 'control:view');
      return store.alerts.slice(0, 200);
    }),
    route('POST', '/api/control/alerts/:id/ack', ({ p, params }) => {
      need(p, 'control:view');
      const a = store.alerts.find((x) => x.id === params.id);
      if (!a) throw new HttpError(404, 'Alert not found');
      a.acknowledged = true;
      store.addAudit(p.userId, p.role, 'alert.ack', a.id);
      return a;
    }),

    route('GET', '/api/control/audit', ({ p }) => {
      need(p, 'admin:audit');
      return store.audit.slice(0, 300);
    }),
  ];

  // ---------------- SSE ----------------
  function visible(p: Principal, e: BusEvent): boolean {
    switch (e.type) {
      case 'station':
        return canSeeStation(p, e.station);
      case 'connector':
      case 'charger': {
        const s = store.stations.get(e.stationId);
        return !!s && canSeeStation(p, s);
      }
      case 'session':
        return e.session.userId === p.userId || isControl(p);
      case 'payment':
        return e.payment.userId === p.userId || can(p.role, 'admin:audit');
      case 'command':
      case 'alert':
      case 'log':
        return isControl(p);
      case 'vehicles':
        return e.userId === p.userId;
    }
  }

  function sse(req: IncomingMessage, res: ServerResponse, p: Principal) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ role: p.role })}\n\n`);
    const off = store.on((e) => {
      if (!visible(p, e)) return;
      if (e.type === 'log' && !new URL(req.url ?? '/', 'http://x').searchParams.get('log')) return;
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      off();
      clearInterval(ping);
    });
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    if (!allowList) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin && allowList.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-demo-role');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const p = authenticate(req, url);

    if (url.pathname === '/api/events' && req.method === 'GET') return sse(req, res, p);

    const r = routes.find((x) => x.method === req.method && x.pattern.test(url.pathname));
    if (!r) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    const m = url.pathname.match(r.pattern)!;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    try {
      const body = await readBody(req);
      const out = await r.handler({ req, res, url, params, p, body });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out ?? {}));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('[api]', e);
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: status === 500 ? 'Internal error' : (e as Error).message }));
    }
  };
}
