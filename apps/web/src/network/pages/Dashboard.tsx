import { Link } from 'react-router-dom';
import { Plus, ChevronRight, Wifi, WifiOff, Zap } from 'lucide-react';
import type { StationWithDetail, ChargingSession } from '@achargex/shared';
import { ButtonLink, Card, EmptyState, Notice, Skeleton, SectionTitle, DemoBadge } from '../../ui';
import { StationArt } from '../../assets/illustrations';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { ListingBadge } from '../shared';
import { kwh } from '../../lib/format';

export function useMyStations() {
  const q = useApi<StationWithDetail[]>('/api/stations?scope=mine');
  useLive((e) => {
    if (e.type === 'station') q.setData((l) => (l ? (l.some((s) => s.id === e.station.id) ? l.map((s) => (s.id === e.station.id ? e.station : s)) : l) : l));
    if (e.type === 'connector') q.setData((l) => l?.map((s) => (s.id === e.stationId ? { ...s, connectors: s.connectors.map((c) => (c.id === e.connector.id ? e.connector : c)) } : s)));
    if (e.type === 'charger') q.setData((l) => l?.map((s) => (s.id === e.stationId ? { ...s, chargers: s.chargers.map((c) => (c.id === e.charger.id ? e.charger : c)) } : s)));
  });
  return q;
}

export default function NetworkDashboard() {
  const stations = useMyStations();
  const sessions = useApi<Omit<ChargingSession, 'userId'>[]>('/api/network/sessions');
  const list = stations.data ?? [];
  const chargers = list.flatMap((s) => s.chargers);
  const online = chargers.filter((c) => c.connected).length;
  const connectors = list.flatMap((s) => s.connectors);
  const done = (sessions.data ?? []).filter((s) => s.state === 'completed');
  const energy = done.reduce((a, s) => a + s.energyWh, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">AChargeX Network</p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.6px]">Your stations</h1>
        </div>
        <ButtonLink to="/network/stations/new" icon={<Plus className="h-4 w-4" />}>
          Register a station
        </ButtonLink>
      </div>
      {stations.offline && <Notice tone="warn" className="mt-4">The AChargeX service is unreachable.</Notice>}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Stations', value: list.length, sub: `${list.filter((s) => s.listingStatus === 'approved').length} approved` },
          { label: 'Chargers online', value: `${online}/${chargers.length}`, sub: 'verified by OCPP' },
          { label: 'Connectors free', value: connectors.filter((c) => c.status === 'Available').length, sub: `of ${connectors.length}` },
          { label: 'Energy delivered', value: `${kwh(energy, 1)} kWh`, sub: `${done.length} completed sessions` },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <p className="eyebrow">{k.label}</p>
            <p className="num mt-1 text-[22px] font-bold">{stations.loading ? '—' : k.value}</p>
            <p className="text-[12px] text-ax-muted">{k.sub}</p>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-ax-muted">Earnings and settlements appear once a payment provider and payout account are connected — AChargeX never estimates them.</p>

      <SectionTitle className="mt-8">Stations</SectionTitle>
      {stations.loading ? (
        <Skeleton className="mt-3 h-32" />
      ) : list.length === 0 ? (
        <Card className="mt-3">
          <EmptyState art={<StationArt width={150} />} title="Register your first station" action={<ButtonLink to="/network/stations/new" variant="charge">Get started</ButtonLink>}>
            List your chargers, connect them over OCPP and let drivers find and pay at your station.
          </EmptyState>
        </Card>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {list.map((s) => {
            const on = s.chargers.filter((c) => c.connected).length;
            return (
              <Link key={s.id} to={`/network/stations/${s.id}`} className="flex flex-col gap-3 rounded-[20px] border border-ax-border bg-white p-4 hover:shadow-card">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ax-mint">
                    <Zap className="h-5 w-5 fill-ax-green-text text-ax-green-text" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{s.name}</span>
                    <span className="block truncate text-[13px] text-ax-muted">
                      {s.address}, {s.city}
                    </span>
                  </span>
                  <ChevronRight className="mt-2 h-5 w-5 text-ax-muted" aria-hidden />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-ax-muted">
                  <ListingBadge status={s.listingStatus} />
                  {s.isDemo && <DemoBadge />}
                  <span className="inline-flex items-center gap-1">
                    {on > 0 ? <Wifi className="h-3.5 w-3.5 text-ax-green-text" /> : <WifiOff className="h-3.5 w-3.5" />}
                    {on}/{s.chargers.length} chargers online
                  </span>
                  <span>· {s.connectors.length} connectors</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
