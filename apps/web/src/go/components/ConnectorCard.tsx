import { CheckCircle2 } from 'lucide-react';
import { connectorTone, CONNECTOR_LABEL, type Connector, type Tariff } from '@achargex/shared';
import { StatusBadge } from '../../ui';
import { ConnectorIcon } from '../../assets/illustrations';
import { cx, formatPhp } from '../../lib/format';

export function ConnectorCard({
  connector,
  tariff,
  selectable,
  selected,
  onSelect,
  chargerOnline,
  compatible,
}: {
  connector: Connector;
  tariff?: Tariff;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  chargerOnline: boolean;
  compatible?: boolean;
}) {
  const tone = chargerOnline ? connectorTone(connector.status) : 'offline';
  const subtitle =
    tone === 'busy'
      ? connector.etaFreeMin
        ? `~${connector.etaFreeMin} min left`
        : 'In use'
      : tone === 'fault'
        ? "Can't start here"
        : tone === 'offline'
          ? 'Charger offline'
          : tone === 'reserved'
            ? 'Reserved'
            : tone === 'unknown'
              ? 'Status unknown'
              : compatible === false
                ? 'Not compatible with your car'
                : 'Ready to charge';
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!selectable}
      aria-pressed={selected}
      className={cx(
        'flex w-full items-center gap-3 rounded-[18px] border bg-white p-3.5 text-left transition-all',
        selected ? 'border-ax-green ring-2 ring-ax-green/30' : 'border-ax-border',
        selectable ? 'hover:border-ax-green' : 'cursor-not-allowed opacity-70',
      )}
    >
      <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]', tone === 'available' ? 'bg-ax-mint' : 'bg-ax-surface')}>
        <ConnectorIcon type={connector.type} size={30} color={tone === 'available' ? '#007A55' : '#5E6F86'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={tone} />
          <span className="text-[12px] text-ax-muted">{subtitle}</span>
        </span>
        <span className="num truncate text-[12px] text-ax-muted">{connector.label}</span>
        <span className="text-[15px] font-semibold">
          {CONNECTOR_LABEL[connector.type]} · {connector.current} · {connector.powerKw} kW
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {tariff && (
          <span className="text-right">
            <span className="num block text-[16px] font-bold">{formatPhp(tariff.pricePerKwh)}</span>
            <span className="text-[11px] text-ax-muted">/kWh</span>
          </span>
        )}
        {selected && <CheckCircle2 className="h-5 w-5 fill-ax-green text-white" aria-label="Selected" />}
      </span>
    </button>
  );
}
