/**
 * AChargeX domain model. Shared by the web app and the OCPP service.
 * Mirrors supabase/migrations/0001_init.sql — keep them in sync.
 */

export type Role = 'guest' | 'driver' | 'owner' | 'operator' | 'admin' | 'super_admin';

export type ListingStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';

/** Union of OCPP 1.6 and 2.0.1 connector states, normalised. */
export type ConnectorStatus =
  | 'Available'
  | 'Preparing'
  | 'Charging'
  | 'SuspendedEV'
  | 'SuspendedEVSE'
  | 'Finishing'
  | 'Reserved'
  | 'Unavailable'
  | 'Faulted'
  | 'Offline'
  | 'Unknown';

export type ConnectorType = 'CCS2' | 'Type2' | 'CHAdeMO' | 'GBT' | 'CCS1' | 'Type1';

export type CurrentType = 'AC' | 'DC';

export type OcppVersion = '1.6' | '2.0.1';

/** Where a piece of data came from. Shown to users next to the data. */
export type DataSource = 'demo' | 'simulator' | 'ocpp' | 'owner';

export interface Tariff {
  id: string;
  /** PHP per kWh */
  pricePerKwh: number;
  /** Optional idle/overstay fee, PHP per minute after grace */
  idleFeePerMin?: number;
  idleGraceMin?: number;
  label?: string;
}

export interface Connector {
  id: string;
  chargerId: string;
  /** OCPP connectorId (1-based) on the charger; for 2.0.1 this is evseId */
  ocppConnectorId: number;
  /** Human label printed on the charger, e.g. AX-MTN-B131-1 */
  label: string;
  type: ConnectorType;
  current: CurrentType;
  powerKw: number;
  status: ConnectorStatus;
  statusUpdatedAt: string;
  tariffId: string;
  /** Estimated minutes until free when Charging/Occupied, if known */
  etaFreeMin?: number;
}

export interface Charger {
  id: string;
  stationId: string;
  /** OCPP chargePointId / identity used in the WebSocket URL */
  ocppIdentity: string;
  vendor?: string;
  model?: string;
  firmware?: string;
  ocppVersion?: OcppVersion;
  isSimulated: boolean;
  connected: boolean;
  lastHeartbeatAt?: string;
  commissioned: boolean;
}

export interface Station {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  listingStatus: ListingStatus;
  openingHours: string;
  is24h: boolean;
  access: 'public' | 'customers' | 'private';
  amenities: string[];
  deal?: { title: string; detail: string };
  isDemo: boolean;
  source: DataSource;
  updatedAt: string;
  photoUrl?: string;
}

export interface StationWithDetail extends Station {
  chargers: Charger[];
  connectors: Connector[];
  tariffs: Tariff[];
}

export interface Vehicle {
  id: string;
  userId: string;
  make: string;
  model: string;
  nickname?: string;
  batteryKwh?: number;
  connectors: ConnectorType[];
  bodyType: 'sedan' | 'suv' | 'hatch' | 'trike' | 'van';
  plate?: string;
  isSelected: boolean;
}

export type SessionState =
  | 'created'
  | 'authorizing'
  | 'authorized'
  | 'starting'
  | 'charging'
  | 'stopping'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MeterSample {
  at: string;
  /** cumulative energy register in Wh as reported by charger */
  energyWh: number;
  powerW?: number;
  socPercent?: number;
}

export interface ChargingSession {
  id: string;
  userId: string;
  stationId: string;
  connectorId: string;
  chargerIdentity: string;
  state: SessionState;
  limitPhp: number;
  pricePerKwh: number;
  paymentTransactionId?: string;
  ocppTransactionId?: string;
  meterStartWh?: number;
  meterStopWh?: number;
  energyWh: number;
  powerW: number;
  costPhp: number;
  startedAt?: string;
  stoppedAt?: string;
  stopReason?: string;
  isSimulated: boolean;
  createdAt: string;
  error?: string;
}

export type PaymentProvider = 'demo' | 'gcash' | 'maya' | 'card' | 'qrph';

export type PaymentState =
  | 'created'
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'partially_refunded'
  | 'refunded'
  | 'voided'
  | 'failed';

export interface PaymentTransaction {
  id: string;
  userId: string;
  sessionId?: string;
  provider: PaymentProvider;
  state: PaymentState;
  /** authorized hold, PHP */
  holdAmount: number;
  /** captured final amount, PHP */
  capturedAmount?: number;
  idempotencyKey: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethod {
  id: string;
  userId: string;
  provider: PaymentProvider;
  label: string;
  /** e.g. last 4 digits — never full number */
  last4?: string;
  isDemo: boolean;
}

export interface QrCode {
  token: string;
  stationId: string;
  connectorId?: string;
  createdAt: string;
  revokedAt?: string;
  expiresAt?: string;
}

export interface AuditLog {
  id: string;
  at: string;
  actorId: string;
  actorRole: Role;
  action: string;
  target: string;
  detail?: string;
}

export interface OcppLogEntry {
  id: string;
  at: string;
  chargerIdentity: string;
  direction: 'in' | 'out';
  /** raw OCPP-J frame */
  frame: string;
}

export type CommandStatus = 'pending' | 'Accepted' | 'Rejected' | 'NotSupported' | 'timeout' | 'error' | 'offline';

export interface CommandResult {
  id: string;
  chargerIdentity: string;
  command: string;
  status: CommandStatus;
  detail?: unknown;
  issuedAt: string;
  completedAt?: string;
}

export interface Alert {
  id: string;
  at: string;
  severity: 'info' | 'warning' | 'critical';
  chargerIdentity?: string;
  stationId?: string;
  message: string;
  acknowledged: boolean;
}
