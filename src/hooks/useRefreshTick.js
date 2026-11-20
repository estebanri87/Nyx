import { useEffect, useState } from 'react';

/**
 * A counter for effect dependencies, so fetched data stays current on a dashboard
 * that is never reloaded. It rises on a timer and whenever Home Assistant reconnects;
 * a reconnect keeps the same Connection object, so depending on `conn` alone misses it.
 * @param {any} conn
 * @param {{ enabled?: boolean, intervalMs?: number }} [options]
 * @returns {number}
 */
export function useRefreshTick(conn, { enabled = true, intervalMs } = {}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const bump = () => setTick((value) => value + 1);
    conn?.addEventListener?.('ready', bump);
    const timer = intervalMs ? setInterval(bump, intervalMs) : undefined;
    return () => {
      conn?.removeEventListener?.('ready', bump);
      if (timer) clearInterval(timer);
    };
  }, [conn, enabled, intervalMs]);

  return tick;
}
