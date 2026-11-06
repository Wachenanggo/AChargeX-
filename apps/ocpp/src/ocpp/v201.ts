/** OCPP 2.0.1 adapter: maps 2.0.1 messages ⇄ version-neutral domain contracts. */
import { OcppError, type RpcEndpoint, type ConnectorStatus } from '@achargex/shared';
import type { ChargerSink, ChargerCommands, SimpleStatus } from '../domain';

/** Extract energy/power/SoC from 2.0.1 meterValue arrays. */
export function parseMeterValues201(meterValue: unknown): { energyWh?: number; powerW?: number; socPercent?: number; timestamp?: string } {
  const out: { energyWh?: number; powerW?: number; socPercent?: number; timestamp?: string } = {};
  if (!Array.isArray(meterValue)) return out;
  for (const mv of meterValue as Record<string, unknown>[]) {
    out.timestamp = (mv.timestamp as string) ?? out.timestamp;
    const sampled = mv.sampledValue as Record<string, unknown>[] | undefined;
    if (!Array.isArray(sampled)) continue;
    for (const s of sampled) {
      const measurand = (s.measurand as string) ?? 'Energy.Active.Import.Register';
      const value = Number(s.value);
      if (!Number.isFinite(value) || s.phase) continue;
      const unit = (s.unitOfMeasure as { unit?: string; multiplier?: number } | undefined) ?? {};
      const mult = Math.pow(10, unit.multiplier ?? 0);
      const v = value * mult;
      if (measurand === 'Energy.Active.Import.Register') out.energyWh = unit.unit === 'kWh' ? v * 1000 : v;
      else if (measurand === 'Power.Active.Import') out.powerW = unit.unit === 'kW' ? v * 1000 : v;
      else if (measurand === 'SoC') out.socPercent = v;
    }
  }
  return out;
}

/** 2.0.1 has fewer connector states; chargingState in TransactionEvent refines Occupied. */
function mapStatus201(s: string): ConnectorStatus {
  switch (s) {
    case 'Available':
      return 'Available';
    case 'Occupied':
      return 'Preparing';
    case 'Reserved':
      return 'Reserved';
    case 'Unavailable':
      return 'Unavailable';
    case 'Faulted':
      return 'Faulted';
    default:
      return 'Unknown';
  }
}

function mapChargingState(s: string | undefined): ConnectorStatus | undefined {
  switch (s) {
    case 'Charging':
      return 'Charging';
    case 'SuspendedEV':
      return 'SuspendedEV';
    case 'SuspendedEVSE':
      return 'SuspendedEVSE';
    case 'EVConnected':
      return 'Preparing';
    case 'Idle':
      return undefined;
    default:
      return undefined;
  }
}

export function attachV201(rpc: RpcEndpoint, sink: ChargerSink, heartbeatIntervalS = 60): ChargerCommands {
  /** transactionId → evseId, so meter updates without evse can be routed. */
  const txEvse = new Map<string, number>();

  rpc.handle('BootNotification', (p) => {
    const cs = (p.chargingStation ?? {}) as Record<string, unknown>;
    sink.booted({
      vendor: cs.vendorName as string,
      model: cs.model as string,
      firmware: cs.firmwareVersion as string | undefined,
      serial: cs.serialNumber as string | undefined,
    });
    return { status: 'Accepted', currentTime: new Date().toISOString(), interval: heartbeatIntervalS };
  });

  rpc.handle('Heartbeat', () => {
    sink.heartbeat();
    return { currentTime: new Date().toISOString() };
  });

  rpc.handle('StatusNotification', (p) => {
    const evseId = Number(p.evseId);
    if (!Number.isFinite(evseId)) throw new OcppError('TypeConstraintViolation', 'evseId must be a number');
    const raw = String(p.connectorStatus ?? '');
    const status = mapStatus201(raw);
    if (status === 'Unknown') sink.note(`Unknown 2.0.1 connectorStatus "${raw}" on EVSE ${evseId}`);
    sink.connectorStatus(evseId, status);
    return {};
  });

  rpc.handle('Authorize', async (p) => {
    const tok = (p.idToken as { idToken?: string } | undefined)?.idToken;
    if (!tok) throw new OcppError('OccurrenceConstraintViolation', 'idToken is required');
    const status = await sink.authorize(tok);
    return { idTokenInfo: { status } };
  });

  rpc.handle('TransactionEvent', async (p) => {
    const eventType = p.eventType as 'Started' | 'Updated' | 'Ended';
    const info = (p.transactionInfo ?? {}) as Record<string, unknown>;
    const transactionId = String(info.transactionId ?? '');
    if (!transactionId) throw new OcppError('OccurrenceConstraintViolation', 'transactionInfo.transactionId is required');
    const evseId = Number((p.evse as { id?: number } | undefined)?.id ?? txEvse.get(transactionId) ?? 1);
    const timestamp = (p.timestamp as string) ?? new Date().toISOString();
    const meter = parseMeterValues201(p.meterValue);
    const idTag = (p.idToken as { idToken?: string } | undefined)?.idToken;

    let idTokenInfo: { status: string } | undefined;

    if (eventType === 'Started') {
      txEvse.set(transactionId, evseId);
      const r = await sink.transactionStarted({
        connectorId: evseId,
        idTag: idTag ?? '',
        meterStartWh: meter.energyWh ?? 0,
        timestamp,
        transactionId,
        remoteStartId: info.remoteStartId !== undefined ? Number(info.remoteStartId) : undefined,
      });
      idTokenInfo = { status: r.auth };
    }

    const cs = mapChargingState(info.chargingState as string | undefined);
    if (cs) sink.connectorStatus(evseId, cs);

    if (meter.energyWh !== undefined || meter.powerW !== undefined) {
      sink.meter({ connectorId: evseId, transactionId, energyWh: meter.energyWh, powerW: meter.powerW, socPercent: meter.socPercent, timestamp });
    }

    if (eventType === 'Ended') {
      sink.transactionEnded({
        transactionId,
        meterStopWh: meter.energyWh,
        reason: (info.stoppedReason as string) ?? 'Local',
        timestamp,
      });
      txEvse.delete(transactionId);
    }

    return idTokenInfo ? { idTokenInfo } : {};
  });

  rpc.handle('MeterValues', (p) => {
    const m = parseMeterValues201(p.meterValue);
    sink.meter({ connectorId: Number(p.evseId), energyWh: m.energyWh, powerW: m.powerW, socPercent: m.socPercent, timestamp: m.timestamp ?? new Date().toISOString() });
    return {};
  });

  rpc.handle('NotifyEvent', () => ({}));
  rpc.handle('NotifyReport', () => ({}));
  rpc.handle('SecurityEventNotification', () => ({}));
  rpc.handle('FirmwareStatusNotification', () => ({}));
  rpc.handle('LogStatusNotification', () => ({}));
  rpc.handle('DataTransfer', (p) => {
    sink.note(`DataTransfer from vendor ${String(p.vendorId)}`);
    return { status: 'UnknownVendorId' };
  });

  const simple = (s: unknown): SimpleStatus => (s === 'Accepted' ? 'Accepted' : s === 'NotSupported' ? 'NotSupported' : 'Rejected');

  return {
    async startCharging(connectorId, idTag, remoteStartId) {
      const r = await rpc.call('RequestStartTransaction', {
        evseId: connectorId,
        remoteStartId,
        idToken: { idToken: idTag, type: 'Central' },
      });
      return simple(r.status);
    },
    async stopCharging(transactionId) {
      const r = await rpc.call('RequestStopTransaction', { transactionId });
      return simple(r.status);
    },
    async reset(kind) {
      const r = await rpc.call('Reset', { type: kind === 'hard' ? 'Immediate' : 'OnIdle' });
      return r.status === 'Scheduled' ? 'Accepted' : simple(r.status);
    },
    async unlock(connectorId) {
      const r = await rpc.call('UnlockConnector', { evseId: connectorId, connectorId: 1 });
      const s = r.status as string;
      return s === 'Unlocked' ? 'Unlocked' : s === 'UnknownConnector' ? 'NotSupported' : 'UnlockFailed';
    },
    async getConfig(keys) {
      const wanted = keys?.length ? keys : ['HeartbeatInterval', 'MeterValueSampleInterval', 'AuthorizeRemoteStart'];
      const r = await rpc.call('GetVariables', {
        getVariableData: wanted.map((k) => ({ component: { name: 'OCPPCommCtrlr' }, variable: { name: k } })),
      });
      const res = (r.getVariableResult as Record<string, unknown>[]) ?? [];
      return res.map((v) => ({
        key: (v.variable as { name: string }).name,
        value: v.attributeValue as string | undefined,
        readonly: v.attributeStatus === 'Rejected',
      }));
    },
    async setConfig(key, value) {
      const r = await rpc.call('SetVariables', {
        setVariableData: [{ component: { name: 'OCPPCommCtrlr' }, variable: { name: key }, attributeValue: value }],
      });
      const first = ((r.setVariableResult as Record<string, unknown>[]) ?? [])[0];
      const s = first?.attributeStatus as string;
      return s === 'Accepted' ? 'Accepted' : s === 'RebootRequired' ? 'RebootRequired' : s === 'NotSupportedAttributeType' ? 'NotSupported' : 'Rejected';
    },
  };
}
