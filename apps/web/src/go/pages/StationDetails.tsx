import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Navigation, Clock, MapPin, Tag, Zap, Share2 } from 'lucide-react';
import { can, canStartCharging, type StationWithDetail } from '@achargex/shared';
import { Button, Card, DemoBadge, Notice, Skeleton, Stat, EmptyState, IconButton } from '../../ui';
import { EmptyArt, StationArt } from '../../assets/illustrations';
import { useGo } from '../data';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { useNow } from '../../lib/hooks';
import { ConnectorCard } from '../components/ConnectorCard';
import { summarize } from '../components/station-utils';
import { directionsUrl, fmtKm, timeAgo, cx } from '../../lib/format';
import { Page } from '../GoLayout';

export default function StationDetails() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { stations, offline, location, selectedVehicle, loading } = useGo();
  const now = useNow(30_000);
  const fromCtx = stations.find((s) => s.id === id);
  const [fetched, setFetched] = useState<StationWithDetail | null>();
  useEffect(() => {
    if (fromCtx || loading) return;
    api<StationWithDetail>(`/api/stations/${id}`).then(setFetched).catch(() => setFetched(null));
  }, [id, fromCtx, loading]);
  const station = fromCtx ?? fetched ?? undefined;

  const [selected, setSelected] = useState<string | undefined>(params.get('connector') ?? undefined);
  const sum = useMemo(() => (station ? summarize(station, location) : undefined), [station, location]);

  if (!station) {
    return (
      <Page>
        <Header title="Station details" onBack={() => nav(-1)} />
        {loading || fetched === undefined ? (
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <EmptyState art={<EmptyArt kind="stations" />} title="Station not found" action={<Button onClick={() => nav('/find')}>Find stations</Button>}>
            It may have been removed or isn't approved yet.
          </EmptyState>
        )}
      </Page>
    );
  }

  const chargerOf = (cid: string) => station.chargers.find((c) => c.id === cid);
  const lastUpdate = station.connectors.reduce((a, c) => (c.statusUpdatedAt > a ? c.statusUpdatedAt : a), station.updatedAt);
  const selConnector = station.connectors.find((c) => c.id === selected);
  const elig = selConnector ? canStartCharging(station, chargerOf(selConnector.chargerId), selConnector) : undefined;
  const signedInDriver = !!user && can(user.role, 'sessions:start');
  const compatible = (t: string) => (selectedVehicle ? selectedVehicle.connectors.includes(t as never) : undefined);

  const startCta = () => {
    if (!selConnector) return;
    if (!signedInDriver) return nav(`/signin?next=${encodeURIComponent(`/charge/${selConnector.id}`)}`);
    nav(`/charge/${selConnector.id}`);
  };

  return (
    <div className="pb-[calc(96px+var(--nav-h)+var(--safe-bottom))] lg:pb-28">
      <Page wide>
        <Header
          title="Station details"
          onBack={() => nav(-1)}
          action={
            navigator.share ? (
              <IconButton label="Share station" onClick={() => navigator.share({ title: station.name, url: window.location.href }).catch(() => {})}>
                <Share2 className="h-5 w-5" />
              </IconButton>
            ) : undefined
          }
        />

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
          <div className="min-w-0">
            {station.deal && (
              <div className="mt-2 flex items-center gap-3 rounded-[18px] bg-ax-navy p-4 text-white">
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-ax-deal">
                  <Tag className="h-5 w-5 text-ax-navy" aria-hidden />
                </span>
                <span>
                  <span className="block text-[10px] font-bold tracking-[1.3px] text-ax-deal">STATION DEAL</span>
                  <span className="block text-[15px] font-semibold">
                    {station.deal.title} <span className="font-normal text-ax-navy-sub">{station.deal.detail}</span>
                  </span>
                </span>
              </div>
            )}

            <div className="mt-4 hidden overflow-hidden rounded-[20px] bg-ax-mint md:flex md:items-end md:justify-center md:pt-4">
              <StationArt width={220} />
            </div>

            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.5px]">{station.name}</h1>
                <p className="mt-1 flex items-start gap-1.5 text-[14px] text-ax-muted">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {station.address}, {station.city}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ax-muted">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden />
                  {sum?.distance !== undefined && `${fmtKm(sum.distance)} · `}
                  {station.openingHours}
                </p>
              </div>
              {station.isDemo && <DemoBadge />}
            </div>

            <Card className="mt-4 grid grid-cols-2 gap-3 p-4">
              <Stat
                label="Charge points"
                mono={false}
                value={
                  offline ? (
                    <span className="text-ax-muted">Not live</span>
                  ) : (
                    <span>
                      <span className={cx(sum && sum.available > 0 ? 'text-ax-green-text' : 'text-ax-busy')}>
                        {sum?.available} of {sum?.total}
                      </span>{' '}
                      ready
                    </span>
                  )
                }
              />
              <Stat label="Overstay fee" mono={false} wrap value={station.tariffs.find((t) => t.idleFeePerMin) ? `₱${station.tariffs.find((t) => t.idleFeePerMin)!.idleFeePerMin}/min after ${station.tariffs[0].idleGraceMin ?? 10} min` : 'None'} />
            </Card>
            {station.amenities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {station.amenities.map((a) => (
                  <span key={a} className="rounded-full bg-ax-surface px-3 py-1 text-[12px] font-medium text-ax-muted">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="mt-6 flex items-center justify-between lg:mt-2">
              <h2 className="eyebrow">Connectors</h2>
              <span className="text-[12px] text-ax-muted">
                {offline ? 'Preview — not live' : `Updated ${timeAgo(lastUpdate, now)}`} · {station.source === 'demo' ? 'DEMO · simulator' : station.source === 'ocpp' ? 'Live OCPP' : 'Owner-reported'}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2.5" role="radiogroup" aria-label="Choose a connector">
              {station.connectors.map((c) => {
                const ch = chargerOf(c.chargerId);
                const ok = !offline && canStartCharging(station, ch, c).ok;
                return (
                  <ConnectorCard
                    key={c.id}
                    connector={c}
                    tariff={station.tariffs.find((t) => t.id === c.tariffId)}
                    selectable={ok}
                    selected={selected === c.id}
                    onSelect={() => setSelected(c.id)}
                    chargerOnline={!offline && !!ch?.connected}
                    compatible={compatible(c.type)}
                  />
                );
              })}
            </div>
            {selConnector && selectedVehicle && !selectedVehicle.connectors.includes(selConnector.type) && (
              <Notice tone="warn" className="mt-3">
                Your {selectedVehicle.make} {selectedVehicle.model} doesn't list {selConnector.type}. Make sure your car or adapter supports it.
              </Notice>
            )}
            {offline && (
              <Notice tone="warn" className="mt-3">
                Charging is disabled in preview mode because live charger status can't be verified.
              </Notice>
            )}
          </div>
        </div>
      </Page>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom))] z-[800] border-t border-ax-border bg-white/95 px-4 pb-7 pt-3 backdrop-blur lg:bottom-0 lg:left-[248px] lg:pb-3">
        <div className="mx-auto flex max-w-[1100px] gap-2">
          <a href={directionsUrl(station.lat, station.lng)} target="_blank" rel="noreferrer" className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-ax-border bg-white text-[15px] font-semibold hover:bg-ax-surface sm:flex-none sm:px-8">
            <Navigation className="h-4 w-4" aria-hidden />
            Directions
          </a>
          <Button variant="charge" size="lg" className="flex-[1.6] sm:flex-1" disabled={!selConnector || (elig && !elig.ok) || offline} onClick={startCta} icon={<Zap className="h-4 w-4 fill-current" aria-hidden />}>
            {!selConnector ? 'Select a connector' : !signedInDriver ? 'Sign in to charge' : `Charge on -${selConnector.ocppConnectorId}`}
          </Button>
        </div>
        {user?.role === 'guest' && (
          <p className="mt-1.5 text-center text-[12px] text-ax-muted">
            Browsing as guest · <Link to="/signin" className="font-semibold text-ax-green-text">Sign in</Link> to start charging
          </p>
        )}
      </div>
    </div>
  );
}

export function Header({ title, onBack, action, dark }: { title: string; onBack: () => void; action?: React.ReactNode; dark?: boolean }) {
  return (
    <header className="flex h-16 items-center justify-between gap-3">
      <button type="button" onClick={onBack} aria-label="Back" className={cx('-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full', dark ? 'text-white hover:bg-white/10' : 'hover:bg-ax-surface')}>
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="flex-1 truncate text-center text-[16px] font-bold">{title}</h1>
      <div className="flex w-11 justify-end">{action}</div>
    </header>
  );
}
