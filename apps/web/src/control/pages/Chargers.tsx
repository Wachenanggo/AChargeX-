import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CONNECTOR_LABEL, type Charger, type Connector } from '@achargex/shared';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { Panel, PageHead, CtlBadge, Dot, th, td } from '../ui';
import { Segmented } from '../../ui';
import { timeAgo, cx } from '../../lib/format';

export interface ChargerRow extends Charger {
  live: { connected: boolean; version?: string; since?: string };
  station: { id: string; name: string; city: string; listingStatus: string };
  connectors: Connector[];
}

export default function Chargers() {
  const q = useApi<ChargerRow[]>('/api/control/chargers');
  const [f, setF] = useState<'all' | 'online' | 'offline' | 'faulted'>('all');
  const [text, setText] = useState('');
  useLive((e) => {
    if (e.type === 'connector') q.setData((l) => l?.map((c) => (c.id === e.connector.chargerId ? { ...c, connectors: c.connectors.map((k) => (k.id === e.connector.id ? e.connector : k)) } : c)));
    if (e.type === 'charger') q.setData((l) => l?.map((c) => (c.id === e.charger.id ? { ...c, ...e.charger, live: { ...c.live, connected: e.charger.connected } } : c)));
  });
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (q.data ?? []).filter((c) => {
      if (t && !`${c.ocppIdentity} ${c.station.name} ${c.vendor ?? ''} ${c.model ?? ''}`.toLowerCase().includes(t)) return false;
      if (f === 'online') return c.connected;
      if (f === 'offline') return !c.connected;
      if (f === 'faulted') return c.connectors.some((k) => k.status === 'Faulted');
      return true;
    });
  }, [q.data, f, text]);

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Chargers" sub={`${q.data?.length ?? 0} registered · ${(q.data ?? []).filter((c) => c.connected).length} connected`} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-0 basis-full items-center gap-2 rounded-[10px] border border-ctl-line bg-ctl-panel px-3 sm:basis-auto sm:flex-1 sm:max-w-xs">
          <Search className="h-4 w-4 text-ctl-sub" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Identity, station, model" aria-label="Search chargers" className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-ctl-sub" />
        </label>
        <Segmented dark label="Filter" value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }, { value: 'faulted', label: 'Faulted' }]} />
      </div>

      <Panel pad={false}>
        {/* table ≥ md */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-ctl-line">
                <th className={th}>Identity</th>
                <th className={th}>Station</th>
                <th className={th}>Connection</th>
                <th className={th}>Connectors</th>
                <th className={th}>Model</th>
                <th className={th}>Last heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ctl-line">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-ctl-raised/50">
                  <td className={td}>
                    <Link to={`/control/chargers/${c.ocppIdentity}`} className="num font-semibold text-white hover:text-ax-green">
                      {c.ocppIdentity}
                    </Link>
                    <div className="mt-0.5 flex gap-1">
                      {c.isSimulated && <CtlBadge tone="amber">SIM</CtlBadge>}
                      {!c.commissioned && <CtlBadge>not commissioned</CtlBadge>}
                    </div>
                  </td>
                  <td className={td}>
                    <div className="font-medium">{c.station.name}</div>
                    <div className="text-[11px] text-ctl-sub">{c.station.city}</div>
                  </td>
                  <td className={td}>
                    <CtlBadge tone={c.connected ? 'green' : 'red'}>{c.connected ? `online · ${c.live.version ?? c.ocppVersion ?? ''}` : 'offline'}</CtlBadge>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-2">
                      {c.connectors.map((k) => (
                        <span key={k.id} className="inline-flex items-center gap-1.5 text-[12px]" title={`${k.label}: ${k.status}`}>
                          <Dot status={k.status} online={c.connected} />
                          <span className="text-ctl-sub">
                            #{k.ocppConnectorId} {CONNECTOR_LABEL[k.type]}
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={cx(td, 'text-ctl-sub')}>{[c.vendor, c.model].filter(Boolean).join(' ') || '—'}</td>
                  <td className={cx(td, 'text-ctl-sub')}>{timeAgo(c.lastHeartbeatAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* cards < md */}
        <ul className="divide-y divide-ctl-line md:hidden">
          {rows.map((c) => (
            <li key={c.id}>
              <Link to={`/control/chargers/${c.ocppIdentity}`} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="num truncate font-semibold text-white">{c.ocppIdentity}</span>
                  <CtlBadge tone={c.connected ? 'green' : 'red'}>{c.connected ? 'online' : 'offline'}</CtlBadge>
                </div>
                <span className="truncate text-[12px] text-ctl-sub">
                  {c.station.name} · {c.live.version ? `OCPP ${c.live.version}` : 'OCPP —'} {c.isSimulated && '· SIM'}
                </span>
                <div className="flex flex-wrap gap-3">
                  {c.connectors.map((k) => (
                    <span key={k.id} className="inline-flex items-center gap-1.5 text-[12px] text-ctl-sub">
                      <Dot status={k.status} online={c.connected} />#{k.ocppConnectorId} {k.status}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="p-4 text-[13px] text-ctl-sub">{q.loading ? 'Loading…' : 'No chargers match.'}</p>}
      </Panel>
    </div>
  );
}
