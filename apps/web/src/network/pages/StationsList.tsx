import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ButtonLink, Card, EmptyState, Skeleton, StatusBadge } from '../../ui';
import { StationArt } from '../../assets/illustrations';
import { ListingBadge } from '../shared';
import { useMyStations } from './Dashboard';

export default function StationsList() {
  const q = useMyStations();
  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.6px]">Stations</h1>
        <ButtonLink to="/network/stations/new" size="sm" icon={<Plus className="h-4 w-4" />}>
          Add
        </ButtonLink>
      </div>
      {q.loading ? (
        <Skeleton className="mt-4 h-40" />
      ) : !q.data?.length ? (
        <EmptyState art={<StationArt width={140} />} title="No stations yet" action={<ButtonLink to="/network/stations/new">Register a station</ButtonLink>} />
      ) : (
        <Card className="mt-4 overflow-hidden">
          <table className="hidden w-full text-left text-[14px] md:table">
            <thead className="bg-ax-surface text-[11px] uppercase tracking-[1.2px] text-ax-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Station</th>
                <th className="px-4 py-3 font-semibold">Listing</th>
                <th className="px-4 py-3 font-semibold">Chargers</th>
                <th className="px-4 py-3 font-semibold">Connectors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ax-border">
              {q.data.map((s) => (
                <tr key={s.id} className="hover:bg-ax-bg">
                  <td className="px-4 py-3">
                    <Link to={`/network/stations/${s.id}`} className="font-semibold hover:text-ax-green-text">
                      {s.name}
                    </Link>
                    <div className="text-[12px] text-ax-muted">{s.city}</div>
                  </td>
                  <td className="px-4 py-3">
                    <ListingBadge status={s.listingStatus} />
                  </td>
                  <td className="px-4 py-3 text-ax-muted">
                    {s.chargers.filter((c) => c.connected).length}/{s.chargers.length} online
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.connectors.map((c) => (
                        <StatusBadge key={c.id} status={c.status} label={c.label.split('-').pop()} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-ax-border md:hidden">
            {q.data.map((s) => (
              <li key={s.id}>
                <Link to={`/network/stations/${s.id}`} className="flex flex-col gap-1.5 p-4">
                  <span className="text-[15px] font-semibold">{s.name}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[12px] text-ax-muted">
                    <ListingBadge status={s.listingStatus} />
                    {s.chargers.filter((c) => c.connected).length}/{s.chargers.length} chargers online
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
