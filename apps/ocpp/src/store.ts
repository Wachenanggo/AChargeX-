/**
 * In-memory store + change bus. The authoritative runtime state of the CSMS.
 * When Supabase is configured, `supabase-mirror.ts` hydrates this store on boot
 * and persists changes; otherwise everything is DEMO and resets on restart.
 */
import {
  buildDemoNetwork,
  demoVehicles,
  newQrToken,
  type StationWithDetail,
  type Station,
  type Charger,
  type Connector,
  type ChargingSession,
  type PaymentTransaction,
  type QrCode,
  type AuditLog,
  type Alert,
  type OcppLogEntry,
  type CommandResult,
  type Vehicle,
  type Role,
} from '@achargex/shared';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export type BusEvent =
  | { type: 'station'; station: StationWithDetail }
  | { type: 'connector'; stationId: string; connector: Connector }
  | { type: 'charger'; stationId: string; charger: Charger }
  | { type: 'session'; session: ChargingSession }
  | { type: 'payment'; payment: PaymentTransaction }
  | { type: 'command'; command: CommandResult }
  | { type: 'alert'; alert: Alert }
  | { type: 'log'; entry: OcppLogEntry }
  | { type: 'vehicles'; userId: string; vehicles: Vehicle[] };

type Listener = (e: BusEvent) => void;

const LOG_LIMIT = 300;

export class Store {
  stations = new Map<string, StationWithDetail>();
  sessions = new Map<string, ChargingSession>();
  payments = new Map<string, PaymentTransaction>();
  vehicles = new Map<string, Vehicle[]>();
  qrCodes = new Map<string, QrCode>();
  audit: AuditLog[] = [];
  alerts: Alert[] = [];
  commands = new Map<string, CommandResult>();
  ocppLog = new Map<string, OcppLogEntry[]>();
  /** charger identity → scrypt hash of its Basic-auth password */
  chargerSecrets = new Map<string, string>();
  /** identities that connected without being registered */
  unregistered = new Map<string, { firstSeen: string; lastSeen: string; version?: string; vendor?: string; model?: string }>();
  private listeners = new Set<Listener>();

  on(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(e: BusEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch (err) {
        console.error('[bus] listener error', err);
      }
    }
  }

  seedDemo() {
    for (const s of buildDemoNetwork()) this.stations.set(s.id, s);
    // One QR per demo connector, plus one revoked example for testing.
    for (const s of this.stations.values()) {
      for (const c of s.connectors) {
        const token = `demo_${c.label.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}_qr0001`;
        this.qrCodes.set(token, { token, stationId: s.id, connectorId: c.id, createdAt: s.updatedAt });
      }
    }
    this.qrCodes.set('demo_revoked_example_qr01', {
      token: 'demo_revoked_example_qr01',
      stationId: 'stn-matina',
      createdAt: '2026-01-01T00:00:00Z',
      revokedAt: '2026-01-02T00:00:00Z',
    });
  }

  // ---- lookups ----
  findCharger(identity: string): { station: StationWithDetail; charger: Charger } | undefined {
    for (const station of this.stations.values()) {
      const charger = station.chargers.find((c) => c.ocppIdentity === identity);
      if (charger) return { station, charger };
    }
    return undefined;
  }

  findConnector(connectorId: string): { station: StationWithDetail; charger: Charger; connector: Connector } | undefined {
    for (const station of this.stations.values()) {
      const connector = station.connectors.find((c) => c.id === connectorId);
      if (connector) {
        const charger = station.chargers.find((c) => c.id === connector.chargerId)!;
        return { station, charger, connector };
      }
    }
    return undefined;
  }

  connectorByOcpp(identity: string, ocppConnectorId: number) {
    const f = this.findCharger(identity);
    if (!f) return undefined;
    const connector = f.station.connectors.find((c) => c.chargerId === f.charger.id && c.ocppConnectorId === ocppConnectorId);
    return connector ? { ...f, connector } : undefined;
  }

  // ---- mutations (all emit) ----
  updateConnector(stationId: string, connector: Connector) {
    this.emit({ type: 'connector', stationId, connector });
  }
  updateCharger(stationId: string, charger: Charger) {
    this.emit({ type: 'charger', stationId, charger });
  }
  putStation(station: StationWithDetail) {
    station.updatedAt = new Date().toISOString();
    this.stations.set(station.id, station);
    this.emit({ type: 'station', station });
  }
  putSession(session: ChargingSession) {
    this.sessions.set(session.id, session);
    this.emit({ type: 'session', session });
  }
  putPayment(payment: PaymentTransaction) {
    payment.updatedAt = new Date().toISOString();
    this.payments.set(payment.id, payment);
    this.emit({ type: 'payment', payment });
  }
  putCommand(command: CommandResult) {
    this.commands.set(command.id, command);
    this.emit({ type: 'command', command });
  }

  addAlert(a: Omit<Alert, 'id' | 'at' | 'acknowledged'>) {
    const alert: Alert = { id: randomUUID(), at: new Date().toISOString(), acknowledged: false, ...a };
    this.alerts.unshift(alert);
    if (this.alerts.length > 500) this.alerts.length = 500;
    this.emit({ type: 'alert', alert });
    return alert;
  }

  addAudit(actorId: string, actorRole: Role, action: string, target: string, detail?: string) {
    const entry: AuditLog = { id: randomUUID(), at: new Date().toISOString(), actorId, actorRole, action, target, detail };
    this.audit.unshift(entry);
    if (this.audit.length > 2000) this.audit.length = 2000;
    return entry;
  }

  logFrame(chargerIdentity: string, direction: 'in' | 'out', frame: string) {
    const entry: OcppLogEntry = { id: randomUUID(), at: new Date().toISOString(), chargerIdentity, direction, frame };
    let list = this.ocppLog.get(chargerIdentity);
    if (!list) this.ocppLog.set(chargerIdentity, (list = []));
    list.push(entry);
    if (list.length > LOG_LIMIT) list.splice(0, list.length - LOG_LIMIT);
    this.emit({ type: 'log', entry });
  }

  vehiclesChanged(userId: string) {
    this.emit({ type: 'vehicles', userId, vehicles: this.vehiclesFor(userId) });
  }

  vehiclesFor(userId: string): Vehicle[] {
    let v = this.vehicles.get(userId);
    if (!v) {
      v = userId.startsWith('demo-') ? demoVehicles(userId) : [];
      this.vehicles.set(userId, v);
    }
    return v;
  }

  newQr(stationId: string, connectorId?: string, expiresAt?: string): QrCode {
    const qr: QrCode = { token: newQrToken(), stationId, connectorId, createdAt: new Date().toISOString(), expiresAt };
    this.qrCodes.set(qr.token, qr);
    return qr;
  }

  // ---- charger credentials (OCPP Security Profile 1: Basic auth over TLS) ----
  setChargerPassword(identity: string): string {
    const password = randomBytes(15).toString('base64url');
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32);
    this.chargerSecrets.set(identity, `${salt.toString('hex')}:${hash.toString('hex')}`);
    return password;
  }

  verifyChargerPassword(identity: string, password: string): boolean {
    const stored = this.chargerSecrets.get(identity);
    if (!stored) return false;
    const [saltHex, hashHex] = stored.split(':');
    const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
    return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
  }
}

export function publicStation(s: StationWithDetail): StationWithDetail {
  return s;
}

export function stationSummary(s: Station) {
  return { id: s.id, name: s.name, city: s.city };
}
