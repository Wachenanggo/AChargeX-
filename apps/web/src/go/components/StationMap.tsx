/**
 * Leaflet + OpenStreetMap map. No API key needed (fixes the old "API key" error screen).
 * Custom DivIcon pins (no broken default marker assets), grid clustering at low zoom,
 * resize handling, loading/failure states and proper OSM attribution.
 */
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import type { StationWithDetail } from '@achargex/shared';
import type { StationSummary } from './station-utils';

const BOLT = '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>';

function pinIcon(tone: StationSummary['tone'], selected: boolean, deal: boolean) {
  const size = selected ? 52 : 40;
  const bg = tone === 'available' ? (selected ? '#00BF80' : '#007A55') : tone === 'busy' ? '#C2413B' : '#7C8CA1';
  const fg = selected ? '#192338' : '#FFFFFF';
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px">
      <div style="position:absolute;inset:0;border-radius:${size / 2}px ${size / 2}px ${size / 2}px ${selected ? 6 : 4}px;transform:rotate(-45deg);background:${bg};border:${selected ? 4 : 3}px solid #fff;box-sizing:border-box;box-shadow:0 ${selected ? 6 : 4}px ${selected ? 16 : 10}px rgba(25,35,56,.3)"></div>
      <svg width="${selected ? 20 : 16}" height="${selected ? 20 : 16}" viewBox="0 0 24 24" fill="${fg}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">${BOLT}</svg>
      ${deal ? `<div style="position:absolute;right:-6px;top:-6px;width:20px;height:20px;border-radius:10px;background:#F2B53A;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:700 10px Inter,sans-serif;color:#192338">%</div>` : ''}
    </div>`;
  return L.divIcon({ html, className: 'ax-pin', iconSize: [size, size], iconAnchor: [size / 2, size * 1.05] });
}

function clusterIcon(n: number) {
  return L.divIcon({
    html: `<div style="width:44px;height:44px;border-radius:22px;background:#BFF0DC;border:3px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:700 15px Inter,sans-serif;color:#005E42;box-shadow:0 4px 10px rgba(25,35,56,.18)">${n}</div>`,
    className: 'ax-pin',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function Resizer() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPrefix(false);
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FlyTo({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom ?? Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [center?.[0], center?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface Item {
  s: StationWithDetail;
  sum: StationSummary;
}

function Markers({ items, selectedId, onSelect }: { items: Item[]; selectedId?: string; onSelect: (id: string) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const groups = useMemo(() => {
    if (zoom >= 13) return items.map((i) => ({ items: [i], lat: i.s.lat, lng: i.s.lng }));
    const cell = 56;
    const buckets = new Map<string, Item[]>();
    for (const i of items) {
      const p = map.project([i.s.lat, i.s.lng], zoom);
      const k = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      buckets.set(k, [...(buckets.get(k) ?? []), i]);
    }
    return [...buckets.values()].map((g) => ({ items: g, lat: g.reduce((a, i) => a + i.s.lat, 0) / g.length, lng: g.reduce((a, i) => a + i.s.lng, 0) / g.length }));
  }, [items, zoom, map]);

  return (
    <>
      {groups.map((g) =>
        g.items.length === 1 ? (
          <Marker
            key={g.items[0].s.id}
            position={[g.lat, g.lng]}
            icon={pinIcon(g.items[0].sum.tone, g.items[0].s.id === selectedId, !!g.items[0].s.deal)}
            zIndexOffset={g.items[0].s.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(g.items[0].s.id) }}
            title={g.items[0].s.name}
            alt={g.items[0].s.name}
            keyboard
          />
        ) : (
          <Marker
            key={g.items.map((i) => i.s.id).join(',')}
            position={[g.lat, g.lng]}
            icon={clusterIcon(g.items.length)}
            title={`${g.items.length} stations`}
            eventHandlers={{ click: () => map.flyTo([g.lat, g.lng], Math.min(zoom + 3, 15)) }}
          />
        ),
      )}
    </>
  );
}

export function StationMap({
  items,
  selectedId,
  onSelect,
  center,
  me,
  focus,
  className,
}: {
  items: Item[];
  selectedId?: string;
  onSelect: (id: string) => void;
  center: { lat: number; lng: number };
  me?: { lat: number; lng: number } | null;
  focus?: [number, number] | null;
  className?: string;
}) {
  const [tileError, setTileError] = useState(false);
  return (
    <div className={className} style={{ position: 'relative' }}>
      <MapContainer center={[center.lat, center.lng]} zoom={13} zoomControl={false} className="h-full w-full" attributionControl>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
          eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }}
        />
        <Resizer />
        <FlyTo center={focus ?? null} />
        <Markers items={items} selectedId={selectedId} onSelect={onSelect} />
        {me && <CircleMarker center={[me.lat, me.lng]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2F6FED', fillOpacity: 1 }} />}
      </MapContainer>
      {tileError && (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 z-[500] -translate-y-1/2 rounded-2xl bg-white/95 p-4 text-center text-[13px] text-ax-muted shadow-card">
          Map tiles couldn't load. Check your connection — the station list still works.
        </div>
      )}
    </div>
  );
}
