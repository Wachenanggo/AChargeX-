/**
 * CSMS core: charger connections, version adapters, session lifecycle, remote commands.
 * Honesty rules:
 *  - A command is "pending" until the charger's CALLRESULT arrives.
 *  - A session is "charging" only after the charger reports a started transaction.
 *  - Final totals come from charger meter readings, never from the client.
 *  - Simulated sessions only route to simulated connections, and vice versa.
 */
import { randomUUID, randomBytes } from 'node:crypto';
import {
  RpcEndpoint,
  CallTimeoutError,
  OcppError,
  canStartCharging,
  costForEnergy,
  deliveredWh,
  limitReached,
  can,
  FULL_CHARGE_CAP_PHP,
  type ChargingSession,
  type CommandResult,
  type ConnectorStatus,
  type OcppVersion,
  type Role,
} from '@achargex/shared';
import type { Store } from './store';
import type { ChargerSink, ChargerCommands, AuthStatus } from './domain';
import { attachV16 } from './ocpp/v16';
import { attachV201 } from './ocpp/v201';
import { DemoPaymentAdapter, type PaymentAdapter } from './payments';

export interface Principal {
  userId: string;
  role: Role;
  isDemo: boolean;
}

interface Conn {
  identity: string;
  version: OcppVersion;
  rpc: RpcEndpoint;
  cmds: ChargerCommands;
  isSimulated: boolean;
  registered: boolean;
  connectedAt: string;
  close: () => void;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const START_TIMEOUT_MS = 60_000;

export class Csms {
  connections = new Map<string, Conn>();
  payments: Record<string, PaymentAdapter>;
  /** `${identity}:${txId}` → sessionId */
  private txIndex = new Map<string, string>();
  /** remoteStartId → sessionId */
  private remoteStartIndex = new Map<number, string>();
  private nextTxId = 1000 + Math.floor(Math.random() * 1000);
  private nextRemoteStartId = 1;

  constructor(
    private store: Store,
    private opts: { allowDemoPaymentOnReal: boolean; heartbeatIntervalS: number },
  ) {
    this.payments = { demo: new DemoPaymentAdapter(store) };
  }

  // ===================================================================
  // Connections
  // ===================================================================
  attach(identity: string, version: OcppVersion, isSimulated: boolean, send: (t: string) => void, close: () => void) {
    const existing = this.connections.get(identity);
    if (existing) {
      // A charger reconnecting replaces its old socket.
      existing.rpc.close();
      existing.close();
    }
    const rpc = new RpcEndpoint({
      send,
      onFrame: (dir, text) => this.store.logFrame(identity, dir, text),
      defaultTimeoutMs: 30_000,
    });
    const sink = this.sinkFor(identity);
    const cmds = version === '2.0.1' ? attachV201(rpc, sink, this.opts.heartbeatIntervalS) : attachV16(rpc, sink, this.opts.heartbeatIntervalS);
    const registered = !!this.store.findCharger(identity);
    const conn: Conn = { identity, version, rpc, cmds, isSimulated, registered, connectedAt: new Date().toISOString(), close };
    this.connections.set(identity, conn);

    const found = this.store.findCharger(identity);
    if (found) {
      found.charger.connected = true;
      found.charger.ocppVersion = version;
      found.charger.lastHeartbeatAt = conn.connectedAt;
      this.store.updateCharger(found.station.id, found.charger);
    } else {
      const now = new Date().toISOString();
      const u = this.store.unregistered.get(identity);
      this.store.unregistered.set(identity, { firstSeen: u?.firstSeen ?? now, lastSeen: now, version });
      this.store.addAlert({ severity: 'warning', chargerIdentity: identity, message: `Unregistered charger "${identity}" connected (OCPP ${version}). Claim it in AChargeX Network.` });
    }

    return {
      receive: (text: string) => rpc.receive(text),
      closed: () => this.detach(identity, conn),
    };
  }

  private detach(identity: string, conn: Conn) {
    if (this.connections.get(identity) !== conn) return; // already replaced
    conn.rpc.close();
    this.connections.delete(identity);
    const found = this.store.findCharger(identity);
    if (found) {
      found.charger.connected = false;
      this.store.updateCharger(found.station.id, found.charger);
      for (const c of found.station.connectors.filter((c) => c.chargerId === found.charger.id)) {
        c.status = 'Offline';
        c.statusUpdatedAt = new Date().toISOString();
        this.store.updateConnector(found.station.id, c);
      }
      const active = [...this.store.sessions.values()].filter((s) => s.chargerIdentity === identity && ['starting', 'charging', 'stopping'].includes(s.state));
      if (active.length) {
        this.store.addAlert({ severity: 'critical', chargerIdentity: identity, stationId: found.station.id, message: `Charger ${identity} disconnected with ${active.length} active session(s).` });
      }
    }
  }

  /** Mark chargers offline whose heartbeat is stale (3× interval). */
  sweepStale() {
    const cutoff = Date.now() - this.opts.heartbeatIntervalS * 3 * 1000;
    for (const [identity, conn] of this.connections) {
      const f = this.store.findCharger(identity);
      if (f?.charger.lastHeartbeatAt && new Date(f.charger.lastHeartbeatAt).getTime() < cutoff) {
        this.store.addAlert({ severity: 'warning', chargerIdentity: identity, message: `No heartbeat from ${identity}; closing stale connection.` });
        conn.close();
        this.detach(identity, conn);
      }
    }
  }

  // ===================================================================
  // Inbound domain events (from either adapter)
  // ===================================================================
  private sinkFor(identity: string): ChargerSink {
    const touch = () => {
      const f = this.store.findCharger(identity);
      if (f) {
        f.charger.lastHeartbeatAt = new Date().toISOString();
        this.store.updateCharger(f.station.id, f.charger);
      } else {
        const u = this.store.unregistered.get(identity);
        if (u) u.lastSeen = new Date().toISOString();
      }
    };

    return {
      booted: (info) => {
        const f = this.store.findCharger(identity);
        if (f) {
          Object.assign(f.charger, {
            vendor: info.vendor ?? f.charger.vendor,
            model: info.model ?? f.charger.model,
            firmware: info.firmware ?? f.charger.firmware,
            lastHeartbeatAt: new Date().toISOString(),
            connected: true,
          });
          this.store.updateCharger(f.station.id, f.charger);
        } else {
          const u = this.store.unregistered.get(identity);
          if (u) Object.assign(u, { vendor: info.vendor, model: info.model, lastSeen: new Date().toISOString() });
        }
      },
      heartbeat: touch,
      connectorStatus: (ocppConnectorId, status, errorCode) => {
        touch();
        const f = this.store.findCharger(identity);
        if (!f) return;
        const targets =
          ocppConnectorId === 0
            ? status === 'Unavailable' || status === 'Faulted'
              ? f.station.connectors.filter((c) => c.chargerId === f.charger.id)
              : []
            : f.station.connectors.filter((c) => c.chargerId === f.charger.id && c.ocppConnectorId === ocppConnectorId);
        for (const c of targets) {
          c.status = status;
          c.statusUpdatedAt = new Date().toISOString();
          this.store.updateConnector(f.station.id, c);
        }
        if (status === 'Faulted') {
          this.store.addAlert({ severity: 'critical', chargerIdentity: identity, stationId: f.station.id, message: `Connector ${ocppConnectorId} faulted${errorCode && errorCode !== 'NoError' ? ` (${errorCode})` : ''}.` });
        }
      },
      authorize: async (idTag) => this.authorizeTag(identity, idTag),
      transactionStarted: async (t) => {
        touch();
        let session: ChargingSession | undefined;
        if (t.remoteStartId !== undefined) {
          const sid = this.remoteStartIndex.get(t.remoteStartId);
          if (sid) session = this.store.sessions.get(sid);
        }
        if (!session) {
          session = [...this.store.sessions.values()].find(
            (s) => s.chargerIdentity === identity && s.state === 'starting' && sessionIdTag(s) === t.idTag,
          );
        }
        const transactionId = t.transactionId ?? String(this.nextTxId++);
        if (!session) {
          this.store.addAlert({ severity: 'warning', chargerIdentity: identity, message: `Charger started an unrecognised transaction (idTag "${t.idTag}"). Rejected.` });
          return { transactionId, auth: 'Invalid' as AuthStatus };
        }
        session.ocppTransactionId = transactionId;
        session.meterStartWh = t.meterStartWh;
        session.startedAt = t.timestamp;
        session.state = 'charging';
        this.txIndex.set(`${identity}:${transactionId}`, session.id);
        this.store.putSession(session);
        return { transactionId, auth: 'Accepted' as AuthStatus };
      },
      meter: (m) => {
        touch();
        let session: ChargingSession | undefined;
        if (m.transactionId) {
          const sid = this.txIndex.get(`${identity}:${m.transactionId}`);
          if (sid) session = this.store.sessions.get(sid);
        }
        if (!session && m.connectorId !== undefined) {
          const c = this.store.connectorByOcpp(identity, m.connectorId);
          if (c) session = [...this.store.sessions.values()].find((s) => s.connectorId === c.connector.id && s.state === 'charging');
        }
        if (!session || session.meterStartWh === undefined) return;
        if (m.energyWh !== undefined) {
          session.energyWh = deliveredWh(session.meterStartWh, m.energyWh);
          session.costPhp = costForEnergy(session.energyWh, session.pricePerKwh);
        }
        if (m.powerW !== undefined) session.powerW = m.powerW;
        this.store.putSession(session);
        if (session.state === 'charging' && limitReached(session.costPhp, session.limitPhp)) {
          void this.requestStop(session, 'LimitReached');
        }
      },
      transactionEnded: (t) => {
        touch();
        const sid = this.txIndex.get(`${identity}:${t.transactionId}`);
        const session = sid ? this.store.sessions.get(sid) : undefined;
        if (!session) return;
        if (t.meterStopWh !== undefined && session.meterStartWh !== undefined) {
          session.meterStopWh = t.meterStopWh;
          session.energyWh = deliveredWh(session.meterStartWh, t.meterStopWh);
          session.costPhp = costForEnergy(session.energyWh, session.pricePerKwh);
        }
        session.stoppedAt = t.timestamp;
        session.stopReason = session.stopReason ?? t.reason;
        session.powerW = 0;
        void this.finalize(session);
      },
      note: (message) => {
        this.store.addAlert({ severity: 'info', chargerIdentity: identity, message });
      },
    };
  }

  private authorizeTag(identity: string, idTag: string): AuthStatus {
    const s = [...this.store.sessions.values()].find((x) => x.chargerIdentity === identity && sessionIdTag(x) === idTag && ['starting', 'charging'].includes(x.state));
    return s ? 'Accepted' : 'Invalid';
  }

  // ===================================================================
  // Sessions
  // ===================================================================
  async startSession(p: Principal, body: { connectorId: string; limitPhp: number; provider: string; idempotencyKey: string; vehicleId?: string }) {
    if (!can(p.role, 'sessions:start')) throw new HttpError(403, 'Your account cannot start charging sessions. Sign in as a driver.');
    if (!body.idempotencyKey || body.idempotencyKey.length < 8) throw new HttpError(400, 'idempotencyKey is required');

    // Idempotency: return existing session for the same key.
    for (const s of this.store.sessions.values()) {
      const pay = s.paymentTransactionId ? this.store.payments.get(s.paymentTransactionId) : undefined;
      if (s.userId === p.userId && pay?.idempotencyKey === body.idempotencyKey) return s;
    }

    const limit = Number(body.limitPhp);
    if (!Number.isFinite(limit) || limit <= 0 || limit > FULL_CHARGE_CAP_PHP) {
      throw new HttpError(400, `Charging limit must be between ₱1 and ₱${FULL_CHARGE_CAP_PHP}.`);
    }

    const f = this.store.findConnector(body.connectorId);
    if (!f) throw new HttpError(404, 'Connector not found');
    const conn = this.connections.get(f.charger.ocppIdentity);
    const eligibility = canStartCharging(f.station, { ...f.charger, connected: !!conn }, f.connector);
    if (!eligibility.ok) throw new HttpError(409, eligibility.reason);
    if (!conn) throw new HttpError(409, 'Charger is offline.');

    // Simulator isolation.
    if (conn.isSimulated !== f.charger.isSimulated) {
      throw new HttpError(409, 'Charger connection type does not match its registration (simulator/live mismatch). Refusing to start.');
    }

    const busy = [...this.store.sessions.values()].some((s) => s.connectorId === f.connector.id && ['authorizing', 'authorized', 'starting', 'charging', 'stopping'].includes(s.state));
    if (busy) throw new HttpError(409, 'Connector already has an active session.');

    const adapter = this.payments[body.provider];
    if (!adapter) throw new HttpError(400, 'This payment method is not available.');
    if (adapter.isDemo && !f.charger.isSimulated && !this.opts.allowDemoPaymentOnReal) {
      throw new HttpError(409, 'Demo payments cannot be used on a live charger. Configure a real payment provider.');
    }

    const tariff = f.station.tariffs.find((t) => t.id === f.connector.tariffId);
    if (!tariff) throw new HttpError(409, 'Connector has no tariff configured.');

    const session: ChargingSession = {
      id: randomUUID(),
      userId: p.userId,
      stationId: f.station.id,
      connectorId: f.connector.id,
      chargerIdentity: f.charger.ocppIdentity,
      state: 'authorizing',
      limitPhp: limit,
      pricePerKwh: tariff.pricePerKwh,
      energyWh: 0,
      powerW: 0,
      costPhp: 0,
      isSimulated: f.charger.isSimulated,
      createdAt: new Date().toISOString(),
    };
    (session as ChargingSession & { idTag: string }).idTag = 'AX' + randomBytes(5).toString('hex').toUpperCase();
    this.store.putSession(session);

    const tx = await adapter.authorize(p.userId, limit, body.idempotencyKey);
    if (tx.state !== 'authorized') {
      session.state = 'failed';
      session.error = 'Payment authorization failed.';
      this.store.putSession(session);
      return session;
    }
    tx.sessionId = session.id;
    this.store.putPayment(tx);
    session.paymentTransactionId = tx.id;
    session.state = 'starting';
    this.store.putSession(session);

    const remoteStartId = this.nextRemoteStartId++;
    this.remoteStartIndex.set(remoteStartId, session.id);
    try {
      const status = await conn.cmds.startCharging(f.connector.ocppConnectorId, sessionIdTag(session), remoteStartId);
      if (status !== 'Accepted') {
        await this.failSession(session, `Charger rejected the start request (${status}).`);
        return session;
      }
    } catch (e) {
      await this.failSession(session, e instanceof CallTimeoutError ? 'Charger did not respond to the start request.' : `Start failed: ${(e as Error).message}`);
      return session;
    }

    // Wait for the charger to actually start the transaction.
    setTimeout(() => {
      const s = this.store.sessions.get(session.id);
      if (s && s.state === 'starting') void this.failSession(s, 'Charger accepted but did not start charging. Check the cable is connected.');
    }, START_TIMEOUT_MS).unref?.();

    this.store.addAudit(p.userId, p.role, 'session.start', session.id, `${f.charger.ocppIdentity}#${f.connector.ocppConnectorId} limit ₱${limit}`);
    return session;
  }

  async stopSession(p: Principal, sessionId: string) {
    const s = this.store.sessions.get(sessionId);
    if (!s) throw new HttpError(404, 'Session not found');
    const isOwner = s.userId === p.userId;
    if (!isOwner && !can(p.role, 'control:remote_commands')) throw new HttpError(403, 'Not your session');
    if (s.state === 'starting') {
      await this.failSession(s, 'Cancelled before charging started.', 'cancelled');
      return s;
    }
    if (s.state !== 'charging') throw new HttpError(409, `Session is ${s.state}`);
    s.stopReason = isOwner ? 'Remote' : 'RemoteByOperator';
    await this.requestStop(s, s.stopReason);
    this.store.addAudit(p.userId, p.role, 'session.stop', s.id);
    return s;
  }

  private async requestStop(s: ChargingSession, reason: string) {
    if (s.state !== 'charging' || !s.ocppTransactionId) return;
    s.state = 'stopping';
    s.stopReason = s.stopReason ?? reason;
    this.store.putSession(s);
    const conn = this.connections.get(s.chargerIdentity);
    if (!conn) {
      s.error = 'Charger offline — stop will be confirmed when it reconnects.';
      this.store.putSession(s);
      return;
    }
    try {
      const r = await conn.cmds.stopCharging(s.ocppTransactionId);
      if (r !== 'Accepted') {
        s.state = 'charging';
        s.error = `Charger rejected the stop request (${r}). Try again or unplug at the charger.`;
        this.store.putSession(s);
      }
    } catch (e) {
      s.state = 'charging';
      s.error = e instanceof CallTimeoutError ? 'Charger did not respond to the stop request.' : (e as Error).message;
      this.store.putSession(s);
    }
  }

  private async failSession(s: ChargingSession, error: string, state: 'failed' | 'cancelled' = 'failed') {
    s.state = state;
    s.error = error;
    this.store.putSession(s);
    const tx = s.paymentTransactionId ? this.store.payments.get(s.paymentTransactionId) : undefined;
    if (tx && tx.state === 'authorized') await this.payments[tx.provider]?.void(tx);
  }

  private async finalize(s: ChargingSession) {
    const tx = s.paymentTransactionId ? this.store.payments.get(s.paymentTransactionId) : undefined;
    if (tx && tx.state === 'authorized') await this.payments[tx.provider]?.capture(tx, s.costPhp);
    s.costPhp = tx?.capturedAmount ?? s.costPhp;
    s.state = 'completed';
    s.error = undefined;
    this.store.putSession(s);
  }

  // ===================================================================
  // Operator commands
  // ===================================================================
  command(p: Principal, identity: string, command: string, params: Record<string, unknown> = {}): CommandResult {
    const need =
      command === 'reset' || command === 'unlock' ? 'control:reset' : command === 'setConfig' ? 'control:configure' : 'control:remote_commands';
    if (!can(p.role, need)) throw new HttpError(403, `Your role cannot run ${command}.`);
    const conn = this.connections.get(identity);
    const result: CommandResult = { id: randomUUID(), chargerIdentity: identity, command, status: conn ? 'pending' : 'offline', issuedAt: new Date().toISOString() };
    this.store.putCommand(result);
    this.store.addAudit(p.userId, p.role, `command.${command}`, identity, JSON.stringify(params));
    if (!conn) return result;

    const run = async (): Promise<unknown> => {
      switch (command) {
        case 'reset':
          return conn.cmds.reset(params.kind === 'hard' ? 'hard' : 'soft');
        case 'unlock':
          return conn.cmds.unlock(Number(params.connectorId ?? 1));
        case 'getConfig':
          return conn.cmds.getConfig(Array.isArray(params.keys) ? (params.keys as string[]) : undefined);
        case 'setConfig':
          if (typeof params.key !== 'string' || typeof params.value !== 'string') throw new OcppError('FormationViolation', 'key and value are required');
          return conn.cmds.setConfig(params.key, params.value);
        case 'stopSession': {
          const s = this.store.sessions.get(String(params.sessionId));
          if (!s) throw new Error('Session not found');
          await this.stopSession(p, s.id);
          return 'Accepted';
        }
        default:
          throw new OcppError('NotSupported', `Unknown command ${command}`);
      }
    };

    run()
      .then((r) => {
        const status = typeof r === 'string' ? r : 'Accepted';
        result.status = status === 'Unlocked' || status === 'RebootRequired' ? 'Accepted' : (status as CommandResult['status']);
        if (!['Accepted', 'Rejected', 'NotSupported'].includes(result.status)) result.status = 'Rejected';
        result.detail = typeof r === 'string' ? { charger: r } : r;
      })
      .catch((e) => {
        result.status = e instanceof CallTimeoutError ? 'timeout' : 'error';
        result.detail = { message: (e as Error).message, code: (e as OcppError).code };
      })
      .finally(() => {
        result.completedAt = new Date().toISOString();
        this.store.putCommand(result);
      });

    return result;
  }

  connectionInfo(identity: string) {
    const c = this.connections.get(identity);
    return c ? { connected: true, version: c.version, since: c.connectedAt, isSimulated: c.isSimulated, registered: c.registered } : { connected: false };
  }
}

export function sessionIdTag(s: ChargingSession): string {
  return (s as ChargingSession & { idTag?: string }).idTag ?? s.id.slice(0, 20);
}

export type { ConnectorStatus };
