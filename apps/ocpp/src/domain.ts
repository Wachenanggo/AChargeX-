/**
 * Version-neutral contracts between the CSMS core and the OCPP version adapters.
 * Adapters translate OCPP 1.6 / 2.0.1 messages to these calls and back.
 */
import type { ConnectorStatus } from '@achargex/shared';

export type AuthStatus = 'Accepted' | 'Invalid' | 'Blocked' | 'Expired';

/** Inbound: what a charger tells us, normalised. Implemented by the CSMS core. */
export interface ChargerSink {
  booted(info: { vendor?: string; model?: string; firmware?: string; serial?: string }): void;
  heartbeat(): void;
  connectorStatus(connectorId: number, status: ConnectorStatus, errorCode?: string): void;
  authorize(idTag: string): Promise<AuthStatus>;
  /**
   * A transaction began on the charger.
   * For 1.6 the CSMS assigns transactionId; for 2.0.1 the charger supplies it.
   */
  transactionStarted(t: {
    connectorId: number;
    idTag: string;
    meterStartWh: number;
    timestamp: string;
    transactionId?: string;
    remoteStartId?: number;
  }): Promise<{ transactionId: string; auth: AuthStatus }>;
  meter(m: { connectorId?: number; transactionId?: string; energyWh?: number; powerW?: number; socPercent?: number; timestamp: string }): void;
  transactionEnded(t: { transactionId: string; meterStopWh?: number; reason?: string; timestamp: string }): void;
  /** A raw vendor/unknown field or quirk worth logging. */
  note(message: string): void;
}

export type SimpleStatus = 'Accepted' | 'Rejected' | 'NotSupported';

/** Outbound: version-neutral commands. Implemented by each adapter. */
export interface ChargerCommands {
  startCharging(connectorId: number, idTag: string, remoteStartId: number): Promise<SimpleStatus>;
  stopCharging(transactionId: string): Promise<SimpleStatus>;
  reset(kind: 'soft' | 'hard'): Promise<SimpleStatus>;
  unlock(connectorId: number): Promise<SimpleStatus | 'Unlocked' | 'UnlockFailed'>;
  getConfig(keys?: string[]): Promise<{ key: string; value?: string; readonly: boolean }[]>;
  setConfig(key: string, value: string): Promise<SimpleStatus | 'RebootRequired'>;
}
