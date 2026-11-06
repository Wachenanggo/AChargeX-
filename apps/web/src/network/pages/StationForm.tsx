import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Trash2, LocateFixed, ArrowLeft, ArrowRight, KeyRound, FileUp } from 'lucide-react';
import { CONNECTOR_LABEL, type ConnectorType, type StationWithDetail } from '@achargex/shared';
import { Button, Card, Input, Select, Notice, Chip } from '../../ui';
import { api } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';
import { cx } from '../../lib/format';
import { CopyField, type ConnectionCard } from '../shared';

interface ConnIn {
  type: ConnectorType;
  current: 'AC' | 'DC';
  powerKw: number;
  pricePerKwh: number;
}
interface ChargerIn {
  vendor: string;
  model: string;
  ocppVersion: '' | '1.6' | '2.0.1';
  connectors: ConnIn[];
}

const STEPS = ['Details', 'Location', 'Chargers', 'Review'];
const AMENITIES = ['Restrooms', 'Food court', 'Café', 'Covered parking', 'Mall', 'Convenience store', 'Wi-Fi'];

const pin = L.divIcon({
  html: '<div style="width:36px;height:36px;border-radius:18px 18px 18px 4px;transform:rotate(-45deg);background:#00BF80;border:3px solid #fff;box-shadow:0 4px 10px rgba(25,35,56,.3)"></div>',
  className: 'ax-pin',
  iconSize: [36, 36],
  iconAnchor: [18, 38],
});

function Picker({ value, onChange }: { value: { lat: number; lng: number }; onChange: (v: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e) => onChange({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }) });
  return <Marker position={[value.lat, value.lng]} icon={pin} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onChange({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); } }} />;
}

export default function StationForm() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [d, setD] = useState({ name: '', address: '', city: 'Davao City', is24h: false, openingHours: '8:00 AM – 9:00 PM', access: 'public', amenities: [] as string[], business: '' });
  const [loc, setLoc] = useState({ lat: 7.0731, lng: 125.6128 });
  const [chargers, setChargers] = useState<ChargerIn[]>([{ vendor: '', model: '', ocppVersion: '', connectors: [{ type: 'Type2', current: 'AC', powerKw: 22, pricePerKwh: 28 }] }]);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ station: StationWithDetail; credentials: ConnectionCard[] }>();

  const valid = [
    d.name.trim().length > 2 && d.address.trim().length > 3 && d.city.trim().length > 1,
    loc.lat >= 4 && loc.lat <= 22 && loc.lng >= 116 && loc.lng <= 127,
    chargers.length > 0 && chargers.every((c) => c.connectors.length > 0 && c.connectors.every((k) => k.powerKw > 0 && k.pricePerKwh > 0)),
    true,
  ];

  const submit = async () => {
    setErr(undefined);
    setBusy(true);
    try {
      const r = await api<{ station: StationWithDetail; credentials: ConnectionCard[] }>('/api/stations', {
        method: 'POST',
        body: { ...d, lat: loc.lat, lng: loc.lng, chargers: chargers.map((c) => ({ ...c, ocppVersion: c.ocppVersion || undefined })) },
      });
      setCreated(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updC = (i: number, patch: Partial<ChargerIn>) => setChargers(chargers.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const updK = (i: number, j: number, patch: Partial<ConnIn>) => updC(i, { connectors: chargers[i].connectors.map((k, m) => (m === j ? { ...k, ...patch } : k)) });

  if (created) {
    return (
      <div className="mx-auto max-w-[720px]">
        <Notice tone="success" title="Station saved as draft">
          Next: connect each charger to AChargeX, then submit the station for review.
        </Notice>
        <h1 className="mt-5 text-[24px] font-extrabold tracking-[-0.5px]">Connect your chargers</h1>
        <p className="mt-1 text-[14px] text-ax-muted">
          Enter these details in each charger's configuration (its web portal or the installer app), under <strong>OCPP / Central System / CSMS URL</strong>. The password is shown only once — store it safely.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {created.credentials.map((c, i) => (
            <Card key={c.identity} className="flex flex-col gap-3 p-4">
              <p className="flex items-center gap-2 text-[15px] font-bold">
                <KeyRound className="h-4 w-4 text-ax-green-text" /> Charger {i + 1}
              </p>
              <CopyField label="Central System URL" value={c.url} />
              <div className="grid gap-3 sm:grid-cols-2">
                <CopyField label="Charge point identity" value={c.identity} />
                {c.password && <CopyField label="Password (Basic auth)" value={c.password} secret />}
              </div>
              <p className="text-[12px] text-ax-muted">
                Supports {c.supportedVersions.join(' and ')}. {c.security}
              </p>
            </Card>
          ))}
        </div>
        <Button className="mt-5" size="lg" onClick={() => nav(`/network/stations/${created.station.id}`)}>
          Continue to station
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <Link to="/network" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ax-muted hover:text-ax-navy">
        <ArrowLeft className="h-4 w-4" /> Network
      </Link>
      <h1 className="mt-2 text-[26px] font-extrabold tracking-[-0.6px]">Register a station</h1>
      <ol className="mt-4 grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => i < step && setStep(i)} className="flex w-full flex-col gap-1.5 text-left" aria-current={i === step ? 'step' : undefined}>
              <span className={cx('h-1.5 rounded-full', i <= step ? 'bg-ax-green' : 'bg-ax-border')} />
              <span className={cx('text-[11px] font-semibold', i === step ? 'text-ax-navy' : 'text-ax-muted')}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <Card className="mt-5 p-4 md:p-6">
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Station name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Matina Crossing Hub" className="md:col-span-2" />
            <Input label="Business / operator name" value={d.business} onChange={(e) => setD({ ...d, business: e.target.value })} placeholder="Registered business name" />
            <Select label="Access" value={d.access} onChange={(e) => setD({ ...d, access: e.target.value })}>
              <option value="public">Public</option>
              <option value="customers">Customers only</option>
              <option value="private">Private</option>
            </Select>
            <Input label="Street address" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} className="md:col-span-2" />
            <Input label="City / municipality" value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} />
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Operating hours</span>
              <div className="flex gap-2">
                <Chip active={d.is24h} onClick={() => setD({ ...d, is24h: !d.is24h })}>
                  24 hours
                </Chip>
                {!d.is24h && <input aria-label="Hours" className="h-9 min-w-0 flex-1 rounded-[12px] border border-ax-border px-3 text-[14px]" value={d.openingHours} onChange={(e) => setD({ ...d, openingHours: e.target.value })} />}
              </div>
            </div>
            <div className="md:col-span-2">
              <span className="text-[13px] font-semibold">Amenities</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {AMENITIES.map((a) => (
                  <Chip key={a} active={d.amenities.includes(a)} onClick={() => setD({ ...d, amenities: d.amenities.includes(a) ? d.amenities.filter((x) => x !== a) : [...d.amenities, a] })}>
                    {a}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <span className="text-[13px] font-semibold">Photos and ownership documents</span>
              <label className={cx('mt-2 flex items-center gap-3 rounded-[14px] border-2 border-dashed border-ax-border p-4 text-[13px] text-ax-muted', user?.isDemo && 'opacity-60')}>
                <FileUp className="h-5 w-5" />
                <span className="flex-1">{user?.isDemo ? 'Uploads need Supabase Storage — unavailable in demo mode. AChargeX reviewers will request documents during verification.' : 'Upload photos, permit or proof of ownership (PDF/JPG).'}</span>
                <input type="file" multiple accept="image/*,application/pdf" disabled={user?.isDemo} className="sr-only" />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="text-[14px] text-ax-muted">Tap the map or drag the pin to the charger's exact location.</p>
            <div className="mt-3 h-[320px] overflow-hidden rounded-[16px] border border-ax-border md:h-[380px]">
              <MapContainer center={[loc.lat, loc.lng]} zoom={14} className="h-full w-full">
                <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
                <Picker value={loc} onChange={setLoc} />
              </MapContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="num rounded-[10px] bg-ax-surface px-3 py-2 text-[13px]">
                {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={<LocateFixed className="h-4 w-4" />}
                onClick={() => navigator.geolocation?.getCurrentPosition((p) => setLoc({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }), () => setErr('Location permission denied.'))}
              >
                Use my location
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {chargers.map((c, i) => (
              <div key={i} className="rounded-[16px] border border-ax-border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-bold">Charger {i + 1}</p>
                  {chargers.length > 1 && (
                    <button type="button" aria-label={`Remove charger ${i + 1}`} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ax-busy hover:bg-ax-busy-bg" onClick={() => setChargers(chargers.filter((_, k) => k !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Input label="Manufacturer" value={c.vendor} onChange={(e) => updC(i, { vendor: e.target.value })} placeholder="e.g. ABB" />
                  <Input label="Model" value={c.model} onChange={(e) => updC(i, { model: e.target.value })} placeholder="e.g. Terra 54" />
                  <Select label="OCPP version" value={c.ocppVersion} onChange={(e) => updC(i, { ocppVersion: e.target.value as ChargerIn['ocppVersion'] })}>
                    <option value="">Auto-detect</option>
                    <option value="1.6">OCPP 1.6J</option>
                    <option value="2.0.1">OCPP 2.0.1</option>
                  </Select>
                </div>
                <p className="eyebrow mt-4">Connectors</p>
                <div className="mt-2 flex flex-col gap-2">
                  {c.connectors.map((k, j) => (
                    <div key={j} className="grid grid-cols-2 items-end gap-2 rounded-[12px] bg-ax-bg p-3 sm:grid-cols-[1.3fr_0.8fr_0.9fr_0.9fr_auto]">
                      <Select label="Type" value={k.type} onChange={(e) => updK(i, j, { type: e.target.value as ConnectorType, current: ['CCS2', 'CHAdeMO', 'GBT', 'CCS1'].includes(e.target.value) ? 'DC' : 'AC' })}>
                        {(['CCS2', 'Type2', 'CHAdeMO', 'GBT', 'CCS1', 'Type1'] as ConnectorType[]).map((t) => (
                          <option key={t} value={t}>
                            {CONNECTOR_LABEL[t]}
                          </option>
                        ))}
                      </Select>
                      <Select label="Current" value={k.current} onChange={(e) => updK(i, j, { current: e.target.value as 'AC' | 'DC' })}>
                        <option>AC</option>
                        <option>DC</option>
                      </Select>
                      <Input label="Power (kW)" inputMode="decimal" value={String(k.powerKw)} onChange={(e) => updK(i, j, { powerKw: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} />
                      <Input label="₱ / kWh" inputMode="decimal" value={String(k.pricePerKwh)} onChange={(e) => updK(i, j, { pricePerKwh: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} />
                      <button type="button" aria-label="Remove connector" disabled={c.connectors.length === 1} className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-ax-busy hover:bg-ax-busy-bg disabled:opacity-30" onClick={() => updC(i, { connectors: c.connectors.filter((_, m) => m !== j) })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="self-start" icon={<Plus className="h-4 w-4" />} onClick={() => updC(i, { connectors: [...c.connectors, { type: 'CCS2', current: 'DC', powerKw: 60, pricePerKwh: 33 }] })}>
                    Add connector
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setChargers([...chargers, { vendor: '', model: '', ocppVersion: '', connectors: [{ type: 'Type2', current: 'AC', powerKw: 22, pricePerKwh: 28 }] }])}>
              Add another charger
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3 text-[14px]">
            <p>
              <strong>{d.name}</strong> — {d.address}, {d.city}
            </p>
            <p className="text-ax-muted">
              {d.is24h ? 'Open 24 hours' : d.openingHours} · {d.access} · {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
            </p>
            <ul className="list-inside list-disc text-ax-muted">
              {chargers.map((c, i) => (
                <li key={i}>
                  Charger {i + 1}: {c.vendor || 'Unknown make'} {c.model} · {c.connectors.map((k) => `${CONNECTOR_LABEL[k.type]} ${k.powerKw}kW ₱${k.pricePerKwh}`).join(', ')}
                </li>
              ))}
            </ul>
            <Notice tone="info">
              Your station is saved as a <strong>draft</strong>. It won't be visible to drivers until AChargeX reviews it, and each charger must connect over OCPP and be commissioned before drivers can start charging.
            </Notice>
          </div>
        )}
        {err && <Notice tone="error" className="mt-4">{err}</Notice>}
      </Card>

      <div className="mt-4 flex justify-between gap-2">
        <Button variant="secondary" onClick={() => (step === 0 ? nav('/network') : setStep(step - 1))} icon={<ArrowLeft className="h-4 w-4" />}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!valid[step]}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="charge" onClick={submit} loading={busy}>
            Save draft station
          </Button>
        )}
      </div>
    </div>
  );
}
