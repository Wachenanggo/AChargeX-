import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildDemoNetwork, type StationWithDetail, type Vehicle, type PaymentProvider } from '@achargex/shared';
import { api, OfflineError } from '../lib/api';
import { useLive } from '../lib/live';
import { useAuth } from '../auth/AuthProvider';
import { can } from '@achargex/shared';

export interface ServiceConfig {
  demoMode: boolean;
  supabaseConfigured: boolean;
  ocppUrl: string;
  paymentProviders: { id: PaymentProvider; name: string; short: string; enabled: boolean; isDemo: boolean }[];
}

interface GoCtx {
  stations: StationWithDetail[];
  loading: boolean;
  /** API unreachable — showing a static, non-live preview. */
  offline: boolean;
  config?: ServiceConfig;
  reload: () => void;
  location: { lat: number; lng: number; label: string; precise: boolean };
  setLocation: (l: { lat: number; lng: number; label: string; precise: boolean }) => void;
  locate: () => Promise<void>;
  vehicles: Vehicle[];
  selectedVehicle?: Vehicle;
  reloadVehicles: () => void;
}

const Ctx = createContext<GoCtx | null>(null);
export const DEFAULT_LOCATION = { lat: 7.0731, lng: 125.6128, label: 'Davao City', precise: false };

export function GoDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [stations, setStations] = useState<StationWithDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [config, setConfig] = useState<ServiceConfig>();
  const [tick, setTick] = useState(0);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vTick, setVTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api<StationWithDetail[]>('/api/stations'), api<ServiceConfig>('/api/config')])
      .then(([s, c]) => {
        if (!alive) return;
        setStations(s);
        setConfig(c);
        setOffline(false);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof OfflineError) {
          // Static preview: real layout, no live status, charging disabled.
          setStations(buildDemoNetwork().filter((s) => s.listingStatus === 'approved'));
          setOffline(true);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick, user?.role]);

  useEffect(() => {
    if (!user || !can(user.role, 'vehicles:own') || offline) {
      setVehicles([]);
      return;
    }
    api<Vehicle[]>('/api/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, [user?.id, user?.role, vTick, offline]);

  useLive((e) => {
    if (e.type === 'connector') {
      setStations((list) =>
        list.map((s) => (s.id === e.stationId ? { ...s, connectors: s.connectors.map((c) => (c.id === e.connector.id ? e.connector : c)) } : s)),
      );
    } else if (e.type === 'charger') {
      setStations((list) => list.map((s) => (s.id === e.stationId ? { ...s, chargers: s.chargers.map((c) => (c.id === e.charger.id ? e.charger : c)) } : s)));
    } else if (e.type === 'station' && e.station.listingStatus === 'approved') {
      setStations((list) => (list.some((s) => s.id === e.station.id) ? list.map((s) => (s.id === e.station.id ? e.station : s)) : [...list, e.station]));
    } else if (e.type === 'vehicles') {
      setVehicles(e.vehicles);
    }
  });

  const locate = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'));
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your location', precise: true });
            resolve();
          },
          () => reject(new Error('Location permission was denied. Search for a place instead.')),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
        );
      }),
    [],
  );

  const value = useMemo<GoCtx>(
    () => ({
      stations,
      loading,
      offline,
      config,
      reload: () => setTick((t) => t + 1),
      location,
      setLocation,
      locate,
      vehicles,
      selectedVehicle: vehicles.find((v) => v.isSelected) ?? vehicles[0],
      reloadVehicles: () => setVTick((t) => t + 1),
    }),
    [stations, loading, offline, config, location, locate, vehicles],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGo() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useGo outside provider');
  return c;
}

/** Geocode a free-text place with OpenStreetMap Nominatim (PH only, low volume, attributed). */
export async function geocode(q: string): Promise<{ lat: number; lng: number; label: string }[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ph&limit=5&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Place search is unavailable right now.');
  const data = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  return data.map((d) => ({ lat: Number(d.lat), lng: Number(d.lon), label: d.display_name.split(',').slice(0, 2).join(',') }));
}
