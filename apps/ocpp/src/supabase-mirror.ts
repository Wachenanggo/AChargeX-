/**
 * Supabase persistence for the CSMS runtime store.
 * On boot: hydrate stations/chargers/connectors/tariffs/QR codes/credentials/vehicles.
 * At runtime: write-through changes (throttled for high-frequency meter updates).
 * Uses the SERVICE ROLE key — this module must only ever run on the server.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  StationWithDetail,
  Charger,
  Connector,
  Tariff,
  ChargingSession,
  PaymentTransaction,
  QrCode,
  Vehicle,
  Alert,
  AuditLog,
} from '@achargex/shared';
import type { Store } from './store';

const stationRow = (s: StationWithDetail) => ({
  id: s.id,
  owner_id: s.ownerId.includes('-') && s.ownerId.length === 36 ? s.ownerId : null,
  name: s.name,
  address: s.address,
  city: s.city,
  lat: s.lat,
  lng: s.lng,
  listing_status: s.listingStatus,
  opening_hours: s.openingHours,
  is_24h: s.is24h,
  access: s.access,
  amenities: s.amenities,
  deal: s.deal ?? null,
  is_demo: s.isDemo,
  source: s.source,
  photo_url: s.photoUrl ?? null,
  updated_at: s.updatedAt,
});

const chargerRow = (c: Charger) => ({
  id: c.id,
  station_id: c.stationId,
  ocpp_identity: c.ocppIdentity,
  vendor: c.vendor ?? null,
  model: c.model ?? null,
  firmware: c.firmware ?? null,
  ocpp_version: c.ocppVersion ?? null,
  is_simulated: c.isSimulated,
  commissioned: c.commissioned,
  connected: c.connected,
  last_heartbeat_at: c.lastHeartbeatAt ?? null,
});

const connectorRow = (c: Connector, stationId: string) => ({
  id: c.id,
  charger_id: c.chargerId,
  station_id: stationId,
  ocpp_connector_id: c.ocppConnectorId,
  label: c.label,
  type: c.type,
  current_type: c.current,
  power_kw: c.powerKw,
  status: c.status,
  status_updated_at: c.statusUpdatedAt,
  tariff_id: c.tariffId,
});

const tariffRow = (t: Tariff, stationId: string) => ({
  id: t.id,
  station_id: stationId,
  price_per_kwh: t.pricePerKwh,
  idle_fee_per_min: t.idleFeePerMin ?? null,
  idle_grace_min: t.idleGraceMin ?? null,
  label: t.label ?? null,
});

const sessionRow = (s: ChargingSession) => ({
  id: s.id,
  user_id: s.userId,
  station_id: s.stationId,
  connector_id: s.connectorId,
  charger_identity: s.chargerIdentity,
  state: s.state,
  limit_php: s.limitPhp,
  price_per_kwh: s.pricePerKwh,
  payment_transaction_id: s.paymentTransactionId ?? null,
  ocpp_transaction_id: s.ocppTransactionId ?? null,
  id_tag: (s as ChargingSession & { idTag?: string }).idTag ?? null,
  meter_start_wh: s.meterStartWh ?? null,
  meter_stop_wh: s.meterStopWh ?? null,
  energy_wh: s.energyWh,
  power_w: s.powerW,
  cost_php: s.costPhp,
  started_at: s.startedAt ?? null,
  stopped_at: s.stoppedAt ?? null,
  stop_reason: s.stopReason ?? null,
  is_simulated: s.isSimulated,
  error: s.error ?? null,
  created_at: s.createdAt,
});

const paymentRow = (p: PaymentTransaction) => ({
  id: p.id,
  user_id: p.userId,
  session_id: p.sessionId ?? null,
  provider: p.provider,
  state: p.state,
  hold_amount: p.holdAmount,
  captured_amount: p.capturedAmount ?? null,
  idempotency_key: p.idempotencyKey,
  is_demo: p.isDemo,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

const vehicleRow = (v: Vehicle) => ({
  id: v.id,
  user_id: v.userId,
  make: v.make,
  model: v.model,
  nickname: v.nickname ?? null,
  battery_kwh: v.batteryKwh ?? null,
  connectors: v.connectors,
  body_type: v.bodyType,
  plate: v.plate ?? null,
  is_selected: v.isSelected,
});

const alertRow = (a: Alert) => ({
  id: a.id,
  at: a.at,
  severity: a.severity,
  charger_identity: a.chargerIdentity ?? null,
  station_id: a.stationId ?? null,
  message: a.message,
  acknowledged: a.acknowledged,
});

const auditRow = (a: AuditLog) => ({
  id: a.id,
  at: a.at,
  actor_id: a.actorId,
  actor_role: a.actorRole,
  action: a.action,
  target: a.target,
  detail: a.detail ?? null,
});

const qrRow = (q: QrCode) => ({
  token: q.token,
  station_id: q.stationId,
  connector_id: q.connectorId ?? null,
  created_at: q.createdAt,
  revoked_at: q.revokedAt ?? null,
  expires_at: q.expiresAt ?? null,
});

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function hydrate(db: SupabaseClient, store: Store) {
  const [st, ch, co, ta, qr, cr] = await Promise.all([
    db.from('stations').select('*'),
    db.from('chargers').select('*'),
    db.from('connectors').select('*'),
    db.from('tariffs').select('*'),
    db.from('qr_codes').select('*'),
    db.from('charger_credentials').select('*'),
  ]);
  for (const r of [st, ch, co, ta, qr, cr]) if (r.error) throw new Error(r.error.message);
  for (const s of st.data ?? []) {
    store.stations.set(s.id, {
      id: s.id,
      ownerId: s.owner_id ?? 'unowned',
      name: s.name,
      address: s.address,
      city: s.city,
      lat: s.lat,
      lng: s.lng,
      listingStatus: s.listing_status,
      openingHours: s.opening_hours,
      is24h: s.is_24h,
      access: s.access,
      amenities: s.amenities ?? [],
      deal: s.deal ?? undefined,
      isDemo: s.is_demo,
      source: s.source,
      photoUrl: s.photo_url ?? undefined,
      updatedAt: s.updated_at,
      chargers: [],
      connectors: [],
      tariffs: [],
    });
  }
  for (const c of ch.data ?? []) {
    store.stations.get(c.station_id)?.chargers.push({
      id: c.id,
      stationId: c.station_id,
      ocppIdentity: c.ocpp_identity,
      vendor: c.vendor ?? undefined,
      model: c.model ?? undefined,
      firmware: c.firmware ?? undefined,
      ocppVersion: c.ocpp_version ?? undefined,
      isSimulated: c.is_simulated,
      commissioned: c.commissioned,
      connected: false,
      lastHeartbeatAt: c.last_heartbeat_at ?? undefined,
    });
  }
  for (const k of co.data ?? []) {
    store.stations.get(k.station_id)?.connectors.push({
      id: k.id,
      chargerId: k.charger_id,
      ocppConnectorId: k.ocpp_connector_id,
      label: k.label,
      type: k.type,
      current: k.current_type,
      powerKw: k.power_kw,
      status: 'Offline',
      statusUpdatedAt: k.status_updated_at,
      tariffId: k.tariff_id,
    });
  }
  for (const t of ta.data ?? []) {
    store.stations.get(t.station_id)?.tariffs.push({
      id: t.id,
      pricePerKwh: Number(t.price_per_kwh),
      idleFeePerMin: t.idle_fee_per_min ?? undefined,
      idleGraceMin: t.idle_grace_min ?? undefined,
      label: t.label ?? undefined,
    });
  }
  for (const q of qr.data ?? []) {
    store.qrCodes.set(q.token, {
      token: q.token,
      stationId: q.station_id,
      connectorId: q.connector_id ?? undefined,
      createdAt: q.created_at,
      revokedAt: q.revoked_at ?? undefined,
      expiresAt: q.expires_at ?? undefined,
    });
  }
  for (const c of cr.data ?? []) store.chargerSecrets.set(c.ocpp_identity, c.password_hash);
  console.log(`[supabase] hydrated ${store.stations.size} stations`);
}

export async function startSupabaseMirror(store: Store, cfg: { url: string; serviceKey: string }) {
  const db = createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false } });
  await hydrate(db, store);

  const warn = (what: string) => (r: { error: { message: string } | null }) => {
    if (r.error) console.warn(`[supabase] ${what}: ${r.error.message}`);
  };

  // Throttle high-frequency upserts per key.
  const last = new Map<string, number>();
  const throttled = (key: string, ms: number, force: boolean, fn: () => PromiseLike<unknown>) => {
    const now = Date.now();
    if (!force && now - (last.get(key) ?? 0) < ms) return;
    last.set(key, now);
    void fn();
  };

  // Credentials, QR and audit are not bus events — wrap the store methods.
  const setPw = store.setChargerPassword.bind(store);
  store.setChargerPassword = (identity: string) => {
    const pw = setPw(identity);
    void db.from('charger_credentials').upsert({ ocpp_identity: identity, password_hash: store.chargerSecrets.get(identity) }).then(warn('credentials'));
    return pw;
  };
  const newQr = store.newQr.bind(store);
  store.newQr = (...args: Parameters<Store['newQr']>) => {
    const q = newQr(...args);
    void db.from('qr_codes').upsert(qrRow(q)).then(warn('qr'));
    return q;
  };
  const addAudit = store.addAudit.bind(store);
  store.addAudit = (...args: Parameters<Store['addAudit']>) => {
    const a = addAudit(...args);
    void db.from('audit_logs').insert(auditRow(a)).then(warn('audit'));
    // QR revocations are recorded via audit; persist the revoked flag too.
    if (a.action === 'qr.revoke') {
      const q = store.qrCodes.get(a.target);
      if (q) void db.from('qr_codes').upsert(qrRow(q)).then(warn('qr'));
    }
    return a;
  };

  const lastConnected = new Map<string, boolean>();

  store.on((e) => {
    switch (e.type) {
      case 'station': {
        const s = e.station;
        void (async () => {
          warn('station')(await db.from('stations').upsert(stationRow(s)));
          warn('tariffs')(await db.from('tariffs').upsert(s.tariffs.map((t) => tariffRow(t, s.id))));
          warn('chargers')(await db.from('chargers').upsert(s.chargers.map(chargerRow)));
          warn('connectors')(await db.from('connectors').upsert(s.connectors.map((c) => connectorRow(c, s.id))));
        })();
        break;
      }
      case 'charger': {
        const changed = lastConnected.get(e.charger.id) !== e.charger.connected;
        lastConnected.set(e.charger.id, e.charger.connected);
        throttled(`chg:${e.charger.id}`, 60_000, changed, () => db.from('chargers').upsert(chargerRow(e.charger)).then(warn('charger')));
        break;
      }
      case 'connector':
        void db.from('connectors').upsert(connectorRow(e.connector, e.stationId)).then(warn('connector'));
        break;
      case 'session': {
        if (!isUuid(e.session.userId)) break; // demo users are not persisted
        const force = e.session.state !== 'charging';
        const s = e.session;
        throttled(`ses:${s.id}`, 5000, force, async () => {
          warn('session')(await db.from('charging_sessions').upsert(sessionRow(s)));
          // Sampled meter history (charger-reported, cumulative register).
          if (s.meterStartWh !== undefined && (s.state === 'charging' || s.state === 'completed')) {
            warn('meter')(await db.from('meter_values').insert({ session_id: s.id, at: new Date().toISOString(), energy_wh: Math.round(s.meterStartWh + s.energyWh), power_w: s.powerW }));
          }
        });
        break;
      }
      case 'payment':
        if (!isUuid(e.payment.userId)) break;
        void db.from('payment_transactions').upsert(paymentRow(e.payment)).then(warn('payment'));
        break;
      case 'alert':
        void db.from('alerts').upsert(alertRow(e.alert)).then(warn('alert'));
        break;
      case 'vehicles': {
        if (!isUuid(e.userId)) break;
        void (async () => {
          const ids = e.vehicles.map((v) => v.id);
          const del = db.from('vehicles').delete().eq('user_id', e.userId);
          warn('vehicles')(await (ids.length ? del.not('id', 'in', `(${ids.join(',')})`) : del));
          if (e.vehicles.length) warn('vehicles')(await db.from('vehicles').upsert(e.vehicles.map(vehicleRow)));
        })();
        break;
      }
      default:
        break;
    }
  });

  // Lazily load a real user's vehicles the first time they're requested.
  const vehiclesFor = store.vehiclesFor.bind(store);
  const loaded = new Set<string>();
  store.vehiclesFor = (userId: string) => {
    const list = vehiclesFor(userId);
    if (isUuid(userId) && !loaded.has(userId)) {
      loaded.add(userId);
      void db
        .from('vehicles')
        .select('*')
        .eq('user_id', userId)
        .then(({ data, error }) => {
          if (error) return console.warn('[supabase] vehicles', error.message);
          for (const r of data ?? []) {
            if (list.find((v) => v.id === r.id)) continue;
            list.push({ id: r.id, userId, make: r.make, model: r.model, nickname: r.nickname ?? undefined, batteryKwh: r.battery_kwh ?? undefined, connectors: r.connectors, bodyType: r.body_type, plate: r.plate ?? undefined, isSelected: r.is_selected });
          }
        });
    }
    return list;
  };
}
