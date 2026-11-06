import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, Check, Circle, Download, Printer, QrCode as QrIcon, RotateCcw, Ban, Wifi, WifiOff, Send } from 'lucide-react';
import { CONNECTOR_LABEL, can, type StationWithDetail, type QrCode as Qr, type Charger } from '@achargex/shared';
import { Button, Card, Notice, Skeleton, StatusBadge, ConfirmDialog, SectionTitle, DemoBadge, Input, Sheet } from '../../ui';
import { api } from '../../lib/api';
import { useApi, useNow } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { useAuth } from '../../auth/AuthProvider';
import { CopyField, ListingBadge, type ConnectionCard } from '../shared';
import { cx, timeAgo, formatPhp } from '../../lib/format';

type QrWithUrl = Qr & { url: string; reused?: boolean };

export default function StationManage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const now = useNow(10_000);
  const st = useApi<StationWithDetail>(`/api/stations/${id}`);
  const qrs = useApi<QrWithUrl[]>(`/api/stations/${id}/qr`);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<QrWithUrl | null>(null);
  const [cred, setCred] = useState<ConnectionCard | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});

  useLive((e) => {
    if (e.type === 'station' && e.station.id === id) st.setData(() => e.station);
    if (e.type === 'connector' && e.stationId === id) st.setData((s) => s && { ...s, connectors: s.connectors.map((c) => (c.id === e.connector.id ? e.connector : c)) });
    if (e.type === 'charger' && e.stationId === id) st.setData((s) => s && { ...s, chargers: s.chargers.map((c) => (c.id === e.charger.id ? e.charger : c)) });
  });

  const s = st.data;
  if (st.loading && !s) return <Skeleton className="h-64" />;
  if (!s) return <Notice tone="error">{st.error?.message ?? 'Station not found'}</Notice>;

  const isAdmin = !!user && can(user.role, 'admin:approve_stations');
  const transition = async (to: string) => {
    setErr(undefined);
    setBusy(true);
    try {
      const r = await api<StationWithDetail>(`/api/stations/${id}/status`, { method: 'POST', body: { to } });
      st.setData(() => r);
    } catch (e) {
      setErr((e as Error).message);
      st.reload();
    } finally {
      setBusy(false);
    }
  };

  const genQr = async (connectorId?: string) => {
    setErr(undefined);
    try {
      await api(`/api/stations/${id}/qr`, { method: 'POST', body: { connectorId } });
      qrs.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const savePrices = async () => {
    setErr(undefined);
    try {
      const r = await api<StationWithDetail>(`/api/stations/${id}`, { method: 'PATCH', body: { tariffs: Object.entries(prices).map(([tid, p]) => ({ id: tid, pricePerKwh: Number(p) })) } });
      st.setData(() => r);
      setPrices({});
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const anyConnected = s.chargers.some((c) => c.connected);
  const allCommissioned = s.chargers.every((c) => c.commissioned);
  const checklist = [
    { label: 'Station details and location', done: true },
    { label: 'Submitted for review', done: s.listingStatus !== 'draft' && s.listingStatus !== 'rejected' },
    { label: 'Approved by AChargeX', done: s.listingStatus === 'approved' },
    { label: 'Charger connected over OCPP (BootNotification verified)', done: anyConnected },
    { label: 'Chargers commissioned — live charging enabled', done: allCommissioned && s.listingStatus === 'approved' },
  ];

  return (
    <>
      <Link to="/network/stations" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ax-muted hover:text-ax-navy">
        <ArrowLeft className="h-4 w-4" /> Stations
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px]">{s.name}</h1>
          <p className="text-[14px] text-ax-muted">
            {s.address}, {s.city} · {s.openingHours}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <ListingBadge status={s.listingStatus} />
            {s.isDemo && <DemoBadge />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(s.listingStatus === 'draft' || s.listingStatus === 'rejected') && (
            <Button loading={busy} icon={<Send className="h-4 w-4" />} onClick={() => transition(s.listingStatus === 'rejected' ? 'draft' : 'pending')}>
              {s.listingStatus === 'rejected' ? 'Reopen as draft' : 'Submit for review'}
            </Button>
          )}
          {s.listingStatus === 'pending' && (
            <Button variant="secondary" loading={busy} onClick={() => transition('draft')}>
              Withdraw submission
            </Button>
          )}
          {isAdmin && s.listingStatus === 'pending' && (
            <Link to="/control/approvals" className="inline-flex h-12 items-center rounded-full bg-ax-green px-5 text-[15px] font-semibold text-ax-navy">
              Review in Control
            </Link>
          )}
        </div>
      </div>
      {err && <Notice tone="error" className="mt-4">{err}</Notice>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* chargers + connect card */}
          <section>
            <SectionTitle>Chargers & connectors</SectionTitle>
            <div className="mt-3 flex flex-col gap-3">
              {s.chargers.map((c) => (
                <ChargerBlock
                  key={c.id}
                  charger={c}
                  station={s}
                  now={now}
                  onRotate={async () => {
                    try {
                      setCred(await api<ConnectionCard>(`/api/stations/${id}/chargers/${c.id}/rotate-password`, { method: 'POST' }));
                    } catch (e) {
                      setErr((e as Error).message);
                    }
                  }}
                />
              ))}
            </div>
          </section>

          {/* QR */}
          <section>
            <SectionTitle
              action={
                qrs.data?.length ? (
                  <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => printLabels(s, qrs.data!.filter((q) => !q.revokedAt))}>
                    Print labels
                  </Button>
                ) : undefined
              }
            >
              QR labels
            </SectionTitle>
            {s.listingStatus !== 'approved' ? (
              <Notice className="mt-3">QR labels can be generated after the station is approved. They contain only an opaque code that opens the station in the app — never payment details.</Notice>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {s.connectors.map((k) => {
                  const q = qrs.data?.find((x) => x.connectorId === k.id && !x.revokedAt);
                  return (
                    <Card key={k.id} className="flex flex-col items-center gap-2 p-4 text-center">
                      <p className="num text-[13px] font-semibold">{k.label}</p>
                      {q ? (
                        <>
                          <QrPreview value={q.url} />
                          <p className="num break-all text-[10px] text-ax-muted">{q.token}</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadPng(q.url, `${k.label}.png`)}>
                              PNG
                            </Button>
                            <Button size="sm" variant="ghost" className="text-ax-busy" icon={<Ban className="h-4 w-4" />} onClick={() => setRevoke(q)}>
                              Revoke
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button size="sm" icon={<QrIcon className="h-4 w-4" />} onClick={() => genQr(k.id)}>
                          Generate QR
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
            {qrs.data?.some((q) => q.revokedAt) && <p className="mt-2 text-[12px] text-ax-muted">{qrs.data.filter((q) => q.revokedAt).length} revoked code(s) will show “withdrawn” when scanned.</p>}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <SectionTitle>Verification</SectionTitle>
            <Card className="mt-3 p-4">
              <ol className="flex flex-col gap-3">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-start gap-3 text-[14px]">
                    {c.done ? (
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ax-green">
                        <Check className="h-3 w-3 text-ax-navy" strokeWidth={3} />
                      </span>
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ax-border" />
                    )}
                    <span className={c.done ? '' : 'text-ax-muted'}>{c.label}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[12px] leading-relaxed text-ax-muted">A registered station isn't a live EVSE. Drivers can only start charging after approval, a verified OCPP connection and commissioning.</p>
            </Card>
          </section>

          <section>
            <SectionTitle action={Object.keys(prices).length > 0 && <Button size="sm" onClick={savePrices}>Save</Button>}>Tariffs</SectionTitle>
            <Card className="mt-3 divide-y divide-ax-border">
              {s.tariffs.map((t) => {
                const cons = s.connectors.filter((c) => c.tariffId === t.id);
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{[...new Set(cons.map((c) => `${CONNECTOR_LABEL[c.type]} ${c.current}`))].join(', ')}</p>
                      <p className="text-[12px] text-ax-muted">{cons.length} connector(s) · currently {formatPhp(t.pricePerKwh)}/kWh</p>
                    </div>
                    <div className="w-28">
                      <Input aria-label="Price per kWh" inputMode="decimal" value={prices[t.id] ?? String(t.pricePerKwh)} onChange={(e) => setPrices({ ...prices, [t.id]: e.target.value.replace(/[^0-9.]/g, '') })} leading={<span className="text-ax-muted">₱</span>} />
                    </div>
                  </div>
                );
              })}
            </Card>
            <p className="mt-2 text-[12px] text-ax-muted">Price changes apply to new sessions. Active sessions keep the price they started with.</p>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={!!revoke}
        title="Revoke this QR label?"
        body="Scanning it will show “withdrawn”. Generate and print a new label to replace it."
        confirmLabel="Revoke"
        danger
        onCancel={() => setRevoke(null)}
        onConfirm={async () => {
          if (!revoke) return;
          try {
            await api(`/api/qr/${revoke.token}/revoke`, { method: 'POST' });
            qrs.reload();
          } catch (e) {
            setErr((e as Error).message);
          }
          setRevoke(null);
        }}
      />
      <Sheet open={!!cred} onClose={() => setCred(null)} title="New charger password">
        {cred && (
          <div className="flex flex-col gap-3">
            <Notice tone="warn">The old password stops working immediately. Update the charger's configuration now — this password is shown only once.</Notice>
            <CopyField label="Central System URL" value={cred.url} />
            <CopyField label="Identity" value={cred.identity} />
            {cred.password && <CopyField label="Password" value={cred.password} secret />}
          </div>
        )}
      </Sheet>
    </>
  );
}

function ChargerBlock({ charger, station, now, onRotate }: { charger: Charger; station: StationWithDetail; now: number; onRotate: () => void }) {
  const info = useApi<ConnectionCard & { live: { connected: boolean; version?: string; since?: string } }>(`/api/stations/${station.id}/chargers/${charger.id}/connection`, [charger.connected]);
  const cons = station.connectors.filter((k) => k.chargerId === charger.id);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ax-border p-4">
        <div className="min-w-0">
          <p className="num truncate text-[14px] font-bold">{charger.ocppIdentity}</p>
          <p className="text-[12px] text-ax-muted">
            {[charger.vendor, charger.model].filter(Boolean).join(' ') || 'Unknown model'}
            {charger.firmware && ` · fw ${charger.firmware}`}
          </p>
        </div>
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold', charger.connected ? 'bg-ax-mint text-ax-green-text' : 'bg-ax-surface text-ax-muted')}>
          {charger.connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {charger.connected ? `Connected · OCPP ${info.data?.live.version ?? charger.ocppVersion ?? ''}` : charger.lastHeartbeatAt ? `Offline · seen ${timeAgo(charger.lastHeartbeatAt, now)}` : 'Waiting for first BootNotification…'}
        </span>
      </div>
      {!charger.isSimulated && (
        <div className="flex flex-col gap-3 bg-ax-bg p-4">
          <p className="text-[13px] font-semibold">Connect your charger</p>
          {info.data && <CopyField label="Central System URL" value={info.data.url} />}
          <p className="text-[12px] text-ax-muted">
            Username = identity above. {info.data?.supportedVersions.join(' / ')}.{' '}
            <button type="button" className="font-semibold text-ax-green-text" onClick={onRotate}>
              <RotateCcw className="mr-1 inline h-3 w-3" />
              Reset password
            </button>
          </p>
        </div>
      )}
      {charger.isSimulated && <p className="bg-ax-bg px-4 py-2 text-[12px] text-ax-muted">Simulated charger — connected through the AChargeX simulator, no hardware.</p>}
      <ul className="divide-y divide-ax-border">
        {cons.map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-4 py-3">
            <span className="num w-[120px] shrink-0 truncate text-[12px] text-ax-muted sm:w-auto">{k.label}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
              {CONNECTOR_LABEL[k.type]} · {k.current} · {k.powerKw} kW
            </span>
            <StatusBadge status={charger.connected ? k.status : 'Offline'} />
          </li>
        ))}
      </ul>
      {!charger.commissioned && <p className="border-t border-ax-border px-4 py-2 text-[12px] text-ax-deal-text">Not commissioned — drivers can't start charging yet.</p>}
    </Card>
  );
}

function QrPreview({ value }: { value: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 360, color: { dark: '#192338', light: '#FFFFFF' }, errorCorrectionLevel: 'M' }).then(setSrc);
  }, [value]);
  return src ? <img src={src} alt="Charger QR code" className="h-36 w-36 rounded-lg" /> : <Skeleton className="h-36 w-36" />;
}

async function downloadPng(value: string, name: string) {
  const url = await QRCode.toDataURL(value, { margin: 2, width: 1024, color: { dark: '#192338', light: '#FFFFFF' }, errorCorrectionLevel: 'M' });
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

/** Print-ready label sheet (browser Print → Save as PDF). */
async function printLabels(station: StationWithDetail, codes: QrWithUrl[]) {
  const labels = await Promise.all(
    codes.map(async (q) => {
      const c = station.connectors.find((k) => k.id === q.connectorId);
      const img = await QRCode.toDataURL(q.url, { margin: 1, width: 600, color: { dark: '#192338', light: '#FFFFFF' } });
      return { img, label: c?.label ?? station.name, sub: c ? `${CONNECTOR_LABEL[c.type]} · ${c.current} ${c.powerKw} kW` : 'Station' };
    }),
  );
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  w.document.write(`<!doctype html><title>QR labels — ${esc(station.name)}</title>
  <style>@page{size:A4;margin:12mm}body{font-family:Inter,system-ui,sans-serif;color:#192338;margin:0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10mm}.l{border:2px solid #192338;border-radius:6mm;padding:7mm;text-align:center;break-inside:avoid}
  .b{display:inline-flex;align-items:center;gap:2mm;font-weight:800;font-size:16pt}.m{width:7mm;height:7mm;border-radius:2mm;background:#00BF80;display:inline-block}
  img{width:55mm;height:55mm;margin:4mm auto;display:block}.id{font-family:monospace;font-weight:700;font-size:12pt}.s{color:#5E6F86;font-size:10pt;margin-top:1mm}.h{font-size:9pt;color:#5E6F86;margin-top:3mm}</style>
  <div class="grid">${labels
    .map(
      (l) => `<div class="l"><div class="b"><span class="m"></span>AChargeX</div><img src="${l.img}" alt=""><div class="id">${esc(l.label)}</div><div class="s">${esc(l.sub)}</div><div class="h">Scan with the AChargeX app · ${esc(station.name)}</div></div>`,
    )
    .join('')}</div><script>window.onload=()=>setTimeout(()=>print(),300)</script>`);
  w.document.close();
}

