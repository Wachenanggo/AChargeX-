import { useMemo, useState } from 'react';
import { Plus, Check, Pencil, Trash2 } from 'lucide-react';
import { can, CONNECTOR_LABEL, VEHICLE_CATALOG, type ConnectorType, type Vehicle } from '@achargex/shared';
import { Button, ButtonLink, Card, EmptyState, Sheet, Input, Select, Notice, ConfirmDialog, SectionTitle, DemoBadge } from '../../ui';
import { VehicleArt, ConnectorIcon, EmptyArt } from '../../assets/illustrations';
import { useAuth } from '../../auth/AuthProvider';
import { useGo } from '../data';
import { api } from '../../lib/api';
import { Page } from '../GoLayout';
import { cx } from '../../lib/format';

const ALL: ConnectorType[] = ['CCS2', 'Type2', 'CHAdeMO', 'GBT', 'CCS1', 'Type1'];

export default function Garage() {
  const { user } = useAuth();
  const { vehicles, selectedVehicle, reloadVehicles, stations, offline } = useGo();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [removing, setRemoving] = useState<Vehicle | null>(null);
  const [err, setErr] = useState<string>();
  const allowed = !!user && can(user.role, 'vehicles:own') && !offline;

  const compat = useMemo(() => {
    if (!selectedVehicle) return 0;
    return stations.filter((s) => s.connectors.some((c) => selectedVehicle.connectors.includes(c.type))).length;
  }, [stations, selectedVehicle]);

  if (!allowed) {
    return (
      <Page>
        <h1 className="pt-6 text-[26px] font-extrabold tracking-[-0.6px] lg:pt-8">Garage</h1>
        <EmptyState art={<EmptyArt kind="vehicles" />} title={offline ? 'Unavailable offline' : 'Save your EV'} action={!offline && <ButtonLink to="/signin?next=/garage">Sign in</ButtonLink>}>
          Add your vehicle to see compatible chargers and filter by your connectors.
        </EmptyState>
      </Page>
    );
  }

  const select = async (v: Vehicle) => {
    setErr(undefined);
    try {
      await api(`/api/vehicles/${v.id}`, { method: 'PATCH', body: { isSelected: true } });
      reloadVehicles();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Page wide>
      <div className="flex items-end justify-between gap-3 pt-6 lg:pt-8">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px]">Garage</h1>
          <p className="mt-1 text-[14px] text-ax-muted">Your vehicles and connector compatibility.</p>
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Add vehicle
        </Button>
      </div>
      {err && <Notice tone="error" className="mt-3">{err}</Notice>}

      {vehicles.length === 0 ? (
        <EmptyState art={<EmptyArt kind="vehicles" />} title="No vehicles yet" action={<Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" />}>Add your first vehicle</Button>}>
          We'll use it to highlight compatible connectors.
        </EmptyState>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
          {selectedVehicle && (
            <section aria-label="Selected vehicle" className="mt-5">
              <div className="overflow-hidden rounded-[22px] bg-ax-navy text-white">
                <div className="flex items-start justify-between p-5 pb-0">
                  <div>
                    <p className="text-[11px] font-bold tracking-[1.4px] text-ax-green">SELECTED VEHICLE</p>
                    <h2 className="mt-1 text-[22px] font-bold">
                      {selectedVehicle.make} {selectedVehicle.model}
                    </h2>
                    <p className="text-[13px] text-ax-navy-sub">
                      {selectedVehicle.nickname ?? selectedVehicle.plate ?? 'No plate'}
                      {selectedVehicle.batteryKwh ? ` · ${selectedVehicle.batteryKwh} kWh battery` : ''}
                    </p>
                  </div>
                  {user?.isDemo && <DemoBadge dark />}
                </div>
                <div className="flex justify-center px-4 pb-2 pt-4">
                  <VehicleArt body={selectedVehicle.bodyType} width={260} onDark />
                </div>
              </div>

              <SectionTitle className="mt-6">Connector compatibility</SectionTitle>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {ALL.map((t) => {
                  const ok = selectedVehicle.connectors.includes(t);
                  return (
                    <div key={t} className={cx('flex flex-col items-center gap-1.5 rounded-[16px] border p-3', ok ? 'border-ax-mint-strong bg-ax-mint' : 'border-ax-border bg-white opacity-60')}>
                      <ConnectorIcon type={t} size={30} color={ok ? '#007A55' : '#5E6F86'} />
                      <span className="text-[12px] font-semibold">{CONNECTOR_LABEL[t]}</span>
                      <span className={cx('text-[10px] font-bold tracking-[1px]', ok ? 'text-ax-green-text' : 'text-ax-muted')}>{ok ? 'SUPPORTED' : 'NOT SUPPORTED'}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[13px] text-ax-muted">
                <strong className="text-ax-navy">{compat}</strong> station{compat === 1 ? '' : 's'} on the network have a compatible connector.
              </p>
            </section>
          )}

          <section aria-label="All vehicles" className="mt-6 lg:mt-5">
            <SectionTitle>All vehicles</SectionTitle>
            <div className="mt-3 flex flex-col gap-2">
              {vehicles.map((v) => (
                <Card key={v.id} className={cx('flex items-center gap-3 p-3', v.isSelected && 'border-ax-green')}>
                  <button type="button" onClick={() => !v.isSelected && select(v)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-pressed={v.isSelected} aria-label={`Select ${v.make} ${v.model}`}>
                    <span className="flex h-12 w-[76px] shrink-0 items-center justify-center rounded-[12px] bg-ax-surface">
                      <VehicleArt body={v.bodyType} width={68} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {v.make} {v.model}
                      </span>
                      <span className="block truncate text-[12px] text-ax-muted">{v.connectors.map((c) => CONNECTOR_LABEL[c]).join(' / ')}</span>
                    </span>
                    {v.isSelected && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ax-green">
                        <Check className="h-3.5 w-3.5 text-ax-navy" strokeWidth={3} aria-label="Selected" />
                      </span>
                    )}
                  </button>
                  <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-ax-surface" aria-label={`Edit ${v.make} ${v.model}`} onClick={() => setEditing(v)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ax-busy hover:bg-ax-busy-bg" aria-label={`Remove ${v.make} ${v.model}`} onClick={() => setRemoving(v)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
              <button type="button" onClick={() => setEditing('new')} className="flex h-14 items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-ax-border text-[14px] font-semibold text-ax-muted hover:border-ax-green hover:text-ax-navy">
                <Plus className="h-4 w-4" /> Add another vehicle
              </button>
            </div>
          </section>
        </div>
      )}

      <VehicleSheet key={editing === 'new' ? 'new' : editing?.id ?? 'none'} open={!!editing} vehicle={editing === 'new' ? undefined : editing ?? undefined} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reloadVehicles(); }} />
      <ConfirmDialog
        open={!!removing}
        title="Remove vehicle?"
        body={removing ? `${removing.make} ${removing.model} will be removed from your garage.` : ''}
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api(`/api/vehicles/${removing.id}`, { method: 'DELETE' });
            reloadVehicles();
          } catch (e) {
            setErr((e as Error).message);
          }
          setRemoving(null);
        }}
      />
    </Page>
  );
}

function VehicleSheet({ open, vehicle, onClose, onSaved }: { open: boolean; vehicle?: Vehicle; onClose: () => void; onSaved: () => void }) {
  const makes = [...new Set(VEHICLE_CATALOG.map((v) => v.make))];
  const [make, setMake] = useState(vehicle?.make ?? makes[0]);
  const models = VEHICLE_CATALOG.filter((v) => v.make === make);
  const [model, setModel] = useState(vehicle?.model ?? models[0]?.model);
  const preset = VEHICLE_CATALOG.find((v) => v.make === make && v.model === model);
  const [connectors, setConnectors] = useState<ConnectorType[]>(vehicle?.connectors ?? preset?.connectors ?? ['CCS2', 'Type2']);
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [battery, setBattery] = useState(String(vehicle?.batteryKwh ?? preset?.batteryKwh ?? ''));
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const pick = (mk: string, md?: string) => {
    setMake(mk);
    const m = VEHICLE_CATALOG.find((v) => v.make === mk && (!md || v.model === md));
    if (m) {
      setModel(m.model);
      setConnectors(m.connectors);
      setBattery(String(m.batteryKwh));
    }
  };

  const save = async () => {
    setErr(undefined);
    setBusy(true);
    try {
      if (vehicle) {
        await api(`/api/vehicles/${vehicle.id}`, { method: 'PATCH', body: { plate, connectors, batteryKwh: battery ? Number(battery) : undefined } });
      } else {
        await api('/api/vehicles', { method: 'POST', body: { make, model, plate: plate || undefined, connectors, batteryKwh: battery ? Number(battery) : undefined, bodyType: preset?.bodyType ?? 'sedan' } });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.make} ${vehicle.model}` : 'Add vehicle'}
      footer={
        <Button block size="lg" onClick={save} loading={busy}>
          {vehicle ? 'Save changes' : 'Add vehicle'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!vehicle && (
          <>
            <div className="flex justify-center rounded-[18px] bg-ax-surface py-3">
              <VehicleArt body={preset?.bodyType ?? 'sedan'} width={180} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Make" value={make} onChange={(e) => pick(e.target.value)}>
                {makes.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
              <Select label="Model" value={model} onChange={(e) => pick(make, e.target.value)}>
                {models.map((m) => (
                  <option key={m.model}>{m.model}</option>
                ))}
              </Select>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Plate (optional)" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} maxLength={12} />
          <Input label="Battery (kWh)" inputMode="decimal" value={battery} onChange={(e) => setBattery(e.target.value.replace(/[^0-9.]/g, ''))} />
        </div>
        <fieldset>
          <legend className="text-[13px] font-semibold">Supported connectors</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ALL.map((t) => {
              const on = connectors.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setConnectors(on ? connectors.filter((x) => x !== t) : [...connectors, t])}
                  className={cx('flex flex-col items-center gap-1 rounded-[14px] border p-2.5 text-[12px] font-semibold', on ? 'border-ax-green bg-ax-mint' : 'border-ax-border')}
                >
                  <ConnectorIcon type={t} size={24} />
                  {CONNECTOR_LABEL[t]}
                </button>
              );
            })}
          </div>
        </fieldset>
        {err && <Notice tone="error">{err}</Notice>}
      </div>
    </Sheet>
  );
}
