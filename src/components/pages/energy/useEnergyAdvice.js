import { useEffect, useState } from 'react';
import { getHistory, getStatistics } from '../../../services/haClient';
import {
  ADVICE_DEFAULTS,
  DEMAND_LOOKBACK_DAYS,
  buildSurplusSamples,
  computeSurplus,
  learnDemand,
  recommendDevices,
  windowAverage,
} from './energyAdvice';
import { readNumber, readPowerW } from './energyModel';

const DEMAND_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Shared between the energy page and the status pill, so both agree and the
// history is only read once per session.
const surplusSamples = new Map(); // setup key -> [{t, w}]
const learnedDemand = new Map(); // entity id -> {value, at}

const toPoints = (rows) =>
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
    deviceIds.split(',').forEach((statisticId) => {
      const known = learnedDemand.get(statisticId);
      if (known && Date.now() - known.at < DEMAND_MAX_AGE_MS) return;
      learnedDemand.set(statisticId, { value: known?.value ?? null, at: Date.now() });
      getStatistics(conn, { statisticId, start, end, period: '5minute', types: ['mean'] })
        .then((rows) => {
          const value = learnDemand(
            rows.map((r) => r.mean),
            advice.runW
          );
          learnedDemand.set(statisticId, { value, at: Date.now() });
          if (!cancelled) setVersion((v) => v + 1);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [conn, deviceIds, advice.runW]);

  const { average, coveredMs } = windowAverage(surplusSamples.get(key) || [], Date.now(), windowMs);
  const stable = average !== null && coveredMs >= windowMs * 0.8;
  const usableW = stable ? Math.min(current.surplusW, average) : current.surplusW;

  const items = recommendDevices({
    surplusW: usableW,
    runW: advice.runW,
    devices: devices.map((d) => ({
      id: d.entity,
      name: d.name || entities?.[d.entity]?.attributes?.friendly_name || d.entity,
      powerW: readPowerW(entities, d.entity),
      demandW: learnedDemand.get(d.entity)?.value ?? null,
    })),
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
  };
}
