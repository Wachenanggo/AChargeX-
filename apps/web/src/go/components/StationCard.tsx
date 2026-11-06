import { Link } from 'react-router-dom';
import { Zap, ChevronRight, Tag } from 'lucide-react';
import type { StationWithDetail } from '@achargex/shared';
import { DemoBadge, Stat } from '../../ui';
import { cx, fmtKm, formatPhp } from '../../lib/format';
import type { StationSummary } from './station-utils';

export function availabilityText(sum: StationSummary, offline: boolean) {
  if (offline) return { text: 'Not live', cls: 'text-ax-muted' };
  if (sum.allOffline) return { text: 'Offline', cls: 'text-ax-muted' };
  return { text: `${sum.available} of ${sum.total}`, cls: sum.available > 0 ? 'text-ax-green-text' : 'text-ax-busy' };
}

/** Compact station card used in lists and the selected-station sheet. */
export function StationCard({
  station,
  sum,
  offline,
  compact,
  onSelect,
  selected,
  to,
}: {
  station: StationWithDetail;
  sum: StationSummary;
  offline: boolean;
  compact?: boolean;
  onSelect?: () => void;
  selected?: boolean;
  to?: string;
}) {
  const av = availabilityText(sum, offline);
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]', sum.tone === 'available' && !offline ? 'bg-ax-mint' : 'bg-ax-surface')}>
          <Zap className={cx('h-[22px] w-[22px]', sum.tone === 'available' && !offline ? 'fill-ax-green-text text-ax-green-text' : 'fill-ax-muted text-ax-muted')} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[16px] font-bold">{station.name}</span>
            {station.deal && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-ax-deal-bg px-1.5 py-0.5 text-[10px] font-bold text-ax-deal-text">
                <Tag className="h-3 w-3" aria-hidden />
                DEAL
              </span>
            )}
          </span>
          <span className="truncate text-[13px] text-ax-muted">
            {station.address}, {station.city}
            {sum.distance !== undefined && ` · ${fmtKm(sum.distance)}`}
          </span>
        </span>
        {to && <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-ax-muted" aria-hidden />}
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ax-border pt-3">
          <Stat label="Price/kWh" value={sum.minPrice ? formatPhp(sum.minPrice) : '—'} />
          <Stat label="Available" value={<span className={av.cls}>{av.text}</span>} mono={false} />
          <Stat label="Output" value={`${sum.hasDc ? 'DC' : 'AC'} ${sum.maxKw}kW`} mono={false} />
        </div>
      )}
      {station.isDemo && (
        <div className="mt-2 flex items-center gap-2">
          <DemoBadge />
          <span className="text-[11px] text-ax-muted">Demo station · simulated charger</span>
        </div>
      )}
    </>
  );
  const cls = cx('block w-full rounded-[20px] border bg-white p-4 text-left transition-shadow hover:shadow-card', selected ? 'border-ax-green ring-2 ring-ax-green/30' : 'border-ax-border');
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return (
    <button type="button" onClick={onSelect} className={cls} aria-pressed={selected}>
      {inner}
    </button>
  );
}
