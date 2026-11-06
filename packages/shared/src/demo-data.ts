/**
 * DEMO dataset. Fictional stations used when no real data source is connected.
 * Every record is flagged isDemo / isSimulated and must be labelled DEMO in the UI.
 * Charger identities use the SIM- prefix so they can never be confused with real chargers.
 */
import type { Station, Charger, Connector, Tariff, StationWithDetail, Vehicle, ConnectorType, CurrentType } from './types';

const NOW = '2026-01-01T00:00:00.000Z';

interface Seed {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  is24h: boolean;
  hours: string;
  deal?: { title: string; detail: string };
  amenities: string[];
  chargers: { code: string; connectors: { type: ConnectorType; current: CurrentType; kw: number; price: number }[] }[];
  listingStatus?: Station['listingStatus'];
  ownerId?: string;
}

const SEEDS: Seed[] = [
  {
    id: 'stn-matina',
    name: 'Matina Crossing Hub',
    address: 'Quimpo Blvd, Matina',
    city: 'Davao City',
    lat: 7.0601,
    lng: 125.5958,
    is24h: true,
    hours: 'Open 24 hours',
    deal: { title: '10% off DC charging', detail: 'on weekday mornings' },
    amenities: ['Restrooms', 'Food court', 'Covered parking'],
    chargers: [
      { code: 'MTN-B131', connectors: [{ type: 'CCS2', current: 'DC', kw: 60, price: 33.5 }, { type: 'CCS2', current: 'DC', kw: 60, price: 33.5 }] },
      { code: 'MTN-A022', connectors: [{ type: 'Type2', current: 'AC', kw: 22, price: 28.5 }] },
    ],
    ownerId: 'demo-owner',
  },
  {
    id: 'stn-lanang',
    name: 'Lanang Premier Charging',
    address: 'J.P. Laurel Ave, Lanang',
    city: 'Davao City',
    lat: 7.1007,
    lng: 125.6315,
    is24h: false,
    hours: '7:00 AM – 11:00 PM',
    amenities: ['Mall', 'Restrooms'],
    chargers: [
      { code: 'LNG-D101', connectors: [{ type: 'CCS2', current: 'DC', kw: 120, price: 36 }, { type: 'CHAdeMO', current: 'DC', kw: 50, price: 34 }] },
      { code: 'LNG-A201', connectors: [{ type: 'Type2', current: 'AC', kw: 7.4, price: 26 }] },
    ],
    ownerId: 'demo-owner',
  },
  {
    id: 'stn-buhangin',
    name: 'Buhangin EV Point',
    address: 'Buhangin Rd',
    city: 'Davao City',
    lat: 7.1124,
    lng: 125.6131,
    is24h: true,
    hours: 'Open 24 hours',
    amenities: ['Convenience store'],
    chargers: [{ code: 'BHN-A001', connectors: [{ type: 'Type2', current: 'AC', kw: 22, price: 27 }, { type: 'Type2', current: 'AC', kw: 22, price: 27 }] }],
  },
  {
    id: 'stn-bajada',
    name: 'Bajada Fast Charge',
    address: 'C.M. Recto St, Bajada',
    city: 'Davao City',
    lat: 7.0865,
    lng: 125.6122,
    is24h: false,
    hours: '6:00 AM – 10:00 PM',
    deal: { title: 'Free 15 min parking', detail: 'while charging' },
    amenities: ['Café'],
    chargers: [{ code: 'BJD-D050', connectors: [{ type: 'CCS2', current: 'DC', kw: 50, price: 32 }, { type: 'GBT', current: 'DC', kw: 40, price: 31 }] }],
  },
  {
    id: 'stn-toril',
    name: 'Toril Town Charging',
    address: 'Saavedra St, Toril',
    city: 'Davao City',
    lat: 7.0186,
    lng: 125.4983,
    is24h: false,
    hours: '8:00 AM – 8:00 PM',
    amenities: [],
    chargers: [{ code: 'TRL-A011', connectors: [{ type: 'Type2', current: 'AC', kw: 11, price: 25 }] }],
  },
  {
    id: 'stn-bgc',
    name: 'BGC High Street Supercharge',
    address: '5th Ave cor. 28th St, Bonifacio Global City',
    city: 'Taguig',
    lat: 14.5509,
    lng: 121.0509,
    is24h: true,
    hours: 'Open 24 hours',
    amenities: ['Mall', 'Restrooms', 'Food court'],
    chargers: [
      { code: 'BGC-D180', connectors: [{ type: 'CCS2', current: 'DC', kw: 180, price: 38 }, { type: 'CCS2', current: 'DC', kw: 180, price: 38 }] },
      { code: 'BGC-D060', connectors: [{ type: 'CHAdeMO', current: 'DC', kw: 50, price: 35 }] },
    ],
  },
  {
    id: 'stn-makati',
    name: 'Ayala Triangle Charging',
    address: 'Paseo de Roxas, Makati CBD',
    city: 'Makati',
    lat: 14.5571,
    lng: 121.0244,
    is24h: false,
    hours: '6:00 AM – 12:00 AM',
    amenities: ['Parking', 'Café'],
    chargers: [{ code: 'MKT-A022', connectors: [{ type: 'Type2', current: 'AC', kw: 22, price: 29 }, { type: 'Type2', current: 'AC', kw: 22, price: 29 }] }],
  },
  {
    id: 'stn-qc',
    name: 'QC Circle EV Plaza',
    address: 'Elliptical Rd, Diliman',
    city: 'Quezon City',
    lat: 14.6516,
    lng: 121.0493,
    is24h: true,
    hours: 'Open 24 hours',
    amenities: ['Park', 'Restrooms'],
    chargers: [{ code: 'QCC-D060', connectors: [{ type: 'CCS2', current: 'DC', kw: 60, price: 33 }, { type: 'Type2', current: 'AC', kw: 22, price: 27.5 }] }],
  },
  {
    id: 'stn-cebu',
    name: 'Cebu IT Park Charge Bay',
    address: 'Garden Bloc, Cebu IT Park',
    city: 'Cebu City',
    lat: 10.3299,
    lng: 123.9058,
    is24h: false,
    hours: '7:00 AM – 11:00 PM',
    amenities: ['Food court'],
    chargers: [{ code: 'CEB-D060', connectors: [{ type: 'CCS2', current: 'DC', kw: 60, price: 34 }] }],
  },
  {
    id: 'stn-pending',
    name: 'Ecoland Residences Charger',
    address: 'Ecoland Dr, Matina',
    city: 'Davao City',
    lat: 7.0532,
    lng: 125.5882,
    is24h: false,
    hours: '8:00 AM – 9:00 PM',
    amenities: [],
    chargers: [{ code: 'ECO-A007', connectors: [{ type: 'Type2', current: 'AC', kw: 7.4, price: 24 }] }],
    listingStatus: 'pending',
    ownerId: 'demo-owner',
  },
];

export function buildDemoNetwork(): StationWithDetail[] {
  return SEEDS.map((s) => {
    const tariffs: Tariff[] = [];
    const chargers: Charger[] = [];
    const connectors: Connector[] = [];
    for (const c of s.chargers) {
      const chargerId = `chg-${c.code.toLowerCase()}`;
      const approved = (s.listingStatus ?? 'approved') === 'approved';
      chargers.push({
        id: chargerId,
        stationId: s.id,
        ocppIdentity: `SIM-${c.code}`,
        vendor: 'AChargeX Simulator',
        model: c.connectors[0].current === 'DC' ? 'SimDC' : 'SimAC',
        isSimulated: true,
        connected: false,
        commissioned: approved,
      });
      c.connectors.forEach((k, i) => {
        const tariffId = `trf-${s.id}-${k.current}-${k.price}`;
        if (!tariffs.find((t) => t.id === tariffId)) {
          tariffs.push({ id: tariffId, pricePerKwh: k.price, idleFeePerMin: k.current === 'DC' ? 5 : undefined, idleGraceMin: 10 });
        }
        connectors.push({
          id: `con-${c.code.toLowerCase()}-${i + 1}`,
          chargerId,
          ocppConnectorId: i + 1,
          label: `AX-${c.code}-${i + 1}`,
          type: k.type,
          current: k.current,
          powerKw: k.kw,
          status: 'Unknown',
          statusUpdatedAt: NOW,
          tariffId,
        });
      });
    }
    return {
      id: s.id,
      ownerId: s.ownerId ?? 'owner-other',
      name: s.name,
      address: s.address,
      city: s.city,
      lat: s.lat,
      lng: s.lng,
      listingStatus: s.listingStatus ?? 'approved',
      openingHours: s.hours,
      is24h: s.is24h,
      access: 'public',
      amenities: s.amenities,
      deal: s.deal,
      isDemo: true,
      source: 'demo',
      updatedAt: NOW,
      chargers,
      connectors,
      tariffs,
    };
  });
}

/** Initial simulated connector states so the demo shows a realistic mix. */
export const DEMO_INITIAL_STATUS: Record<string, Connector['status']> = {
  'AX-MTN-B131-2': 'Charging',
  'AX-MTN-A022-1': 'Faulted',
  'AX-LNG-D101-2': 'Charging',
  'AX-BHN-A001-1': 'Charging',
  'AX-BHN-A001-2': 'Charging',
  'AX-MKT-A022-2': 'Reserved',
  'AX-TRL-A011-1': 'Unavailable',
};

export function demoVehicles(userId: string): Vehicle[] {
  return [
    { id: 'veh-1', userId, make: 'GAC', model: 'Aion UT', batteryKwh: 44, connectors: ['CCS2', 'Type2'], bodyType: 'hatch', plate: 'NEV 4417', isSelected: true },
    { id: 'veh-2', userId, make: 'BYD', model: 'Atto 3', batteryKwh: 60.5, connectors: ['CCS2', 'Type2'], bodyType: 'suv', isSelected: false },
  ];
}

export const VEHICLE_CATALOG: { make: string; model: string; batteryKwh: number; connectors: ConnectorType[]; bodyType: Vehicle['bodyType'] }[] = [
  { make: 'BYD', model: 'Atto 3', batteryKwh: 60.5, connectors: ['CCS2', 'Type2'], bodyType: 'suv' },
  { make: 'BYD', model: 'Dolphin', batteryKwh: 44.9, connectors: ['CCS2', 'Type2'], bodyType: 'hatch' },
  { make: 'BYD', model: 'Seal', batteryKwh: 82.5, connectors: ['CCS2', 'Type2'], bodyType: 'sedan' },
  { make: 'GAC', model: 'Aion UT', batteryKwh: 44, connectors: ['CCS2', 'Type2'], bodyType: 'hatch' },
  { make: 'GAC', model: 'Aion Y Plus', batteryKwh: 63.2, connectors: ['CCS2', 'Type2'], bodyType: 'suv' },
  { make: 'Hyundai', model: 'Ioniq 5', batteryKwh: 77.4, connectors: ['CCS2', 'Type2'], bodyType: 'suv' },
  { make: 'Kia', model: 'EV6', batteryKwh: 77.4, connectors: ['CCS2', 'Type2'], bodyType: 'suv' },
  { make: 'MG', model: 'MG4', batteryKwh: 64, connectors: ['CCS2', 'Type2'], bodyType: 'hatch' },
  { make: 'Nissan', model: 'Leaf', batteryKwh: 40, connectors: ['CHAdeMO', 'Type2'], bodyType: 'hatch' },
  { make: 'Tesla', model: 'Model 3', batteryKwh: 60, connectors: ['CCS2', 'Type2'], bodyType: 'sedan' },
  { make: 'Tesla', model: 'Model Y', batteryKwh: 75, connectors: ['CCS2', 'Type2'], bodyType: 'suv' },
  { make: 'VinFast', model: 'VF 5', batteryKwh: 37.2, connectors: ['CCS2', 'Type2'], bodyType: 'suv' },
  { make: 'Wuling', model: 'Bingo', batteryKwh: 37.9, connectors: ['CCS2', 'Type2'], bodyType: 'hatch' },
  { make: 'Jetour', model: 'Ice Cream', batteryKwh: 17.5, connectors: ['GBT', 'Type2'], bodyType: 'hatch' },
  { make: 'Generic', model: 'E-trike', batteryKwh: 7, connectors: ['Type2'], bodyType: 'trike' },
];

export const CONNECTOR_LABEL: Record<ConnectorType, string> = {
  CCS2: 'CCS2',
  Type2: 'Type 2',
  CHAdeMO: 'CHAdeMO',
  GBT: 'GB/T',
  CCS1: 'CCS1',
  Type1: 'Type 1',
};
