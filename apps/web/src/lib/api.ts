import { API_URL } from './config';
import { supabase } from './supabase';
import type { Role } from '@achargex/shared';

/** Demo role used in DEMO mode only (set by AuthProvider). */
let demoRole: Role = 'guest';
export function setDemoRole(r: Role) {
  demoRole = r;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class OfflineError extends Error {
  constructor() {
    super('The AChargeX service is unreachable.');
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (t) return { Authorization: `Bearer ${t}` };
  }
  return { 'x-demo-role': demoRole };
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new OfflineError();
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    // e.g. static host returned index.html because no API is deployed
    throw new OfflineError();
  }
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function eventsUrl(withLog = false): Promise<string> {
  const qs = new URLSearchParams();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) qs.set('token', data.session.access_token);
  }
  if (!qs.has('token')) qs.set('role', demoRole);
  if (withLog) qs.set('log', '1');
  return `${API_URL}/api/events?${qs}`;
}

export function idempotencyKey(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return 'ik_' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
