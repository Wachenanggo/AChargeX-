import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, List, Map as MapIcon, SlidersHorizontal, LocateFixed, ChevronRight, Headset, Car, X, MapPin } from 'lucide-react';
import { CONNECTOR_LABEL, type ConnectorType } from '@achargex/shared';
import { Logo, IconButton, Chip, Sheet, Button, DemoBadge, Notice, EmptyState, Skeleton, Spinner } from '../../ui';
import { EmptyArt } from '../../assets/illustrations';
import { useGo, geocode } from '../data';
import { useMediaQuery } from '../../lib/hooks';
import { StationMap } from '../components/StationMap';
import { StationCard } from '../components/StationCard';
import { applyFilters, activeFilterCount, DEFAULT_FILTERS, type Filters } from '../components/station-utils';
import { ConnectorIcon } from '../../assets/illustrations';
import { cx } from '../../lib/format';

const TYPES: ConnectorType[] = ['CCS2', 'Type2', 'CHAdeMO', 'GBT'];

export default function Find() {
  const { stations, loading, offline, location, setLocation, locate, selectedVehicle } = useGo();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const isSplit = useMediaQuery('(min-width: 768px)');
  const [view, setView] = useState<'map' | 'list'>((params.get('view') as 'list') === 'list' ? 'list' : 'map');
  const [f, setF] = useState<Filters>({ ...DEFAULT_FILTERS, q: params.get('q') ?? '' });
  const [qInput, setQInput] = useState(f.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string>();
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(location.precise ? location : null);

  const items = useMemo(() => applyFilters(stations, f, selectedVehicle, location), [stations, f, selectedVehicle, location]);
  const selected = items.find((i) => i.s.id === selectedId);

  // Initial focus: the first query result, otherwise the current location.
  useEffect(() => {
    if (f.q && items[0]) setFocus([items[0].s.lat, items[0].s.lng]);
  }, [f.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = qInput.trim();
    setGeoMsg(undefined);
    const next = { ...f, q };
    const matches = applyFilters(stations, next, selectedVehicle, location);
    if (q && matches.length === 0) {
      // No station matches → treat it as a place search.
      setGeoBusy(true);
      try {
        const places = await geocode(q);
        if (places[0]) {
          setLocation({ ...places[0], precise: false });
          setFocus([places[0].lat, places[0].lng]);
          setF({ ...f, q: '' });
          setGeoMsg(`Showing stations near ${places[0].label}`);
        } else {
          setF(next);
          setGeoMsg(`No stations or places match “${q}”.`);
        }
      } catch (x) {
        setF(next);
        setGeoMsg((x as Error).message);
      } finally {
        setGeoBusy(false);
      }
    } else {
      setF(next);
      if (matches[0]) setFocus([matches[0].s.lat, matches[0].s.lng]);
    }
    const p = new URLSearchParams(params);
    if (q) p.set('q', q);
    else p.delete('q');
    setParams(p, { replace: true });
  };

  const recenter = async () => {
    setGeoMsg(undefined);
    try {
      await locate();
      setGeoMsg(undefined);
    } catch (x) {
      setGeoMsg((x as Error).message);
    }
  };
  useEffect(() => {
    if (location.precise) {
      setMe({ lat: location.lat, lng: location.lng });
      setFocus([location.lat, location.lng]);
    }
  }, [location.lat, location.lng, location.precise]);

  const nf = activeFilterCount(f);

  const chrome = (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between lg:hidden">
        <Logo />
        <IconButton label="Support" className="border-[1.5px] border-ax-navy" onClick={() => nav('/account#support')}>
          <Headset className="h-5 w-5" />
        </IconButton>
      </div>
      <h1 className="hidden text-[22px] font-extrabold tracking-[-0.5px] lg:block">Find a charger</h1>

      <Link to="/garage" className="flex items-center gap-3 rounded-[16px] border border-ax-border bg-white px-3.5 py-2.5 shadow-card">
        <span className="flex h-8 w-12 items-center justify-center rounded-[8px] bg-ax-surface">
          <Car className="h-5 w-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold tracking-[1.4px] text-ax-muted">CURRENT VEHICLE</span>
          <span className="truncate text-[15px] font-semibold">
            {selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model} · ${selectedVehicle.connectors.map((c) => CONNECTOR_LABEL[c]).join(' / ')}` : 'Add your vehicle'}
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
      </Link>

      <div className="flex gap-2">
        <form onSubmit={runSearch} role="search" className="flex h-[46px] flex-1 items-center gap-2 rounded-[14px] border border-ax-border bg-white px-3.5 shadow-card focus-within:border-ax-green">
          {geoBusy ? <Spinner className="h-[18px] w-[18px]" /> : <Search className="h-[18px] w-[18px] shrink-0 text-ax-muted" aria-hidden />}
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Station, city or place"
            aria-label="Search stations or places"
            enterKeyHint="search"
            className="h-full w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-ax-muted"
          />
          {qInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQInput('');
                setF({ ...f, q: '' });
                setGeoMsg(undefined);
              }}
              className="text-ax-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
        {!isSplit && (
          <IconButton label={view === 'map' ? 'List view' : 'Map view'} className="h-[46px] w-[46px] rounded-[14px] shadow-card" onClick={() => setView(view === 'map' ? 'list' : 'map')}>
            {view === 'map' ? <List className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
          </IconButton>
        )}
      </div>

      <div className="scroll-x -mx-4 gap-2 px-4" role="group" aria-label="Quick filters">
        <Chip active={!f.availableOnly && !f.myConnectors && nf === 0} onClick={() => setF({ ...DEFAULT_FILTERS, q: f.q })}>
          All
        </Chip>
        <Chip active={f.availableOnly} dot="#00BF80" onClick={() => setF({ ...f, availableOnly: !f.availableOnly })}>
          Available
        </Chip>
        {selectedVehicle && (
          <Chip active={f.myConnectors} onClick={() => setF({ ...f, myConnectors: !f.myConnectors })}>
            My connectors
          </Chip>
        )}
        <Chip active={nf > 0} onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters{nf > 0 ? ` · ${nf}` : ''}
        </Chip>
      </div>
      {geoMsg && (
        <p className="flex items-center gap-1.5 text-[12px] text-ax-muted" role="status">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {geoMsg}
        </p>
      )}
    </div>
  );

  const list = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-[12px] text-ax-muted">
        <span>
          {items.length} station{items.length === 1 ? '' : 's'} · nearest to {location.label}
        </span>
        {stations.some((s) => s.isDemo) && <DemoBadge label="DEMO DATA" />}
      </div>
      {loading && [0, 1, 2].map((k) => <Skeleton key={k} className="h-[132px] rounded-[20px]" />)}
      {!loading && items.length === 0 && (
        <EmptyState art={<EmptyArt kind="search" />} title="No stations match" action={<Button variant="secondary" onClick={() => setF(DEFAULT_FILTERS)}>Clear filters</Button>}>
          Try removing a filter or searching a nearby city.
        </EmptyState>
      )}
      {items.map(({ s, sum }) =>
        isSplit ? (
          <StationCard key={s.id} station={s} sum={sum} offline={offline} selected={s.id === selectedId} onSelect={() => { setSelectedId(s.id); setFocus([s.lat, s.lng]); }} />
        ) : (
          <StationCard key={s.id} station={s} sum={sum} offline={offline} to={`/station/${s.id}`} />
        ),
      )}
    </div>
  );

  const map = (
    <StationMap
      className="h-full w-full"
      items={items}
      selectedId={selectedId}
      onSelect={(id) => setSelectedId(id)}
      center={location}
      me={me}
      focus={focus}
    />
  );

  const preview = selected && (
    <div className="animate-sheet rounded-[20px] bg-white shadow-float">
      <StationCard station={selected.s} sum={selected.sum} offline={offline} to={`/station/${selected.s.id}`} />
    </div>
  );

  const filterSheet = (
    <Sheet
      open={filtersOpen}
      onClose={() => setFiltersOpen(false)}
      title="Filters"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={() => setF({ ...DEFAULT_FILTERS, q: f.q })}>
            Reset
          </Button>
          <Button block onClick={() => setFiltersOpen(false)}>
            Show {items.length} station{items.length === 1 ? '' : 's'}
          </Button>
        </div>
      }
    >
      <FilterBody f={f} setF={setF} />
    </Sheet>
  );

  // ----- split (tablet / desktop) -----
  if (isSplit) {
    return (
      <div className="flex h-[calc(100dvh-var(--nav-h)-var(--safe-bottom))] lg:h-dvh">
        <section className="flex w-[380px] shrink-0 flex-col border-r border-ax-border bg-ax-bg xl:w-[420px]" aria-label="Stations">
          <div className="p-4 pt-safe">{chrome}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {offline && <Notice tone="warn" className="mb-3">Preview only — the service is unreachable, so availability isn't live.</Notice>}
            {list}
          </div>
        </section>
        <section className="relative min-w-0 flex-1" aria-label="Map">
          {map}
          <IconButton label="Recenter on my location" className="absolute bottom-6 right-4 z-[500] shadow-card" onClick={recenter}>
            <LocateFixed className="h-5 w-5" />
          </IconButton>
          {preview && <div className="absolute bottom-6 left-4 right-20 z-[500] max-w-[420px]">{preview}</div>}
        </section>
        {filterSheet}
      </div>
    );
  }

  // ----- phone: map OR list -----
  if (view === 'list') {
    return (
      <div className="pb-nav">
        <div className="mx-auto max-w-[640px] px-4 pt-safe">
          <div className="pt-3">{chrome}</div>
          {offline && <Notice tone="warn" className="mt-3">Preview only — availability isn't live.</Notice>}
          <div className="mt-4">{list}</div>
        </div>
        {filterSheet}
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-var(--nav-h)-var(--safe-bottom))] overflow-hidden">
      <div className="absolute inset-0">{map}</div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-ax-bg/95 via-ax-bg/70 to-transparent px-4 pb-6 pt-safe">
        <div className="pointer-events-auto pt-3">{chrome}</div>
      </div>
      {stations.some((s) => s.isDemo) && (
        <div className="absolute left-4 z-[500]" style={{ top: 'calc(var(--safe-top) + 248px)' }}>
          <DemoBadge label="DEMO DATA" />
        </div>
      )}
      <div className={cx('absolute inset-x-3 z-[600] flex flex-col items-end gap-3', 'bottom-3')}>
        <IconButton label="Recenter on my location" className="shadow-card" onClick={recenter}>
          <LocateFixed className="h-5 w-5" />
        </IconButton>
        {offline && <Notice tone="warn" className="w-full">Preview only — availability isn't live.</Notice>}
        {preview && (
          <div className="relative w-full">
            <button type="button" aria-label="Close station preview" onClick={() => setSelectedId(undefined)} className="absolute -top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-ax-navy text-white shadow-card">
              <X className="h-4 w-4" />
            </button>
            {preview}
          </div>
        )}
        {!preview && items.length > 0 && (
          <button type="button" onClick={() => setView('list')} className="self-center rounded-full bg-ax-navy px-4 py-2.5 text-[13px] font-semibold text-white shadow-float">
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            Show {items.length} stations as list
          </button>
        )}
      </div>
      {filterSheet}
    </div>
  );
}

function FilterBody({ f, setF }: { f: Filters; setF: (f: Filters) => void }) {
  const toggleType = (t: ConnectorType) => setF({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] });
  return (
    <div className="flex flex-col gap-6 pb-2">
      <fieldset>
        <legend className="eyebrow">Connector type</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={f.types.includes(t)}
              onClick={() => toggleType(t)}
              className={cx('flex items-center gap-2.5 rounded-[14px] border p-3 text-left text-[14px] font-semibold', f.types.includes(t) ? 'border-ax-green bg-ax-mint' : 'border-ax-border')}
            >
              <ConnectorIcon type={t} size={26} />
              {CONNECTOR_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow">Minimum power</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0, 22, 50, 100].map((kw) => (
            <Chip key={kw} active={f.minKw === kw} onClick={() => setF({ ...f, minKw: kw })}>
              {kw === 0 ? 'Any' : `${kw}+ kW`}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow">Max price per kWh</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0, 28, 32, 36].map((p) => (
            <Chip key={p} active={f.maxPrice === p} onClick={() => setF({ ...f, maxPrice: p })}>
              {p === 0 ? 'Any' : `≤ ₱${p}`}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow">More</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={f.availableOnly} onClick={() => setF({ ...f, availableOnly: !f.availableOnly })}>
            Available now
          </Chip>
          <Chip active={f.dcOnly} onClick={() => setF({ ...f, dcOnly: !f.dcOnly })}>
            DC fast only
          </Chip>
          <Chip active={f.open24h} onClick={() => setF({ ...f, open24h: !f.open24h })}>
            Open 24 hours
          </Chip>
        </div>
      </fieldset>
    </div>
  );
}
