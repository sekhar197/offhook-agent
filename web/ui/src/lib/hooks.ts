import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Fetch `fn` once, expose {data,error,loading,reload}. When `pollMs` is set,
 * re-fetch on that interval — used ONLY on read panels (calls/detail/scorecard/
 * keys/phone), never on Config or Improve (those are user-driven and would
 * clobber in-flight edits). Pauses while the tab is hidden.
 */
export function usePolling<T>(fn: () => Promise<T>, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!pollMs) return;
    let timer: number | undefined;
    const tick = () => {
      if (!document.hidden) load();
      timer = window.setTimeout(tick, pollMs);
    };
    timer = window.setTimeout(tick, pollMs);
    return () => window.clearTimeout(timer);
  }, [load, pollMs]);

  return { data, error, loading, reload: load };
}

/** Hash route, e.g. #/calls/abc → ['calls','abc']. */
export function useHashRoute(): [string[], (to: string) => void] {
  const [hash, setHash] = useState(() => location.hash || '#/overview');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/overview');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const nav = useCallback((to: string) => { location.hash = to; }, []);
  return [parts.length ? parts : ['overview'], nav];
}
