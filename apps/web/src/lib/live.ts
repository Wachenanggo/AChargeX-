/** Shared Server-Sent Events connection with typed subscribers. */
import { useEffect, useRef } from 'react';
import type { StationWithDetail, Connector, Charger, ChargingSession, PaymentTransaction, CommandResult, Alert, OcppLogEntry, Vehicle } from '@achargex/shared';
import { eventsUrl } from './api';

export type LiveEvent =
  | { type: 'station'; station: StationWithDetail }
  | { type: 'connector'; stationId: string; connector: Connector }
  | { type: 'charger'; stationId: string; charger: Charger }
  | { type: 'session'; session: ChargingSession }
  | { type: 'payment'; payment: PaymentTransaction }
  | { type: 'command'; command: CommandResult }
  | { type: 'alert'; alert: Alert }
  | { type: 'log'; entry: OcppLogEntry }
  | { type: 'vehicles'; userId: string; vehicles: Vehicle[] };

type Sub = (e: LiveEvent) => void;
const subs = new Set<Sub>();
let es: EventSource | null = null;
let key = '';
let withLog = false;

async function connect() {
  const url = await eventsUrl(withLog);
  if (es && url === key) return;
  es?.close();
  key = url;
  es = new EventSource(url);
  es.onmessage = (m) => {
    try {
      const e = JSON.parse(m.data) as LiveEvent;
      for (const s of subs) s(e);
    } catch {
      /* ignore */
    }
  };
}

/** Reconnect (e.g. after role/sign-in changes). */
export function reconnectLive() {
  key = '';
  if (subs.size) void connect();
}

export function useLive(handler: Sub, opts: { log?: boolean } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s: Sub = (e) => ref.current(e);
    subs.add(s);
    if (opts.log && !withLog) {
      withLog = true;
      key = '';
    }
    void connect();
    return () => {
      subs.delete(s);
      if (!subs.size) {
        es?.close();
        es = null;
        key = '';
        withLog = false;
      }
    };
  }, [opts.log]);
}
