// Pure helpers for appliance recommendations: how much solar power is spare,
// what each appliance needs (learned from its own power history) and which
// appliances fit right now. Kept free of React so they can be tested.

export const ADVICE_DEFAULTS = { battThreshold: 90, stableMinutes: 10, runW: 50 };

/** How far back an appliance's power statistics are read to learn its demand. */
export const DEMAND_LOOKBACK_DAYS = 30;

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
 * Typical peak demand of an appliance from its hourly maximum power values:
 * the value 90 % of its running hours stay below, rounded to 10 W. A single
 * spike does not decide it. Null until there are at least three running hours.
 */
export function learnDemand(values, runW = ADVICE_DEFAULTS.runW) {
  const running = (values || [])
    .filter((v) => Number.isFinite(v) && v >= runW)
    .sort((a, b) => a - b);
  if (running.length < 3) return null;
  const p90 = running[Math.min(running.length - 1, Math.floor(running.length * 0.9))];
  return Math.round(p90 / 10) * 10;
}

/** Start time (ms) of the latest statistics row in which the appliance ran. */
export function lastRunFrom(rows, runW = ADVICE_DEFAULTS.runW) {
  let last = null;
  (rows || []).forEach((r) => {
    if (!Number.isFinite(r?.max) || r.max < runW) return;
    const t = typeof r.start === 'number' ? r.start : Date.parse(r.start);
    if (Number.isFinite(t) && (last === null || t > last)) last = t;
  });
  return last;
}

/**
 * Whether an appliance that should only run after another one may be
 * suggested: the other one ran today or yesterday, has finished, and ran
 * after this appliance's own last run (so one wash means one dryer run).
 */
export function prerequisiteMet({ otherLastRun, otherRunning, ownLastRun, now }) {
  if (otherRunning || !otherLastRun) return false;
  const startOfYesterday = new Date(now);
  startOfYesterday.setHours(0, 0, 0, 0);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (otherLastRun < startOfYesterday.getTime()) return false;
  return !ownLastRun || otherLastRun > ownLastRun;
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

/** Share of its demand the surplus may drop below before a suggestion is withdrawn. */
export const HOLD_MARGIN = 0.1;

/**
 * Hand out the surplus to the appliances in their order. Running appliances
 * are skipped; one that fits takes its demand from what is left. One that
 * no longer fits but would fit on its own is an alternative to the ones
 * before it ("either … or"). Appliances in `held` were suggested a moment
 * ago and keep that until the surplus is HOLD_MARGIN below their demand, so
 * the suggestion does not flicker.
 */
export function recommendDevices({
  surplusW,
  devices,
  runW = ADVICE_DEFAULTS.runW,
  held = new Set(),
}) {
  const total = Math.max(0, surplusW || 0);
  const need = (d) => (held.has(d.id) ? d.demandW * (1 - HOLD_MARGIN) : d.demandW);
  let left = total;
  const fitting = [];
  return (devices || []).map((d) => {
    if ((d.powerW || 0) >= runW) return { ...d, status: 'running' };
    if (d.waitingFor) return { ...d, status: 'waiting' };
    if (!d.demandW) return { ...d, status: 'learning' };
    if (need(d) <= left) {
      left = Math.max(0, left - d.demandW);
      fitting.push(d);
      return { ...d, status: 'fits' };
    }
    if (need(d) <= total) {
      // Make room by dropping the lowest-priority suggestions first.
      let freed = left;
      const insteadOf = [];
      for (let i = fitting.length - 1; i >= 0 && freed < need(d); i -= 1) {
        freed += fitting[i].demandW;
        insteadOf.unshift(fitting[i].name);
      }
      return { ...d, status: 'alternative', insteadOf };
    }
    return { ...d, status: 'short', missingW: d.demandW - left };
  });
}
