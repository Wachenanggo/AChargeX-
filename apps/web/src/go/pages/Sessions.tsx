import { Link } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';
import { can, type ChargingSession } from '@achargex/shared';
import { Card, DemoBadge, EmptyState, ButtonLink, Skeleton, StatusBadge } from '../../ui';
import { EmptyArt } from '../../assets/illustrations';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { useAuth } from '../../auth/AuthProvider';
import { useGo } from '../data';
import { Page } from '../GoLayout';
import { dateTime, formatPhp, kwh } from '../../lib/format';

const STATE_TONE: Record<ChargingSession['state'], { tone: 'available' | 'busy' | 'offline' | 'fault' | 'reserved'; label: string }> = {
  created: { tone: 'offline', label: 'Created' },
  authorizing: { tone: 'reserved', label: 'Authorizing' },
  authorized: { tone: 'reserved', label: 'Authorized' },
  starting: { tone: 'reserved', label: 'Starting' },
  charging: { tone: 'available', label: 'Charging' },
  stopping: { tone: 'reserved', label: 'Stopping' },
  completed: { tone: 'offline', label: 'Completed' },
  failed: { tone: 'fault', label: 'Failed' },
  cancelled: { tone: 'offline', label: 'Cancelled' },
};

export default function Sessions() {
  const { user } = useAuth();
  const { stations, offline } = useGo();
  const allowed = !!user && can(user.role, 'sessions:own') && !offline;
  const q = useApi<ChargingSession[]>(allowed ? '/api/sessions' : null, [user?.id]);
  useLive((e) => {
    if (e.type === 'session' && e.session.userId === user?.id) q.setData((l) => (l?.some((s) => s.id === e.session.id) ? l.map((s) => (s.id === e.session.id ? e.session : s)) : [e.session, ...(l ?? [])]));
  });

  return (
    <Page>
      <h1 className="pt-6 text-[26px] font-extrabold tracking-[-0.6px] lg:pt-8">Sessions</h1>
      <p className="mt-1 text-[14px] text-ax-muted">Your charging history and receipts.</p>
      {!allowed ? (
        <EmptyState art={<EmptyArt kind="sessions" />} title={offline ? 'Unavailable offline' : 'Sign in to see sessions'} action={!offline && <ButtonLink to="/signin?next=/sessions">Sign in</ButtonLink>} />
      ) : q.loading ? (
        <div className="mt-5 flex flex-col gap-2">
          {[0, 1, 2].map((k) => (
            <Skeleton key={k} className="h-[72px]" />
          ))}
        </div>
      ) : !q.data?.length ? (
        <EmptyState art={<EmptyArt kind="sessions" />} title="No sessions yet" action={<ButtonLink to="/find" variant="charge">Find a charger</ButtonLink>}>
          Your charging sessions and receipts will appear here.
        </EmptyState>
      ) : (
        <Card className="mt-5 divide-y divide-ax-border">
          {q.data.map((s) => {
            const st = stations.find((x) => x.id === s.stationId);
            const t = STATE_TONE[s.state];
            return (
              <Link key={s.id} to={`/session/${s.id}`} className="flex items-center gap-3 p-4 hover:bg-ax-bg">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-ax-mint">
                  <Zap className="h-5 w-5 fill-ax-green-text text-ax-green-text" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{st?.name ?? 'Charging session'}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ax-muted">
                    <StatusBadge tone={t.tone} label={t.label} />
                    {dateTime(s.createdAt)} · {kwh(s.energyWh)} kWh
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="num text-[15px] font-bold">{formatPhp(s.costPhp)}</span>
                  {s.isSimulated && <DemoBadge />}
                </span>
                <ChevronRight className="h-4 w-4 text-ax-muted" aria-hidden />
              </Link>
            );
          })}
        </Card>
      )}
    </Page>
  );
}
