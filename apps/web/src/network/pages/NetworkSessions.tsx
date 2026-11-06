import type { ChargingSession } from '@achargex/shared';
import { Card, EmptyState, Skeleton, DemoBadge } from '../../ui';
import { EmptyArt } from '../../assets/illustrations';
import { useApi } from '../../lib/hooks';
import { dateTime, formatPhp, kwh } from '../../lib/format';
import { useMyStations } from './Dashboard';

export default function NetworkSessions() {
  const q = useApi<Omit<ChargingSession, 'userId'>[]>('/api/network/sessions');
  const st = useMyStations();
  const name = (id: string) => st.data?.find((s) => s.id === id)?.name ?? id;
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.6px]">Session records</h1>
      <p className="mt-1 text-[14px] text-ax-muted">Sessions at your stations. Driver identities are not shared with owners.</p>
      {q.loading ? (
        <Skeleton className="mt-4 h-40" />
      ) : !q.data?.length ? (
        <EmptyState art={<EmptyArt kind="sessions" />} title="No sessions yet" />
      ) : (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-ax-surface text-[11px] uppercase tracking-[1.2px] text-ax-muted">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Station</th>
                <th className="px-4 py-3">Charger</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3 text-right">Energy</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ax-border">
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">{dateTime(s.startedAt ?? s.createdAt)}</td>
                  <td className="px-4 py-3 font-semibold">{name(s.stationId)}</td>
                  <td className="num px-4 py-3">{s.chargerIdentity}</td>
                  <td className="px-4 py-3">
                    {s.state} {s.isSimulated && <DemoBadge className="ml-1" />}
                  </td>
                  <td className="num px-4 py-3 text-right">{kwh(s.energyWh)} kWh</td>
                  <td className="num px-4 py-3 text-right">{formatPhp(s.costPhp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
