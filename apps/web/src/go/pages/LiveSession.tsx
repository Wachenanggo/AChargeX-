import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronDown, Headset, Info, X, Zap, CheckCircle2, AlertTriangle, Printer, Loader2 } from 'lucide-react';
import { CONNECTOR_LABEL, type ChargingSession, type Connector, type PaymentTransaction } from '@achargex/shared';
import { Logo, Button, DemoBadge, ConfirmDialog, Notice } from '../../ui';
import { api } from '../../lib/api';
import { useLive } from '../../lib/live';
import { useNow } from '../../lib/hooks';
import { duration, formatPhp, kwh, kw, dateTime, cx } from '../../lib/format';
import { ProgressRing } from '../components/ProgressRing';

interface Detail {
  session: ChargingSession;
  payment?: PaymentTransaction;
  station?: { id: string; name: string; address: string; city: string };
  connector?: Connector;
}

export default function LiveSession() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Detail>();
  const [err, setErr] = useState<string>();
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const now = useNow(1000);

  const load = () =>
    api<Detail>(`/api/sessions/${id}`)
      .then((x) => {
        setD(x);
        setErr(undefined);
      })
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000); // fallback if SSE drops
    return () => clearInterval(t);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLive((e) => {
    if (e.type === 'session' && e.session.id === id) setD((x) => (x ? { ...x, session: e.session } : x));
    if (e.type === 'payment' && e.payment.sessionId === id) setD((x) => (x ? { ...x, payment: e.payment } : x));
  });

  const s = d?.session;
  if (!s) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ax-navy-sub">
          {err ? (
            <>
              <AlertTriangle className="h-8 w-8 text-ax-deal" />
              <p>{err}</p>
              <Button variant="dark" onClick={() => nav('/')}>
                Go home
              </Button>
            </>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-ax-green" />
          )}
        </div>
      </Shell>
    );
  }

  if (s.state === 'completed') return <Receipt d={d!} />;

  const stop = async () => {
    setStopping(true);
    try {
      const r = await api<ChargingSession>(`/api/sessions/${id}/stop`, { method: 'POST' });
      setD((x) => (x ? { ...x, session: r } : x));
      setConfirmStop(false);
    } catch (e) {
      setErr((e as Error).message);
      setConfirmStop(false);
    } finally {
      setStopping(false);
    }
  };

  const elapsed = s.startedAt ? now - new Date(s.startedAt).getTime() : 0;
  const frac = s.limitPhp ? s.costPhp / s.limitPhp : 0;
  const failed = s.state === 'failed' || s.state === 'cancelled';
  const waiting = s.state === 'authorizing' || s.state === 'authorized' || s.state === 'starting';

  return (
    <Shell>
      <div className="mx-4 flex items-start justify-between rounded-[16px] bg-ax-navy-card px-4 py-3.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cx('text-[11px] font-bold tracking-[1.4px]', failed ? 'text-ax-deal' : 'text-ax-green')}>
            {waiting ? 'CONNECTING TO CHARGER' : s.state === 'charging' ? 'CHARGING IN PROGRESS' : s.state === 'stopping' ? 'STOPPING' : failed ? 'SESSION NOT STARTED' : s.state.toUpperCase()}
          </span>
          <span className="truncate text-[16px] font-semibold">{d?.station?.name}</span>
          <span className="num truncate text-[12px] text-ax-navy-sub">
            {d?.connector?.label} · {d?.connector && CONNECTOR_LABEL[d.connector.type]}
          </span>
        </span>
        {s.isSimulated && <DemoBadge dark />}
      </div>

      {failed ? (
        <div className="mx-4 mt-8 flex flex-1 flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ax-navy-card">
            <AlertTriangle className="h-8 w-8 text-ax-deal" />
          </span>
          <h1 className="mt-4 text-[22px] font-bold">{s.state === 'cancelled' ? 'Session cancelled' : "Charging didn't start"}</h1>
          <p className="mt-2 max-w-xs text-[14px] text-ax-navy-sub">{s.error}</p>
          {d?.payment && (
            <p className="mt-4 rounded-[12px] bg-ax-navy-card px-4 py-3 text-[13px] text-ax-navy-sub">
              Hold of <span className="num font-semibold text-white">{formatPhp(d.payment.holdAmount)}</span> {d.payment.state === 'voided' ? 'released — you were not charged.' : `status: ${d.payment.state}`}
            </p>
          )}
          <div className="mt-auto flex w-full gap-2 pb-6 pt-6">
            <Button variant="dark" size="lg" block onClick={() => nav('/')}>
              Home
            </Button>
            {d?.station && (
              <Button variant="charge" size="lg" block onClick={() => nav(`/station/${d.station!.id}`)}>
                Try again
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-center py-3">
            <ProgressRing fraction={waiting ? 0 : frac} size={290} label={waiting ? 'Waiting for charger' : `${Math.round(frac * 100)} percent of the ${formatPhp(s.limitPhp)} limit used`}>
              {waiting ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-ax-green" aria-hidden />
                  <span className="mt-2 max-w-[170px] text-center text-[13px] text-ax-navy-sub">Waiting for the charger to confirm. Make sure the cable is plugged in.</span>
                </>
              ) : (
                <>
                  <Zap className="h-[22px] w-[22px] fill-ax-green text-ax-green" aria-hidden />
                  <span className="num text-[44px] font-bold tracking-[-1px]" aria-live="polite">
                    {kwh(s.energyWh)}
                  </span>
                  <span className="text-[13px] font-medium text-ax-navy-sub">kWh delivered</span>
                </>
              )}
            </ProgressRing>
          </div>

          <div className="mx-4 flex flex-col gap-2.5 rounded-[20px] bg-ax-navy-card p-3.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[15px] font-semibold">
                {s.state === 'charging' ? (
                  <>
                    Charging at <span className="text-ax-green">{kw(s.powerW)} kW</span>
                  </>
                ) : s.state === 'stopping' ? (
                  'Waiting for final meter reading…'
                ) : (
                  'Preparing…'
                )}
              </span>
              <span className="num text-[15px] text-[#DCE4EF]">{duration(elapsed)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1 rounded-[14px] bg-ax-navy-deep p-3">
                <span className="text-[10px] font-semibold tracking-[1.3px] text-ax-navy-sub">ESTIMATED COST</span>
                <span className="num text-[22px] font-bold">{formatPhp(s.costPhp)}</span>
              </div>
              <div className="flex flex-col gap-1 rounded-[14px] bg-ax-navy-deep p-3">
                <span className="text-[10px] font-semibold tracking-[1.3px] text-ax-navy-sub">SPENDING LIMIT</span>
                <span className="num text-[22px] font-bold">{formatPhp(s.limitPhp)}</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-0.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ax-navy-sub" aria-hidden />
              <span className="text-[12px] leading-relaxed text-ax-navy-sub">
                Stops automatically at {formatPhp(s.limitPhp)}. Final total is confirmed by the charger after you stop.
                {s.isSimulated && ' Simulated session — energy is generated by the AChargeX simulator, no real charger is controlled.'}
              </span>
            </div>
          </div>
          {(s.error || err) && (
            <div className="mx-4 mt-3">
              <Notice dark tone="warn">
                {s.error ?? err}
              </Notice>
            </div>
          )}

          <div className="mt-auto px-4 pb-7 pt-4">
            <Button variant="dark" size="lg" block onClick={() => setConfirmStop(true)} disabled={s.state === 'stopping'} loading={s.state === 'stopping'} icon={<X className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden />}>
              {waiting ? 'Cancel' : s.state === 'stopping' ? 'Stopping…' : 'Stop charging'}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmStop}
        dark
        title={waiting ? 'Cancel this session?' : 'Stop charging?'}
        body={waiting ? 'The hold will be released and the charger will not start.' : `You'll be charged for ${kwh(s.energyWh)} kWh so far (about ${formatPhp(s.costPhp)}). Unplug after the charger confirms.`}
        confirmLabel={waiting ? 'Cancel session' : 'Stop charging'}
        danger
        busy={stopping}
        onCancel={() => setConfirmStop(false)}
        onConfirm={stop}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="flex min-h-dvh justify-center bg-ax-navy-deep text-white">
      <div className="flex min-h-dvh w-full max-w-[520px] flex-col pt-safe" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <div className="flex h-16 items-center justify-between px-3">
          <button type="button" aria-label="Minimize" onClick={() => nav('/')} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10">
            <ChevronDown className="h-[22px] w-[22px]" strokeWidth={2.2} />
          </button>
          <Logo dark />
          <Link to="/account#support" aria-label="Support" className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-ax-navy">
            <Headset className="h-5 w-5" />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

function Receipt({ d }: { d: Detail }) {
  const s = d.session;
  const nav = useNavigate();
  const ms = s.startedAt && s.stoppedAt ? new Date(s.stoppedAt).getTime() - new Date(s.startedAt).getTime() : 0;
  const charged = d.payment?.capturedAmount ?? s.costPhp;
  const released = d.payment ? Math.max(0, d.payment.holdAmount - charged) : 0;
  return (
    <div className="flex min-h-dvh justify-center bg-ax-bg">
      <div className="flex w-full max-w-[520px] flex-col px-4 pb-8 pt-safe">
        <div className="flex h-16 items-center justify-center print:hidden">
          <Logo />
        </div>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ax-mint">
            <CheckCircle2 className="h-9 w-9 text-ax-green-text" aria-hidden />
          </span>
          <h1 className="mt-3 text-[24px] font-extrabold tracking-[-0.5px]">Charging complete</h1>
          <p className="mt-1 text-[14px] text-ax-muted">You can unplug your vehicle.</p>
        </div>

        <section className="relative mt-6 overflow-hidden rounded-[22px] border border-ax-border bg-white" aria-label="Receipt">
          {s.isSimulated && (
            <div className="bg-ax-navy px-4 py-2 text-center text-[11px] font-bold tracking-[1.2px] text-white">DEMO RECEIPT · NO REAL PAYMENT WAS MADE</div>
          )}
          <div className="p-5">
            <p className="eyebrow">Total charged</p>
            <p className="num mt-1 text-[36px] font-bold">{formatPhp(charged)}</p>
            <div className="mt-4 grid grid-cols-3 gap-3 border-y border-dashed border-ax-border py-4">
              <div>
                <p className="eyebrow">Energy</p>
                <p className="num mt-0.5 text-[16px] font-bold">{kwh(s.energyWh)} kWh</p>
              </div>
              <div>
                <p className="eyebrow">Duration</p>
                <p className="num mt-0.5 text-[16px] font-bold">{duration(ms)}</p>
              </div>
              <div>
                <p className="eyebrow">Rate</p>
                <p className="num mt-0.5 text-[16px] font-bold">{formatPhp(s.pricePerKwh)}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">
              <dt className="text-ax-muted">Station</dt>
              <dd className="text-right font-semibold">{d.station?.name}</dd>
              <dt className="text-ax-muted">Connector</dt>
              <dd className="num text-right">{d.connector?.label}</dd>
              <dt className="text-ax-muted">Started</dt>
              <dd className="text-right">{dateTime(s.startedAt)}</dd>
              <dt className="text-ax-muted">Ended</dt>
              <dd className="text-right">{dateTime(s.stoppedAt)}</dd>
              <dt className="text-ax-muted">Stop reason</dt>
              <dd className="text-right">{s.stopReason === 'LimitReached' ? 'Limit reached' : s.stopReason === 'Remote' ? 'Stopped in app' : s.stopReason ?? '—'}</dd>
              <dt className="text-ax-muted">Meter</dt>
              <dd className="num text-right text-[12px]">
                {s.meterStartWh?.toLocaleString()} → {s.meterStopWh?.toLocaleString()} Wh
              </dd>
              <dt className="text-ax-muted">Hold</dt>
              <dd className="num text-right">{d.payment ? formatPhp(d.payment.holdAmount) : '—'}</dd>
              <dt className="text-ax-muted">Released</dt>
              <dd className="num text-right text-ax-green-text">{formatPhp(released)}</dd>
              <dt className="text-ax-muted">Payment</dt>
              <dd className="text-right">
                {d.payment?.provider === 'demo' ? 'Demo wallet' : d.payment?.provider} · {d.payment?.state}
              </dd>
              <dt className="text-ax-muted">Reference</dt>
              <dd className="num truncate text-right text-[11px]">{s.id.slice(0, 18)}</dd>
            </dl>
          </div>
        </section>
        <div className="mt-6 flex gap-2 print:hidden">
          <Button variant="secondary" size="lg" block onClick={() => window.print()} icon={<Printer className="h-4 w-4" aria-hidden />}>
            Print / PDF
          </Button>
          <Button size="lg" block onClick={() => nav('/')}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
