import type { ConnectorStatus, ListingStatus, Station, Charger, Connector } from './types';

export type StatusTone = 'available' | 'busy' | 'reserved' | 'fault' | 'offline' | 'unknown';

/** Collapse detailed OCPP states into what a driver needs to see. */
export function connectorTone(status: ConnectorStatus): StatusTone {
  switch (status) {
    case 'Available':
      return 'available';
    case 'Preparing':
    case 'Charging':
    case 'SuspendedEV':
    case 'SuspendedEVSE':
    case 'Finishing':
      return 'busy';
    case 'Reserved':
      return 'reserved';
    case 'Faulted':
      return 'fault';
    case 'Unavailable':
    case 'Offline':
      return 'offline';
    default:
      return 'unknown';
  }
}

export const TONE_LABEL: Record<StatusTone, string> = {
  available: 'Available',
  busy: 'Occupied',
  reserved: 'Reserved',
  fault: 'Faulted',
  offline: 'Offline',
  unknown: 'Unknown',
};

/**
 * A driver may start charging only when ALL of these hold:
 * station approved, charger commissioned + connected, connector Available.
 * Demo/simulated stations are allowed only through the simulator path.
 */
export function canStartCharging(
  station: Pick<Station, 'listingStatus'>,
  charger: Pick<Charger, 'commissioned' | 'connected'> | undefined,
  connector: Pick<Connector, 'status'>,
): { ok: true } | { ok: false; reason: string } {
  if (station.listingStatus !== 'approved') return { ok: false, reason: 'Station is not approved for charging yet.' };
  if (!charger) return { ok: false, reason: 'Charger not found.' };
  if (!charger.commissioned) return { ok: false, reason: 'Charger has not been commissioned.' };
  if (!charger.connected) return { ok: false, reason: 'Charger is offline.' };
  if (connector.status !== 'Available') {
    return { ok: false, reason: `Connector is ${TONE_LABEL[connectorTone(connector.status)].toLowerCase()}.` };
  }
  return { ok: true };
}

export const LISTING_LABEL: Record<ListingStatus, string> = {
  draft: 'Draft',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

/** Allowed listing transitions and who may perform them. */
export const LISTING_TRANSITIONS: Record<ListingStatus, { to: ListingStatus; by: 'owner' | 'admin' }[]> = {
  draft: [{ to: 'pending', by: 'owner' }],
  pending: [
    { to: 'approved', by: 'admin' },
    { to: 'rejected', by: 'admin' },
    { to: 'draft', by: 'owner' },
  ],
  approved: [{ to: 'suspended', by: 'admin' }],
  rejected: [{ to: 'draft', by: 'owner' }],
  suspended: [{ to: 'approved', by: 'admin' }],
};

export function canTransitionListing(from: ListingStatus, to: ListingStatus, by: 'owner' | 'admin'): boolean {
  return LISTING_TRANSITIONS[from].some((t) => t.to === to && (t.by === by || by === 'admin'));
}
