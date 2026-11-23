import { useEffect, useState } from 'react';
import { getStatistics } from '../../../services/haClient';
import { forecastPower, houseProfile, runDuration } from './energyPlan';

const FORECAST_MAX_AGE_MS = 30 * 60 * 1000;
const PROFILE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const PROFILE_DAYS = 14;
// Home Assistant keeps 5-minute statistics for 10 days by default.
const DURATION_DAYS = 10;

// Shared between the energy page and the pill, like the demand in useEnergyAdvice.
// key -> {value, at, conn, state: pending|done|failed}
const cache = new Map();

/** Load `key` with `load` unless this connection has a fresh result or a request running. */
function refresh(key, conn, maxAgeMs, load, onDone) {
  const known = cache.get(key);
  const age = known ? Date.now() - known.at : Infinity;
  if (known?.state === 'pending' && known.conn === conn) return;
  if (known?.state === 'done' && known.conn === conn && age < maxAgeMs) return;
  if (known?.state === 'failed' && known.conn === conn && age < RETRY_MS) return;
  cache.set(key, { ...known, at: Date.now(), conn, state: known?.value ? 'done' : 'pending' });
  load()
    .then((value) => cache.set(key, { value, at: Date.now(), conn, state: 'done' }))
    .catch(() => cache.set(key, { ...cache.get(key), at: Date.now(), conn, state: 'failed' }))
    .finally(onDone);
}

/**
 * Inputs for planning appliances with the solar forecast: the PV forecast of
 * all arrays in Home Assistant's energy dashboard, the typical house load per
 * hour, and each appliance's typical run time in minutes.
 */
export function useSolarPlan(conn, { houseId, bkwId, deviceIds, runW }) {
  const [, setVersion] = useState(0);
  const devicesKey = deviceIds.join(',');

  useEffect(() => {
    if (!conn || !devicesKey) return undefined;
    let cancelled = false;
    const done = () => !cancelled && setVersion((v) => v + 1);
    const now = Date.now();
    const days = (n) => new Date(now - n * 24 * 60 * 60 * 1000);

    refresh(
      'forecast',
      conn,
      FORECAST_MAX_AGE_MS,
      () => conn.sendMessagePromise({ type: 'energy/solar_forecast' }).then(forecastPower),
      done
    );
    if (houseId) {
      const hourly = (statisticId) =>
        statisticId
          ? getStatistics(conn, {
              statisticId,
              start: days(PROFILE_DAYS),
              end: new Date(now),
              period: 'hour',
              types: ['mean'],
            })
          : Promise.resolve([]);
      refresh(
        `profile|${houseId}|${bkwId || ''}`,
        conn,
        PROFILE_MAX_AGE_MS,
        () => Promise.all([hourly(houseId), hourly(bkwId)]).then(([h, b]) => houseProfile(h, b)),
        done
      );
    }
    devicesKey.split(',').forEach((statisticId) =>
      refresh(
        `duration|${statisticId}|${runW}`,
        conn,
        PROFILE_MAX_AGE_MS,
        () =>
          getStatistics(conn, {
            statisticId,
            start: days(DURATION_DAYS),
            end: new Date(now),
            period: '5minute',
            types: ['mean'],
          }).then((rows) => runDuration(rows, runW)),
        done
      )
    );
    return () => {
      cancelled = true;
    };
  }, [conn, houseId, bkwId, devicesKey, runW]);

  return {
    forecast: cache.get('forecast')?.value || null,
    profile: houseId ? cache.get(`profile|${houseId}|${bkwId || ''}`)?.value || null : null,
    durationOf: (id) => cache.get(`duration|${id}|${runW}`)?.value ?? null,
  };
}
