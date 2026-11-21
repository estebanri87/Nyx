// Pure helpers for appliance recommendations: how much solar power is spare,
// what each appliance needs (learned from its own power history) and which
// appliances fit right now. Kept free of React so they can be tested.

export const ADVICE_DEFAULTS = { battThreshold: 90, stableMinutes: 10, runW: 50 };

/** How far back an appliance's power statistics are read to learn its demand. */
export const DEMAND_LOOKBACK_DAYS = 10;

/**
 * Spare solar power in W: what goes to the grid, plus battery charging once
 * the battery is at least `battThreshold` % full. Below that the battery
 * should fill first. Sign conventions as in computeEnergyFlow.
 */
export function computeSurplus({
  grid = null,
  battery = null,
  soc = null,
  battThreshold = ADVICE_DEFAULTS.battThreshold,
  invertGrid = false,
  invertBattery = false,
}) {
  const g = grid === null ? 0 : invertGrid ? -grid : grid;
  const b = battery === null ? 0 : invertBattery ? -battery : battery;
  const exportW = Math.max(0, g);
  const chargeW = Math.max(0, -b);
  const battCounts = soc !== null && soc >= battThreshold;
  return { exportW, chargeW, battCounts, surplusW: exportW + (battCounts ? chargeW : 0) };
}

/**
 * Typical demand of an appliance from its 5-minute mean power values: the
 * value 90 % of its running time stays below, rounded to 10 W. Null until
 * there are at least three running samples.
 */
export function learnDemand(values, runW = ADVICE_DEFAULTS.runW) {
  const running = (values || [])
    .filter((v) => Number.isFinite(v) && v >= runW)
    .sort((a, b) => a - b);
  if (running.length < 3) return null;
  const p90 = running[Math.min(running.length - 1, Math.floor(running.length * 0.9))];
  return Math.round(p90 / 10) * 10;
}

/**
 * Surplus over time from grid and battery power histories ([{t, v}], sorted).
 * Each change of either value starts a new step.
 */
export function buildSurplusSamples(gridPoints, battPoints, opts) {
  const times = [...gridPoints.map((p) => p.t), ...battPoints.map((p) => p.t)].sort(
    (a, b) => a - b
  );
  const valueAt = (points, t) => {
    let value = null;
    for (const p of points) {
      if (p.t > t) break;
      value = p.v;
    }
    return value;
  };
  const samples = [];
  for (const t of times) {
    if (samples.length && samples[samples.length - 1].t === t) continue;
    const { surplusW } = computeSurplus({
      ...opts,
      grid: valueAt(gridPoints, t),
      battery: valueAt(battPoints, t),
    });
    samples.push({ t, w: surplusW });
  }
  return samples;
}

/**
 * Time-weighted mean of step samples ([{t, w}], sorted) over the window that
 * ends at `now`, and how much of the window the samples cover.
 */
export function windowAverage(samples, now, windowMs) {
  const start = now - windowMs;
  let total = 0;
  let covered = 0;
  samples.forEach((s, i) => {
    const from = Math.max(s.t, start);
    const to = i + 1 < samples.length ? Math.min(samples[i + 1].t, now) : now;
    if (to <= from) return;
    total += s.w * (to - from);
    covered += to - from;
  });
  return { average: covered > 0 ? total / covered : null, coveredMs: covered };
}

/**
 * Hand out the surplus to the appliances in their order. Running appliances
 * are skipped; one that fits takes its demand from what is left.
 */
export function recommendDevices({ surplusW, devices, runW = ADVICE_DEFAULTS.runW }) {
  let left = Math.max(0, surplusW || 0);
  return (devices || []).map((d) => {
    if ((d.powerW || 0) >= runW) return { ...d, status: 'running' };
    if (!d.demandW) return { ...d, status: 'learning' };
    if (d.demandW <= left) {
      left -= d.demandW;
      return { ...d, status: 'fits' };
    }
    return { ...d, status: 'short', missingW: d.demandW - left };
  });
}
