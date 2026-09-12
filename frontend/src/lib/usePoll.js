import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook de polling simple. Ejecuta `fn` al montar y cada `intervalMs`.
 * Devuelve { data, error, loading, refresh }.
 * `enabled=false` frena el polling (pero deja el último dato).
 */
export default function usePoll(fn, intervalMs = 4000, deps = [], enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const savedFn = useRef(fn);
  savedFn.current = fn;

  const refresh = useCallback(async () => {
    try {
      const res = await savedFn.current();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, intervalMs, enabled]);

  return { data, error, loading, refresh };
}
