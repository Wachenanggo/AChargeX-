import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ScanLine, ChevronRight, Zap, Headset, UserRound, History } from 'lucide-react';
import { can, CONNECTOR_LABEL, type ChargingSession } from '@achargex/shared';
import { Logo, IconButton, SectionTitle, Card, Notice, ButtonLink, DemoBadge, Skeleton, EmptyState } from '../../ui';
import { VehicleArt, EmptyArt } from '../../assets/illustrations';
import { useAuth } from '../../auth/AuthProvider';
import { useGo } from '../data';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { Page } from '../GoLayout';
import { StationCard } from '../components/StationCard';
import { summarize } from '../components/station-utils';
import { dateTime, formatPhp, kwh } from '../../lib/format';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { user } = useAuth();
  const { stations, loading, offline, location, selectedVehicle } = useGo();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const canSessions = !!user && can(user.role, 'sessions:own') && !offline;
  const sessions = useApi<ChargingSession[]>(canSessions ? '/api/sessions' : null, [user?.id]);

  useLive((e) => {
    if (e.type === 'session' && e.session.userId === user?.id) {
      sessions.setData((list) => {
        const l = list ?? [];
        return l.some((s) => s.id === e.session.id) ? l.map((s) => (s.id === e.session.id ? e.session : s)) : [e.session, ...l];
      });
    }
  });

  const active = sessions.data?.find((s) => ['starting', 'charging', 'stopping'].includes(s.state));
  const recent = (sessions.data ?? []).filter((s) => s.state === 'completed').slice(0, 3);
  const nearby = useMemo(
    () =>
      stations
        .map((s) => ({ s, sum: summarize(s, location) }))
        .sort((a, b) => (a.sum.distance ?? 0) - (b.sum.distance ?? 0))
        .slice(0, 3),
    [stations, location],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`/find${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  return (
    <Page wide>
      {/* compact header (mobile/tablet) */}
      <header className="flex h-16 items-center justify-between lg:hidden">
        <Logo />
        <div className="flex gap-2">
          <IconButton label="Support" onClick={() => nav('/account#support')}>
            <Headset className="h-5 w-5" />
          </IconButton>
          <IconButton label="Account" dark onClick={() => nav('/account')}>
            <UserRound className="h-5 w-5" />
          </IconButton>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:pt-8">
        <div className="min-w-0">
          <div className="mt-1 lg:mt-0">
            <p className="text-[14px] font-medium text-ax-muted">{greeting()},</p>
            <h1 className="text-[26px] font-extrabold tracking-[-0.6px]">{user && user.role !== 'guest' ? user.name.split(' ')[0] : 'EV driver'}</h1>
          </div>

          {offline && (
            <Notice tone="warn" title="Preview mode" className="mt-4">
              The AChargeX service is unreachable, so stations below are a static demo preview with no live availability. Charging is disabled.
            </Notice>
          )}

          {active && <ActiveSessionCard s={active} />}

          {/* search + scan */}
          <form onSubmit={submit} className="mt-4 flex gap-2" role="search">
            <label className="flex h-12 flex-1 items-center gap-2 rounded-[14px] border border-ax-border bg-white px-3.5 shadow-card focus-within:border-ax-green">
              <Search className="h-[18px] w-[18px] shrink-0 text-ax-muted" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Where do you want to charge?"
                aria-label="Search stations"
                className="h-full w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ax-muted"
              />
            </label>
          </form>
          <Link to="/scan" className="mt-3 flex items-center gap-3 rounded-[18px] bg-ax-navy p-4 text-white transition-colors hover:bg-[#223050]">
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ax-green">
              <ScanLine className="h-6 w-6 text-ax-navy" strokeWidth={2.2} aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-bold">Scan charger QR</span>
              <span className="block text-[13px] text-ax-navy-sub">Open a charger instantly at the station</span>
            </span>
            <ChevronRight className="h-5 w-5 text-ax-navy-sub" aria-hidden />
          </Link>

          {/* nearby */}
          <SectionTitle className="mt-7" action={<Link to="/find" className="text-[13px] font-semibold text-ax-green-text">See map</Link>}>
            Nearby · {location.label}
          </SectionTitle>
          <div className="mt-3 flex flex-col gap-3">
            {loading && [0, 1].map((k) => <Skeleton key={k} className="h-[132px] rounded-[20px]" />)}
            {!loading && nearby.length === 0 && <EmptyState art={<EmptyArt kind="stations" />} title="No stations yet" />}
            {nearby.map(({ s, sum }) => (
              <StationCard key={s.id} station={s} sum={sum} offline={offline} to={`/station/${s.id}`} />
            ))}
          </div>
        </div>

        <aside className="min-w-0">
          {/* vehicle */}
          <SectionTitle className="mt-7 lg:mt-1" action={<Link to="/garage" className="text-[13px] font-semibold text-ax-green-text">Garage</Link>}>
            Your vehicle
          </SectionTitle>
          {selectedVehicle ? (
            <Link to="/garage" className="mt-3 flex items-center gap-3 rounded-[18px] border border-ax-border bg-white p-3.5 hover:shadow-card">
              <span className="flex h-12 w-[72px] items-center justify-center rounded-[12px] bg-ax-surface">
                <VehicleArt body={selectedVehicle.bodyType} width={64} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {selectedVehicle.make} {selectedVehicle.model}
                </span>
                <span className="block truncate text-[13px] text-ax-muted">{selectedVehicle.connectors.map((c) => CONNECTOR_LABEL[c]).join(' / ')}{selectedVehicle.batteryKwh ? ` · ${selectedVehicle.batteryKwh} kWh` : ''}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-ax-muted" aria-hidden />
            </Link>
          ) : (
            <Card className="mt-3 flex items-center gap-3 p-4">
              <VehicleArt body="hatch" width={64} />
              <div className="min-w-0 flex-1 text-[13px] text-ax-muted">{user && can(user.role, 'vehicles:own') ? 'Add your EV to filter compatible chargers.' : 'Sign in to save your EV and filter compatible chargers.'}</div>
              <ButtonLink to={user && can(user.role, 'vehicles:own') ? '/garage' : '/signin'} variant="secondary" size="sm">
                {user && can(user.role, 'vehicles:own') ? 'Add' : 'Sign in'}
              </ButtonLink>
            </Card>
          )}

          {/* recent */}
          <SectionTitle className="mt-7" action={canSessions && <Link to="/sessions" className="text-[13px] font-semibold text-ax-green-text">All sessions</Link>}>
            Recent charging
          </SectionTitle>
          <Card className="mt-3 divide-y divide-ax-border">
            {!canSessions && <p className="p-4 text-[13px] text-ax-muted">{offline ? 'Unavailable in preview mode.' : 'Sign in to see your charging history.'}</p>}
            {canSessions && recent.length === 0 && !sessions.loading && (
              <div className="flex items-center gap-3 p-4 text-[13px] text-ax-muted">
                <History className="h-5 w-5" aria-hidden /> No completed sessions yet.
              </div>
            )}
            {recent.map((s) => {
              const st = stations.find((x) => x.id === s.stationId);
              return (
                <Link key={s.id} to={`/session/${s.id}`} className="flex items-center gap-3 p-4 hover:bg-ax-bg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ax-mint">
                    <Zap className="h-4 w-4 fill-ax-green-text text-ax-green-text" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{st?.name ?? 'Charging session'}</span>
                    <span className="block text-[12px] text-ax-muted">{dateTime(s.stoppedAt ?? s.createdAt)} · {kwh(s.energyWh)} kWh</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="num text-[14px] font-bold">{formatPhp(s.costPhp)}</span>
                    {s.isSimulated && <DemoBadge />}
                  </span>
                </Link>
              );
            })}
          </Card>
        </aside>
      </div>
    </Page>
  );
}

function ActiveSessionCard({ s }: { s: ChargingSession }) {
  const pct = Math.min(100, Math.round((s.costPhp / s.limitPhp) * 100));
  return (
    <Link to={`/session/${s.id}`} className="mt-4 block rounded-[20px] bg-ax-navy-deep p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[1.4px] text-ax-green">{s.state === 'charging' ? 'CHARGING IN PROGRESS' : s.state === 'starting' ? 'STARTING…' : 'STOPPING…'}</p>
          <p className="num mt-1 text-[24px] font-bold">
            {kwh(s.energyWh)} <span className="font-sans text-[13px] font-medium text-ax-navy-sub">kWh</span>
          </p>
        </div>
        {s.isSimulated && <DemoBadge dark />}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ax-navy-line">
        <div className="h-full rounded-full bg-ax-green transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-ax-navy-sub">
        <span className="num">{formatPhp(s.costPhp)} of {formatPhp(s.limitPhp)}</span>
        <span className="font-semibold text-white">View session →</span>
      </div>
    </Link>
  );
}
