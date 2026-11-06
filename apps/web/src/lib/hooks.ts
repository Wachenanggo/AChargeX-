import { useCallback, useEffect, useRef, useState } from 'react';
import { api, OfflineError } from './api';

export interface Query<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  offline: boolean;
  reload: () => void;
  setData: (fn: (d: T | undefined) => T | undefined) => void;
}

/** Minimal data hook: fetch on mount / dependency change, with manual setData for live patches. */
export function useApi<T>(path: string | null, deps: unknown[] = []): Query<T> {
  const [data, setDataState] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    api<T>(path, { signal: ctl.signal })
      .then((d) => {
        if (!mounted.current) return;
        setDataState(d);
        setError(undefined);
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError' || !mounted.current) return;
        setError(e as Error);
      })
      .finally(() => mounted.current && setLoading(false));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((fn: (d: T | undefined) => T | undefined) => setDataState((d) => fn(d)), []);
  return { data, error, loading, offline: error instanceof OfflineError, reload, setData };
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(key, JSON.stringify(nv));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set];
}
