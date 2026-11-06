import { connectorTone, type StationWithDetail, type ConnectorType, type Vehicle } from '@achargex/shared';
import { distanceKm } from '../../lib/format';

export interface StationSummary {
  available: number;
  total: number;
  maxKw: number;
  hasDc: boolean;
  minPrice: number;
  types: ConnectorType[];
  allOffline: boolean;
  tone: 'available' | 'busy' | 'offline';
  distance?: number;
}

export function summarize(s: StationWithDetail, from?: { lat: number; lng: number }): StationSummary {
  const connected = new Set(s.chargers.filter((c) => c.connected).map((c) => c.id));
  const live = s.connectors.filter((c) => connected.has(c.chargerId));
  const available = live.filter((c) => c.status === 'Available').length;
  const maxKw = Math.max(0, ...s.connectors.map((c) => c.powerKw));
  const prices = s.tariffs.map((t) => t.pricePerKwh);
  const allOffline = live.length === 0 || live.every((c) => ['offline', 'unknown'].includes(connectorTone(c.status)));
  return {
    available,
    total: s.connectors.length,
    maxKw,
    hasDc: s.connectors.some((c) => c.current === 'DC'),
    minPrice: prices.length ? Math.min(...prices) : 0,
    types: [...new Set(s.connectors.map((c) => c.type))],
    allOffline,
    tone: allOffline ? 'offline' : available > 0 ? 'available' : 'busy',
    distance: from ? distanceKm(from, s) : undefined,
  };
}

export interface Filters {
  q: string;
  availableOnly: boolean;
  myConnectors: boolean;
  types: ConnectorType[];
  minKw: number;
  maxPrice: number;
  dcOnly: boolean;
  open24h: boolean;
}

export const DEFAULT_FILTERS: Filters = { q: '', availableOnly: false, myConnectors: false, types: [], minKw: 0, maxPrice: 0, dcOnly: false, open24h: false };

export function activeFilterCount(f: Filters) {
  return [f.types.length > 0, f.minKw > 0, f.maxPrice > 0, f.dcOnly, f.open24h].filter(Boolean).length;
}

export function applyFilters(list: StationWithDetail[], f: Filters, vehicle: Vehicle | undefined, from: { lat: number; lng: number }) {
  const q = f.q.trim().toLowerCase();
  return list
    .map((s) => ({ s, sum: summarize(s, from) }))
    .filter(({ s, sum }) => {
      if (q && !`${s.name} ${s.address} ${s.city}`.toLowerCase().includes(q)) return false;
      if (f.availableOnly && sum.available === 0) return false;
      if (f.myConnectors && vehicle && !s.connectors.some((c) => vehicle.connectors.includes(c.type))) return false;
      if (f.types.length && !s.connectors.some((c) => f.types.includes(c.type))) return false;
      if (f.minKw && sum.maxKw < f.minKw) return false;
      if (f.maxPrice && sum.minPrice > f.maxPrice) return false;
      if (f.dcOnly && !sum.hasDc) return false;
      if (f.open24h && !s.is24h) return false;
      return true;
    })
    .sort((a, b) => (a.sum.distance ?? 0) - (b.sum.distance ?? 0));
}
