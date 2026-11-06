import { Link } from 'react-router-dom';
import { AlertTriangle, Radio } from 'lucide-react';
import type { Alert, ChargingSession } from '@achargex/shared';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { Panel, Kpi, PageHead, CtlBadge, th, td } from '../ui';
import { Notice } from '../../ui';
import { formatPhp, kwh, kw, timeAgo, cx } from '../../lib/format';

interface OverviewData {
  stations: { total: number; approved: number; pending: number };
  chargers: { total: number; online: number; simulated: number };
  connectors: { available: number; charging: number; faulted: number; offline: number };
  sessions: { active: number; completed: number; energyKwh: number };
  alerts: number;
  unregistered: { identity: string; firstSeen: string; lastSeen: string; version?: string; vendor?: string; model?: string; connected: boolean }[];
}

export default function Overview() {
  const o = useApi<OverviewData>('/api/control/overview');
  const alerts = useApi<Alert[]>('/api/control/alerts');
  const sessions = useApi<ChargingSession[]>('/api/control/sessions');
  useLive((e) => {
    if (e.type === 'alert') alerts.setData((l) => [e.alert, ...(l ?? [])].slice(0, 200));
    if (e.type === 'session') sessions.setData((l) => (l?.some((s) => s.id === e.session.id) ? l.map((s) => (s.id === e.session.id ? e.session : s)) : [e.session, ...(l ?? [])]));
    if (e.type === 'connector' || e.type === 'charger' || e.type === 'session') throttledReload(o.reload);
  });

  const d = o.data;
  const c = d?.connectors;
  const total = c ? c.available + c.charging + c.faulted + c.offline : 0;
  const active = (sessions.data ?? []).filter((s) => ['starting', 'charging', 'stopping'].includes(s.state));
  const open = (alerts.data ?? []).filter((a) => !a.acknowledged);

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Network overview" sub={<span className="inline-flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-ax-green" /> Live via OCPP · updates in real time</span>} />
      {o.offline && <Notice dark tone="warn">OCPP service unreachable.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Chargers online" value={d ? `${d.chargers.online}/${d.chargers.total}` : '—'} sub={d ? `${d.chargers.simulated} simulated` : undefined} tone="green" />
        <Kpi label="Active sessions" value={d?.sessions.active ?? '—'} sub={d ? `${d.sessions.completed} completed` : undefined} />
        <Kpi label="Energy delivered" value={d ? `${d.sessions.energyKwh}` : '—'} sub="kWh, this runtime" />
        <Kpi label="Faulted connectors" value={c?.faulted ?? '—'} tone={c?.faulted ? 'red' : undefined} />
        <Kpi label="Open alerts" value={d?.alerts ?? '—'} tone={d?.alerts ? 'amber' : undefined} />
        <Kpi label="Pending approvals" value={d?.stations.pending ?? '—'} sub={d ? `${d.stations.approved} approved stations` : undefined} />
      </div>

      {c && total > 0 && (
        <Panel title="Connector states">
          <div className="flex h-3 overflow-hidden rounded-full bg-ctl-raised" role="img" aria-label={`${c.available} available, ${c.charging} in use, ${c.faulted} faulted, ${c.offline} offline`}>
            <span className="bg-ax-green" style={{ width: `${(c.available / total) * 100}%` }} />
            <span className="bg-[#C2413B]" style={{ width: `${(c.charging / total) * 100}%` }} />
            <span className="bg-ax-deal" style={{ width: `${(c.faulted / total) * 100}%` }} />
            <span className="bg-[#4B5B78]" style={{ width: `${(c.offline / total) * 100}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ctl-sub">
            {[
              ['#00BF80', 'Available', c.available],
              ['#C2413B', 'In use', c.charging],
              ['#F2B53A', 'Faulted', c.faulted],
              ['#4B5B78', 'Offline / unknown', c.offline],
            ].map(([col, l, n]) => (
              <span key={l as string} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: col as string }} /> {l} <span className="num font-semibold text-white">{n}</span>
              </span>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title={`Active sessions · ${active.length}`} pad={false} action={<Link to="/control/sessions" className="text-[12px] font-semibold text-ax-green">All</Link>}>
          {active.length === 0 ? (
            <p className="p-4 text-[13px] text-ctl-sub">No sessions in progress.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-ctl-line">
                    <th className={th}>Charger</th>
                    <th className={th}>State</th>
                    <th className={cx(th, 'text-right')}>Power</th>
                    <th className={cx(th, 'text-right')}>Energy</th>
                    <th className={cx(th, 'text-right')}>Cost / limit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ctl-line">
                  {active.map((s) => (
                    <tr key={s.id} className="hover:bg-ctl-raised/50">
                      <td className={td}>
                        <Link to={`/control/chargers/${s.chargerIdentity}`} className="num font-semibold hover:text-ax-green">
                          {s.chargerIdentity}
                        </Link>
                      </td>
                      <td className={td}>
                        <CtlBadge tone={s.state === 'charging' ? 'green' : 'blue'}>{s.state}</CtlBadge> {s.isSimulated && <CtlBadge tone="amber">SIM</CtlBadge>}
                      </td>
                      <td className={cx(td, 'num text-right')}>{kw(s.powerW)} kW</td>
                      <td className={cx(td, 'num text-right')}>{kwh(s.energyWh)} kWh</td>
                      <td className={cx(td, 'num text-right')}>
                        {formatPhp(s.costPhp)} <span className="text-ctl-sub">/ {formatPhp(s.limitPhp)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={`Alerts · ${open.length} open`} pad={false} action={<Link to="/control/alerts" className="text-[12px] font-semibold text-ax-green">All</Link>}>
          <ul className="divide-y divide-ctl-line">
            {open.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <AlertTriangle className={cx('mt-0.5 h-4 w-4 shrink-0', a.severity === 'critical' ? 'text-[#FF8F88]' : a.severity === 'warning' ? 'text-ax-deal' : 'text-ctl-sub')} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">{a.message}</p>
                  <p className="text-[11px] text-ctl-sub">
                    {a.chargerIdentity && <span className="num">{a.chargerIdentity} · </span>}
                    {timeAgo(a.at)}
                  </p>
                </div>
              </li>
            ))}
            {open.length === 0 && <li className="p-4 text-[13px] text-ctl-sub">No open alerts.</li>}
          </ul>
        </Panel>
      </div>

      {d && d.unregistered.length > 0 && (
        <Panel title="Unregistered chargers" pad={false}>
          <ul className="divide-y divide-ctl-line">
            {d.unregistered.map((u) => (
              <li key={u.identity} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <span className="num font-semibold">{u.identity}</span>
                <CtlBadge tone={u.connected ? 'green' : 'muted'}>{u.connected ? 'connected' : 'offline'}</CtlBadge>
                <span className="text-ctl-sub">
                  OCPP {u.version ?? '?'} · {[u.vendor, u.model].filter(Boolean).join(' ') || 'unknown model'} · first seen {timeAgo(u.firstSeen)}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-ctl-line px-4 py-2 text-[12px] text-ctl-sub">These chargers reached the CSMS without a registration. They can't be used for charging until an owner registers them.</p>
        </Panel>
      )}
    </div>
  );
}

let pending: ReturnType<typeof setTimeout> | null = null;
function throttledReload(fn: () => void) {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    fn();
  }, 1500);
}
