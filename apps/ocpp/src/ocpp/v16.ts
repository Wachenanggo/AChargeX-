/** OCPP 1.6J adapter: maps 1.6 messages ⇄ version-neutral domain contracts. */
import { OcppError, type RpcEndpoint, type ConnectorStatus } from '@achargex/shared';
import type { ChargerSink, ChargerCommands, SimpleStatus } from '../domain';

const V16_STATUSES: ConnectorStatus[] = [
  'Available', 'Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing', 'Reserved', 'Unavailable', 'Faulted',
];

function num(v: unknown, field: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new OcppError('TypeConstraintViolation', `${field} must be a number`);
  return n;
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v) throw new OcppError('OccurenceConstraintViolation', `${field} is required`);
  return v;
}

/** Extract energy (Wh) and power (W) from 1.6 meterValue arrays, honouring units. */
export function parseMeterValues16(meterValue: unknown): { energyWh?: number; powerW?: number; socPercent?: number; timestamp?: string } {
  const out: { energyWh?: number; powerW?: number; socPercent?: number; timestamp?: string } = {};
  if (!Array.isArray(meterValue)) return out;
  for (const mv of meterValue) {
    if (!mv || typeof mv !== 'object') continue;
    out.timestamp = (mv as { timestamp?: string }).timestamp ?? out.timestamp;
    const sampled = (mv as { sampledValue?: unknown[] }).sampledValue;
    if (!Array.isArray(sampled)) continue;
    for (const s of sampled as Record<string, unknown>[]) {
      const measurand = (s.measurand as string) ?? 'Energy.Active.Import.Register';
      const unit = (s.unit as string) ?? (measurand.startsWith('Energy') ? 'Wh' : measurand.startsWith('Power') ? 'W' : '');
      const value = Number(s.value);
      if (!Number.isFinite(value)) continue;
      if (s.phase) continue; // only totals
      if (measurand === 'Energy.Active.Import.Register') out.energyWh = unit === 'kWh' ? value * 1000 : value;
      else if (measurand === 'Power.Active.Import') out.powerW = unit === 'kW' ? value * 1000 : value;
      else if (measurand === 'SoC') out.socPercent = value;
    }
  }
  return out;
}

export function attachV16(rpc: RpcEndpoint, sink: ChargerSink, heartbeatIntervalS = 60): ChargerCommands {
  rpc.handle('BootNotification', (p) => {
    sink.booted({
      vendor: p.chargePointVendor as string,
      model: p.chargePointModel as string,
      firmware: p.firmwareVersion as string | undefined,
      serial: (p.chargePointSerialNumber ?? p.chargeBoxSerialNumber) as string | undefined,
    });
    return { status: 'Accepted', currentTime: new Date().toISOString(), interval: heartbeatIntervalS };
  });

  rpc.handle('Heartbeat', () => {
    sink.heartbeat();
    return { currentTime: new Date().toISOString() };
  });

  rpc.handle('StatusNotification', (p) => {
    const connectorId = num(p.connectorId, 'connectorId');
    const raw = str(p.status, 'status');
    const status: ConnectorStatus = (V16_STATUSES as string[]).includes(raw) ? (raw as ConnectorStatus) : 'Unknown';
    if (status === 'Unknown') sink.note(`Unknown 1.6 status "${raw}" on connector ${connectorId}`);
    // connectorId 0 = whole charge point; we apply it only for Unavailable/Faulted.
    sink.connectorStatus(connectorId, status, p.errorCode as string | undefined);
    return {};
  });

  rpc.handle('Authorize', async (p) => {
    const status = await sink.authorize(str(p.idTag, 'idTag'));
    return { idTagInfo: { status } };
  });

  rpc.handle('StartTransaction', async (p) => {
    const r = await sink.transactionStarted({
      connectorId: num(p.connectorId, 'connectorId'),
      idTag: str(p.idTag, 'idTag'),
      meterStartWh: num(p.meterStart, 'meterStart'),
      timestamp: (p.timestamp as string) ?? new Date().toISOString(),
    });
    // 1.6 transactionId is an integer.
    return { transactionId: Number(r.transactionId), idTagInfo: { status: r.auth } };
  });

  rpc.handle('MeterValues', (p) => {
    const parsed = parseMeterValues16(p.meterValue);
    sink.meter({
      connectorId: p.connectorId !== undefined ? num(p.connectorId, 'connectorId') : undefined,
      transactionId: p.transactionId !== undefined ? String(p.transactionId) : undefined,
      energyWh: parsed.energyWh,
      powerW: parsed.powerW,
      socPercent: parsed.socPercent,
      timestamp: parsed.timestamp ?? new Date().toISOString(),
    });
    return {};
  });

  rpc.handle('StopTransaction', (p) => {
    const transactionId = String(num(p.transactionId, 'transactionId'));
    if (p.transactionData) {
      const parsed = parseMeterValues16(p.transactionData);
      if (parsed.energyWh !== undefined) sink.meter({ transactionId, energyWh: parsed.energyWh, timestamp: parsed.timestamp ?? new Date().toISOString() });
    }
    sink.transactionEnded({
      transactionId,
      meterStopWh: p.meterStop !== undefined ? num(p.meterStop, 'meterStop') : undefined,
      reason: (p.reason as string) ?? 'Local',
      timestamp: (p.timestamp as string) ?? new Date().toISOString(),
    });
    return { idTagInfo: { status: 'Accepted' } };
  });

  rpc.handle('DataTransfer', (p) => {
    sink.note(`DataTransfer from vendor ${String(p.vendorId)} (${String(p.messageId ?? '')})`);
    return { status: 'UnknownVendorId' };
  });

  rpc.handle('DiagnosticsStatusNotification', () => ({}));
  rpc.handle('FirmwareStatusNotification', () => ({}));

  const simple = (s: unknown): SimpleStatus => (s === 'Accepted' ? 'Accepted' : s === 'NotSupported' ? 'NotSupported' : 'Rejected');

  return {
    async startCharging(connectorId, idTag) {
      const r = await rpc.call('RemoteStartTransaction', { connectorId, idTag });
      return simple(r.status);
    },
    async stopCharging(transactionId) {
      const r = await rpc.call('RemoteStopTransaction', { transactionId: Number(transactionId) });
      return simple(r.status);
    },
    async reset(kind) {
      const r = await rpc.call('Reset', { type: kind === 'hard' ? 'Hard' : 'Soft' });
      return simple(r.status);
    },
    async unlock(connectorId) {
      const r = await rpc.call('UnlockConnector', { connectorId });
      const s = r.status as string;
      return s === 'Unlocked' ? 'Unlocked' : s === 'NotSupported' ? 'NotSupported' : 'UnlockFailed';
    },
    async getConfig(keys) {
      const r = await rpc.call('GetConfiguration', keys?.length ? { key: keys } : {});
      const list = (r.configurationKey as { key: string; value?: string; readonly: boolean }[]) ?? [];
      return list.map((k) => ({ key: k.key, value: k.value, readonly: !!k.readonly }));
    },
    async setConfig(key, value) {
      const r = await rpc.call('ChangeConfiguration', { key, value });
      const s = r.status as string;
      return s === 'Accepted' ? 'Accepted' : s === 'RebootRequired' ? 'RebootRequired' : s === 'NotSupported' ? 'NotSupported' : 'Rejected';
    },
  };
}
