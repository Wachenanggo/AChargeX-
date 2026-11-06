/**
 * AChargeX charge-point SIMULATOR.
 * Connects to the CSMS over a real WebSocket (same path a physical charger uses),
 * speaking OCPP 1.6J or 2.0.1. It can never control physical hardware: it only
 * generates synthetic meter data. Identities must start with SIM- and the CSMS
 * only accepts them when the simulator secret header is present.
 */
import WebSocket from 'ws';
import { RpcEndpoint, type ConnectorStatus, type OcppVersion } from '@achargex/shared';

export interface SimConnector {
  id: number;
  maxKw: number;
  status: ConnectorStatus;
  /** Busy with a pretend "other driver" (initial demo state) */
  occupiedByOther?: boolean;
}

interface ActiveTx {
  connectorId: number;
  transactionId: string;
  idTag: string;
  energyWh: number;
  timer: ReturnType<typeof setInterval>;
  seqNo: number;
}

export interface SimOptions {
  url: string;
  identity: string;
  version: OcppVersion;
  connectors: SimConnector[];
  secret: string;
  /** Time-acceleration factor for energy delivery (demo only). */
  speed: number;
  meterIntervalMs?: number;
  vendor?: string;
  model?: string;
}

export class SimulatedChargePoint {
  private ws?: WebSocket;
  private rpc?: RpcEndpoint;
  private heartbeat?: ReturnType<typeof setInterval>;
  private tx = new Map<number, ActiveTx>();
  private registerWh = 1_000_000 + Math.floor(Math.random() * 500_000);
  private config: Record<string, { value: string; readonly: boolean }> = {
    HeartbeatInterval: { value: '60', readonly: false },
    MeterValueSampleInterval: { value: '2', readonly: false },
    AuthorizeRemoteTxRequests: { value: 'false', readonly: false },
    ChargePointModel: { value: 'SimDC', readonly: true },
    NumberOfConnectors: { value: '1', readonly: true },
  };
  private stopped = false;
  private local2Tx = 0;

  constructor(private o: SimOptions) {
    this.config.NumberOfConnectors.value = String(o.connectors.length);
    if (o.model) this.config.ChargePointModel.value = o.model;
  }

  get is201() {
    return this.o.version === '2.0.1';
  }

  start() {
    this.stopped = false;
    const sub = this.is201 ? 'ocpp2.0.1' : 'ocpp1.6';
    const ws = new WebSocket(`${this.o.url}/${encodeURIComponent(this.o.identity)}`, [sub], {
      headers: { 'x-achargex-simulator': this.o.secret },
    });
    this.ws = ws;
    const rpc = new RpcEndpoint({ send: (t) => ws.readyState === WebSocket.OPEN && ws.send(t), defaultTimeoutMs: 15_000 });
    this.rpc = rpc;
    this.registerHandlers(rpc);
    ws.on('message', (d) => void rpc.receive(d.toString()));
    ws.on('open', () => void this.boot());
    ws.on('close', () => {
      rpc.close();
      clearInterval(this.heartbeat);
      for (const t of this.tx.values()) clearInterval(t.timer);
      this.tx.clear();
      if (!this.stopped) setTimeout(() => this.start(), 3000);
    });
    ws.on('error', () => {
      /* reconnect handled by close */
    });
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  private async boot() {
    const rpc = this.rpc!;
    const res = this.is201
      ? await rpc.call('BootNotification', { reason: 'PowerUp', chargingStation: { vendorName: this.o.vendor ?? 'AChargeX Simulator', model: this.o.model ?? 'SimDC', firmwareVersion: 'sim-1.0' } })
      : await rpc.call('BootNotification', { chargePointVendor: this.o.vendor ?? 'AChargeX Simulator', chargePointModel: this.o.model ?? 'SimDC', firmwareVersion: 'sim-1.0' });
    const interval = Number(res.interval ?? 60) * 1000;
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => void this.rpc?.call('Heartbeat', {}).catch(() => {}), Math.max(interval, 10_000));
    for (const c of this.o.connectors) {
      // After a reset, connectors return to their idle state.
      await this.sendStatus(c.id, c.status);
    }
  }

  private async sendStatus(connectorId: number, status: ConnectorStatus) {
    const c = this.o.connectors.find((x) => x.id === connectorId);
    if (c) c.status = status;
    if (this.is201) {
      const map: Partial<Record<ConnectorStatus, string>> = {
        Available: 'Available', Preparing: 'Occupied', Charging: 'Occupied', SuspendedEV: 'Occupied', SuspendedEVSE: 'Occupied', Finishing: 'Occupied', Reserved: 'Reserved', Unavailable: 'Unavailable', Faulted: 'Faulted',
      };
      await this.rpc?.call('StatusNotification', { timestamp: new Date().toISOString(), connectorStatus: map[status] ?? 'Unavailable', evseId: connectorId, connectorId: 1 }).catch(() => {});
    } else {
      await this.rpc?.call('StatusNotification', { connectorId, status, errorCode: status === 'Faulted' ? 'GroundFailure' : 'NoError', timestamp: new Date().toISOString() }).catch(() => {});
    }
  }

  private registerHandlers(rpc: RpcEndpoint) {
    const canStart = (connectorId: number) => {
      const c = this.o.connectors.find((x) => x.id === connectorId);
      return c && c.status === 'Available' && !this.tx.has(connectorId);
    };

    // ---- 1.6 ----
    rpc.handle('RemoteStartTransaction', (p) => {
      const connectorId = Number(p.connectorId ?? 1);
      if (!canStart(connectorId)) return { status: 'Rejected' };
      setTimeout(() => void this.beginTx(connectorId, String(p.idTag)), 1200);
      return { status: 'Accepted' };
    });
    rpc.handle('RemoteStopTransaction', (p) => {
      const t = [...this.tx.values()].find((x) => x.transactionId === String(p.transactionId));
      if (!t) return { status: 'Rejected' };
      setTimeout(() => void this.endTx(t, 'Remote'), 800);
      return { status: 'Accepted' };
    });
    rpc.handle('UnlockConnector', (p) => {
      const id = Number(p.evseId ?? p.connectorId ?? 1);
      if (!this.o.connectors.find((c) => c.id === id)) return { status: this.is201 ? 'UnknownConnector' : 'NotSupported' };
      return { status: 'Unlocked' };
    });
    rpc.handle('GetConfiguration', (p) => {
      const keys = (p.key as string[] | undefined) ?? Object.keys(this.config);
      const known = keys.filter((k) => this.config[k]);
      return {
        configurationKey: known.map((k) => ({ key: k, value: this.config[k].value, readonly: this.config[k].readonly })),
        unknownKey: keys.filter((k) => !this.config[k]),
      };
    });
    rpc.handle('ChangeConfiguration', (p) => {
      const k = String(p.key);
      if (!this.config[k]) return { status: 'NotSupported' };
      if (this.config[k].readonly) return { status: 'Rejected' };
      this.config[k].value = String(p.value);
      return { status: 'Accepted' };
    });

    // ---- 2.0.1 ----
    rpc.handle('RequestStartTransaction', (p) => {
      const evseId = Number(p.evseId ?? 1);
      if (!canStart(evseId)) return { status: 'Rejected' };
      const idTag = (p.idToken as { idToken: string }).idToken;
      setTimeout(() => void this.beginTx(evseId, idTag, Number(p.remoteStartId)), 1200);
      return { status: 'Accepted' };
    });
    rpc.handle('RequestStopTransaction', (p) => {
      const t = [...this.tx.values()].find((x) => x.transactionId === String(p.transactionId));
      if (!t) return { status: 'Rejected' };
      setTimeout(() => void this.endTx(t, 'Remote'), 800);
      return { status: 'Accepted' };
    });
    rpc.handle('GetVariables', (p) => {
      const data = (p.getVariableData as { component: unknown; variable: { name: string } }[]) ?? [];
      return {
        getVariableResult: data.map((d) => {
          const c = this.config[d.variable.name];
          return c
            ? { attributeStatus: 'Accepted', attributeValue: c.value, component: d.component, variable: d.variable }
            : { attributeStatus: 'UnknownVariable', component: d.component, variable: d.variable };
        }),
      };
    });
    rpc.handle('SetVariables', (p) => {
      const data = (p.setVariableData as { component: unknown; variable: { name: string }; attributeValue: string }[]) ?? [];
      return {
        setVariableResult: data.map((d) => {
          const c = this.config[d.variable.name];
          let attributeStatus = 'UnknownVariable';
          if (c && c.readonly) attributeStatus = 'Rejected';
          else if (c) {
            c.value = d.attributeValue;
            attributeStatus = 'Accepted';
          }
          return { attributeStatus, component: d.component, variable: d.variable };
        }),
      };
    });

    // ---- both ----
    rpc.handle('Reset', () => {
      setTimeout(() => {
        // Simulated reboot: close and reconnect (connectors keep idle state).
        for (const t of this.tx.values()) clearInterval(t.timer);
        this.tx.clear();
        for (const c of this.o.connectors) if (!c.occupiedByOther && c.status !== 'Faulted' && c.status !== 'Unavailable') c.status = 'Available';
        this.ws?.close();
      }, 1000);
      return { status: 'Accepted' };
    });
    rpc.handle('TriggerMessage', () => ({ status: 'Rejected' }));
    rpc.handle('ClearCache', () => ({ status: 'Accepted' }));
  }

  private async beginTx(connectorId: number, idTag: string, remoteStartId?: number) {
    const rpc = this.rpc;
    if (!rpc) return;
    await this.sendStatus(connectorId, 'Preparing');
    const meterStart = this.registerWh;
    let transactionId: string;
    if (this.is201) {
      transactionId = `${this.o.identity}-${Date.now().toString(36)}-${++this.local2Tx}`;
      const r = await rpc.call('TransactionEvent', {
        eventType: 'Started',
        timestamp: new Date().toISOString(),
        triggerReason: 'RemoteStart',
        seqNo: 0,
        transactionInfo: { transactionId, chargingState: 'Charging', remoteStartId },
        idToken: { idToken: idTag, type: 'Central' },
        evse: { id: connectorId, connectorId: 1 },
        meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: meterStart, measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } }] }],
      });
      if ((r.idTokenInfo as { status?: string } | undefined)?.status !== 'Accepted') {
        await this.sendStatus(connectorId, 'Available');
        return;
      }
    } else {
      const r = await rpc.call('StartTransaction', { connectorId, idTag, meterStart, timestamp: new Date().toISOString() });
      if ((r.idTagInfo as { status?: string }).status !== 'Accepted') {
        await this.sendStatus(connectorId, 'Available');
        return;
      }
      transactionId = String(r.transactionId);
    }
    await this.sendStatus(connectorId, 'Charging');

    const c = this.o.connectors.find((x) => x.id === connectorId)!;
    const interval = this.o.meterIntervalMs ?? 2000;
    const t: ActiveTx = { connectorId, transactionId, idTag, energyWh: 0, seqNo: 1, timer: setInterval(() => void tick(), interval) };
    this.tx.set(connectorId, t);
    let elapsed = 0;
    const tick = async () => {
      elapsed += interval;
      // Ramp to ~85-95% of max power with mild noise.
      const ramp = Math.min(1, elapsed / 8000);
      const powerW = Math.round(c.maxKw * 1000 * (0.85 + Math.random() * 0.1) * ramp);
      const addWh = (powerW * (interval / 1000) * this.o.speed) / 3600;
      t.energyWh += addWh;
      this.registerWh += addWh;
      const energy = Math.round(this.registerWh);
      if (this.is201) {
        await rpc.call('TransactionEvent', {
          eventType: 'Updated',
          timestamp: new Date().toISOString(),
          triggerReason: 'MeterValuePeriodic',
          seqNo: t.seqNo++,
          transactionInfo: { transactionId, chargingState: 'Charging' },
          evse: { id: connectorId, connectorId: 1 },
          meterValue: [
            {
              timestamp: new Date().toISOString(),
              sampledValue: [
                { value: energy, measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
                { value: powerW, measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'W' } },
              ],
            },
          ],
        }).catch(() => {});
      } else {
        await rpc.call('MeterValues', {
          connectorId,
          transactionId: Number(transactionId),
          meterValue: [
            {
              timestamp: new Date().toISOString(),
              sampledValue: [
                { value: String(energy), measurand: 'Energy.Active.Import.Register', unit: 'Wh', context: 'Sample.Periodic' },
                { value: String(powerW), measurand: 'Power.Active.Import', unit: 'W', context: 'Sample.Periodic' },
              ],
            },
          ],
        }).catch(() => {});
      }
    };
  }

  private async endTx(t: ActiveTx, reason: string) {
    clearInterval(t.timer);
    this.tx.delete(t.connectorId);
    const rpc = this.rpc;
    if (!rpc) return;
    await this.sendStatus(t.connectorId, 'Finishing');
    const meterStop = Math.round(this.registerWh);
    if (this.is201) {
      await rpc.call('TransactionEvent', {
        eventType: 'Ended',
        timestamp: new Date().toISOString(),
        triggerReason: 'RemoteStop',
        seqNo: t.seqNo++,
        transactionInfo: { transactionId: t.transactionId, chargingState: 'Idle', stoppedReason: reason },
        evse: { id: t.connectorId, connectorId: 1 },
        meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: meterStop, measurand: 'Energy.Active.Import.Register', context: 'Transaction.End', unitOfMeasure: { unit: 'Wh' } }] }],
      }).catch(() => {});
    } else {
      await rpc.call('StopTransaction', { transactionId: Number(t.transactionId), meterStop, timestamp: new Date().toISOString(), reason, idTag: t.idTag }).catch(() => {});
    }
    setTimeout(() => void this.sendStatus(t.connectorId, 'Available'), 1500);
  }
}
