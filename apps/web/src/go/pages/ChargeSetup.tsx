import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Info, ShieldCheck, Check } from 'lucide-react';
import { LIMIT_OPTIONS, kwhForLimit, canStartCharging, CONNECTOR_LABEL, FULL_CHARGE_CAP_PHP, type ChargingSession } from '@achargex/shared';
import { Button, Card, DemoBadge, Notice, EmptyState } from '../../ui';
import { EmptyArt } from '../../assets/illustrations';
import { useGo } from '../data';
import { api, idempotencyKey } from '../../lib/api';
import { formatPhp, cx } from '../../lib/format';
import { Page } from '../GoLayout';
import { Header } from './StationDetails';

export default function ChargeSetup() {
  const { connectorId = '' } = useParams();
  const nav = useNavigate();
  const { stations, config, offline } = useGo();
  const station = stations.find((s) => s.connectors.some((c) => c.id === connectorId));
  const connector = station?.connectors.find((c) => c.id === connectorId);
  const charger = station?.chargers.find((c) => c.id === connector?.chargerId);
  const tariff = station?.tariffs.find((t) => t.id === connector?.tariffId);
  const providers = (config?.paymentProviders ?? []).filter((p) => p.enabled);
  // Demo payments are only allowed on simulated chargers.
  const usable = providers.filter((p) => (charger?.isSimulated ? true : !p.isDemo));

  const [limitId, setLimitId] = useState<(typeof LIMIT_OPTIONS)[number]['id']>('p500');
  const [provider, setProvider] = useState<string | undefined>(usable[0]?.id);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const key = useRef(idempotencyKey());

  const limit = LIMIT_OPTIONS.find((l) => l.id === limitId)!;
  const chosen = usable.find((p) => p.id === (provider ?? usable[0]?.id));
  const elig = useMemo(() => (station && connector ? canStartCharging(station, charger, connector) : { ok: false as const, reason: 'Connector not found' }), [station, charger, connector]);

  if (!station || !connector || !tariff) {
    return (
      <Page>
        <Header title="Charge setup" onBack={() => nav(-1)} />
        <EmptyState art={<EmptyArt kind="stations" />} title="Connector not found" action={<Button onClick={() => nav('/find')}>Find stations</Button>} />
      </Page>
    );
  }

  const start = async () => {
    setErr(undefined);
    setBusy(true);
    try {
      const s = await api<ChargingSession>('/api/sessions', {
        method: 'POST',
        body: { connectorId, limitPhp: limit.amountPhp, provider: chosen?.id, idempotencyKey: key.current },
      });
      nav(`/session/${s.id}`, { replace: true });
    } catch (x) {
      setErr((x as Error).message);
      key.current = idempotencyKey();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-[calc(110px+var(--nav-h)+var(--safe-bottom))] lg:pb-32">
      <Page>
        <Header title="Start charging" onBack={() => nav(-1)} />
        {/* step bar */}
        <ol className="mt-1 grid grid-cols-3 gap-2" aria-label="Steps">
          {['Connector', 'Limit & payment', 'Charging'].map((s, i) => (
            <li key={s} className="flex flex-col gap-1.5">
              <span className={cx('h-1.5 rounded-full', i <= 1 ? 'bg-ax-green' : 'bg-ax-border')} />
              <span className={cx('text-[11px] font-semibold', i === 1 ? 'text-ax-navy' : 'text-ax-muted')}>{s}</span>
            </li>
          ))}
        </ol>

        <h2 className="mt-5 text-[24px] font-extrabold tracking-[-0.5px]">Set your limit</h2>
        <p className="mt-1 text-[14px] text-ax-muted">Charging stops automatically when it's reached.</p>

        <Card className="mt-4 flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-[15px] font-semibold">
              {station.name} {charger?.isSimulated && <DemoBadge />}
            </p>
            <p className="num truncate text-[12px] text-ax-muted">
              {connector.label} · {CONNECTOR_LABEL[connector.type]} · {connector.powerKw} kW
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="num text-[18px] font-bold">{formatPhp(tariff.pricePerKwh)}</span>
            <span className="block text-[11px] text-ax-muted">/kWh</span>
          </p>
        </Card>

        {!elig.ok && (
          <Notice tone="error" className="mt-3" title="This connector can't start right now">
            {elig.reason}
          </Notice>
        )}

        <h3 className="eyebrow mt-6">Charging limit</h3>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Charging limit">
          {LIMIT_OPTIONS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={limitId === l.id}
              onClick={() => setLimitId(l.id)}
              className={cx('flex flex-col items-center gap-1 rounded-[16px] border p-3.5 transition-colors', limitId === l.id ? 'border-ax-navy bg-ax-navy text-white' : 'border-ax-border bg-white hover:border-ax-green')}
            >
              <span className={cx('text-[18px] font-bold', l.id !== 'full' && 'num')}>{l.label}</span>
              <span className={cx('text-[11px]', limitId === l.id ? 'text-ax-navy-sub' : 'text-ax-muted')}>
                {l.id === 'full' ? `up to ${formatPhp(FULL_CHARGE_CAP_PHP).replace('.00', '')}` : `~${Math.round(kwhForLimit(l.amountPhp, tariff.pricePerKwh))} kWh`}
              </span>
            </button>
          ))}
        </div>

        <h3 className="eyebrow mt-6">Pay with</h3>
        <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Payment method">
          {usable.length === 0 && (
            <Notice tone="warn" title="No payment method available">
              {charger?.isSimulated ? 'The service has no payment providers enabled.' : 'Live chargers need a real payment provider (GCash, Maya or card). None is configured yet.'}
            </Notice>
          )}
          {usable.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={chosen?.id === p.id}
              onClick={() => setProvider(p.id)}
              className={cx('flex items-center gap-3 rounded-[16px] border bg-white p-3.5 text-left', chosen?.id === p.id ? "border-ax-green ring-2 ring-ax-green/25" : "border-ax-border")}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-ax-navy text-[12px] font-bold text-white">{p.short}</span>
              <span className="flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  {p.name} {p.isDemo && <DemoBadge />}
                </span>
                <span className="text-[12px] text-ax-muted">{p.isDemo ? 'Simulated hold — no real money moves' : 'Secure provider checkout'}</span>
              </span>
              <span className={cx('flex h-5 w-5 items-center justify-center rounded-full border-2', chosen?.id === p.id ? "border-ax-green bg-ax-green" : "border-ax-border")}>
                {chosen?.id === p.id && <Check className="h-3 w-3 text-ax-navy" strokeWidth={3} />}
              </span>
            </button>
          ))}
          <p className="text-[12px] text-ax-muted">GCash, Maya, cards and QR Ph appear here once the operator enables them.</p>
        </div>

        <div className="mt-5 flex gap-2.5 rounded-[16px] bg-ax-surface p-3.5 text-[13px] leading-relaxed text-ax-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ax-navy" aria-hidden />
          <span>
            We place a <strong className="text-ax-navy">{formatPhp(limit.amountPhp)}</strong> hold. You're only charged for energy delivered, measured by the charger's meter; the unused amount is released after the session ends.
          </span>
        </div>
        <label className="mt-3 flex items-start gap-3 text-[13px] text-ax-muted">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#00BF80]" />
          <span>I've plugged in my vehicle and agree to the hold and the station's tariff{station.tariffs.some((t) => t.idleFeePerMin) ? ', including overstay fees' : ''}.</span>
        </label>
        {err && (
          <Notice tone="error" className="mt-3">
            {err}
          </Notice>
        )}
        {offline && (
          <Notice tone="warn" className="mt-3">
            The service is unreachable. Charging can't start in preview mode.
          </Notice>
        )}
      </Page>

      <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom))] z-[800] border-t border-ax-border bg-white/95 px-4 pb-7 pt-3 backdrop-blur lg:bottom-0 lg:left-[248px] lg:pb-3">
        <div className="mx-auto max-w-[680px]">
          <Button variant="charge" size="lg" block loading={busy} disabled={!elig.ok || !chosen || !agree || offline} onClick={start} icon={<ShieldCheck className="h-5 w-5" aria-hidden />}>
            Authorize {formatPhp(limit.amountPhp).replace('.00', '')} & start
          </Button>
        </div>
      </div>
    </div>
  );
}
