import { useEffect, useState } from 'react';
import { getHistory, getStatistics } from '../../../services/haClient';
import {
  ADVICE_DEFAULTS,
  DEMAND_LOOKBACK_DAYS,
  RUN_HOLD_MS,
  buildSurplusSamples,
  computeSurplus,
  lastRunFrom,
  learnDemand,
  prerequisiteMet,
  recommendDevices,
  windowAverage,
} from './energyAdvice';
import { readNumber, readPowerW } from './energyModel';

const DEMAND_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 30 * 1000;
// The live value is smoothed over this window so single readings do not
// switch a suggestion on and off.
const SMOOTH_MS = 2 * 60 * 1000;

// Shared between the energy page and the status pill, so both agree and the
// history is only read once per session.
const surplusSamples = new Map(); // setup key -> [{t, w}]
// entity id -> {value, lastRun, at, state: pending|done|failed, conn, error}
const learnedDemand = new Map();
// entity id -> last time (ms) the appliance was seen running in this session;
// the hourly statistics only cover finished hours.
const seenRunning = new Map();
// Appliances suggested on the last render; they keep it within HOLD_MARGIN.
const heldSuggestions = new Set();
// entity id -> since when (ms) the appliance has been suggested without a break.
const suggestedSince = new Map();

/** History rows from Home Assistant as sorted {t, v} points. */
export const toPoints = (rows) =>
  (rows || [])
    .map((row) => {
      const raw = row.state !== undefined ? row.state : row.s;
      const t = row.last_changed ? Date.parse(row.last_changed) : (row.lc || row.lu) * 1000;
      return { t, v: Number(raw) };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);

/** Appliance recommendations for an energy page config (see EnergyConfigPanel). */
export function useEnergyAdvice(entities, conn, config) {
  const advice = { ...ADVICE_DEFAULTS, ...(config?.advice || {}) };
  const slots = config?.slots || {};
  const devices = (config?.devices || []).filter((d) => d && d.entity);
  const windowMs = advice.stableMinutes * 60 * 1000;
  const opts = {
    battThreshold: advice.battThreshold,
    soc: readNumber(entities, slots.battSoc),
    invertGrid: !!config?.invertGrid,
    invertBattery: !!config?.invertBattery,
  };
  const key = `${slots.gridPower}|${slots.battPower}|${opts.battThreshold}|${opts.invertGrid}|${opts.invertBattery}`;
  const current = computeSurplus({
    ...opts,
    grid: readPowerW(entities, slots.gridPower),
    battery: readPowerW(entities, slots.battPower),
  });
  const [, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const enabled = devices.length > 0 && !!slots.gridPower;

  // Seed the surplus history once, so a fresh page can judge stability at once.
  useEffect(() => {
    if (!enabled || !conn || surplusSamples.has(key)) return undefined;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getTime() - windowMs - 60 * 1000);
    const read = (entityId) =>
      entityId
        ? getHistory(conn, { entityId, start, end, minimal_response: true }).then(toPoints)
        : Promise.resolve([]);
    Promise.all([read(slots.gridPower), read(slots.battPower)])
      .then(([grid, batt]) => {
        if (cancelled || surplusSamples.has(key)) return;
        surplusSamples.set(key, buildSurplusSamples(grid, batt, opts));
        setVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // opts and slot ids are part of `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, conn, key, windowMs]);

  // Record every new surplus value.
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const list = surplusSamples.get(key) || [];
    const last = list[list.length - 1];
    if (!last || last.w !== current.surplusW) list.push({ t: now, w: current.surplusW });
    const keepFrom = now - 2 * windowMs;
    while (list.length > 1 && list[1].t < keepFrom) list.shift();
    surplusSamples.set(key, list);
  }, [enabled, key, current.surplusW, windowMs]);

  // Learn each appliance's demand from its own power statistics.
  const deviceIds = devices.map((d) => d.entity).join(',');
  useEffect(() => {
    if (!conn || !deviceIds) return undefined;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getTime() - DEMAND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    let retryTimer = null;
    deviceIds.split(',').forEach((statisticId) => {
      const known = learnedDemand.get(statisticId);
      const age = known ? Date.now() - known.at : Infinity;
      // A request in flight on this connection, a fresh result or a recent
      // failure on this connection is kept; a new connection retries at once.
      if (known?.state === 'pending' && known.conn === conn) return;
      if (known?.state === 'done' && age < DEMAND_MAX_AGE_MS) return;
      if (known?.state === 'failed' && known.conn === conn && age < RETRY_MS) return;
      learnedDemand.set(statisticId, {
        ...known,
        at: Date.now(),
        conn,
        state: known?.state === 'done' ? 'done' : 'pending',
      });
      getStatistics(conn, { statisticId, start, end, period: 'hour', types: ['max'] })
        .then((rows) => {
          learnedDemand.set(statisticId, {
            value: learnDemand(
              rows.map((r) => r.max),
              advice.runW
            ),
            lastRun: lastRunFrom(rows, advice.runW),
            at: Date.now(),
            conn,
            state: 'done',
          });
          if (!cancelled) setVersion((v) => v + 1);
        })
        .catch((err) => {
          const error =
            err?.message || err?.error || (err?.code ? `code ${err.code}` : String(err));
          learnedDemand.set(statisticId, {
            ...learnedDemand.get(statisticId),
            at: Date.now(),
            conn,
            state: 'failed',
            error,
          });
          if (cancelled) return;
          setVersion((v) => v + 1);
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => setRetry((r) => r + 1), RETRY_MS);
        });
    });
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [conn, deviceIds, advice.runW, retry]);

  // Remember when each appliance was last seen running.
  const now = Date.now();
  devices.forEach((d) => {
    if ((readPowerW(entities, d.entity) || 0) >= advice.runW) seenRunning.set(d.entity, now);
  });
  const lastRun = (id) => {
    const values = [learnedDemand.get(id)?.lastRun, seenRunning.get(id)].filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  };
  // Running, or paused for a moment within RUN_HOLD_MS of the last run.
  const isRunning = (id) =>
    (readPowerW(entities, id) || 0) >= advice.runW ||
    now - (seenRunning.get(id) ?? -Infinity) < RUN_HOLD_MS;
  const nameOf = (d) => d.name || entities?.[d.entity]?.attributes?.friendly_name || d.entity;

  const samples = surplusSamples.get(key) || [];
  const { average, coveredMs } = windowAverage(samples, now, windowMs);
  const stable = average !== null && coveredMs >= windowMs * 0.8;
  const smoothed = windowAverage(samples, now, SMOOTH_MS).average ?? current.surplusW;
  const usableW = Math.round(stable ? Math.min(smoothed, average) : smoothed);

  const items = recommendDevices({
    surplusW: usableW,
    runW: advice.runW,
    held: heldSuggestions,
    devices: devices.map((d) => {
      const other = d.after ? devices.find((o) => o.entity === d.after) : null;
      const waiting =
        other &&
        !prerequisiteMet({
          otherLastRun: lastRun(other.entity),
          otherRunning: isRunning(other.entity),
          ownLastRun: lastRun(d.entity),
          now,
        });
      return {
        id: d.entity,
        name: nameOf(d),
        waitingFor: waiting ? nameOf(other) : null,
        powerW: readPowerW(entities, d.entity),
        running: isRunning(d.entity),
        demandW: learnedDemand.get(d.entity)?.value ?? null,
        demandState: learnedDemand.get(d.entity)?.state ?? 'pending',
        demandError: learnedDemand.get(d.entity)?.error ?? null,
      };
    }),
  });

  items.forEach((i) => {
    if (i.status === 'fits' || i.status === 'alternative') {
      heldSuggestions.add(i.id);
      if (!suggestedSince.has(i.id)) suggestedSince.set(i.id, now);
      i.suggestedSince = suggestedSince.get(i.id);
    } else {
      heldSuggestions.delete(i.id);
      suggestedSince.delete(i.id);
    }
  });

  return {
    enabled,
    advice,
    soc: opts.soc,
    exportW: current.exportW,
    chargeW: current.chargeW,
    battCounts: current.battCounts,
    usableW,
    items,
    fitting: items.filter((i) => i.status === 'fits'),
    alternatives: items.filter((i) => i.status === 'alternative'),
  };
}
