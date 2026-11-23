// Pure helpers for planning appliances with the solar forecast: the expected
// surplus for today and tomorrow, how long an appliance runs, and the next
// window in which it gets enough sun. Kept free of React so they can be tested.

const HOUR = 60 * 60 * 1000;
export const PLAN_STEP_MS = 15 * 60 * 1000;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const toMs = (value) => (typeof value === 'number' ? value : Date.parse(value));

/**
 * Average PV power over time from Home Assistant's `energy/solar_forecast`
 * answer ({entryId: {wh_hours: {iso: Wh}}}), summed over all arrays. Each
 * value is the energy of the period ending at its timestamp; the power is
 * placed in the middle of that period. Each array has its own periods (its
 * own sunrise), so they are converted one by one and then added up on a
 * PLAN_STEP_MS grid. Returns sorted {t, w} points.
 */
export function forecastPower(forecasts) {
  const arrays = Object.values(forecasts || {})
    .map((entry) => {
      const values = Object.entries(entry?.wh_hours || {})
        .map(([iso, wh]) => ({ t: toMs(iso), wh }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.wh))
        .sort((a, b) => a.t - b.t);
      return values.map((p, i) => {
        const prev = values[i - 1];
        // The first period of a day starts at sunrise and is shorter than an hour.
        const length = prev && p.t - prev.t <= HOUR ? p.t - prev.t : HOUR;
        return { t: p.t - length / 2, w: (p.wh * HOUR) / length };
      });
    })
    .filter((points) => points.length);
  if (!arrays.length) return [];
  const first = Math.min(...arrays.map((points) => points[0].t)) - HOUR / 2;
  const last = Math.max(...arrays.map((points) => points[points.length - 1].t)) + HOUR / 2;
  const grid = [];
  for (let t = Math.floor(first / PLAN_STEP_MS) * PLAN_STEP_MS; t <= last; t += PLAN_STEP_MS) {
    grid.push({ t, w: arrays.reduce((sum, points) => sum + forecastAt(points, t), 0) });
  }
  return grid;
}

/** Forecast power at a moment, linear between the points, 0 outside them. */
export function forecastAt(points, t) {
  if (!points.length || t < points[0].t - HOUR / 2 || t > points[points.length - 1].t + HOUR / 2)
    return 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (t <= p.t) {
      const prev = points[i - 1];
      if (!prev || p.t - prev.t > HOUR * 1.5) return p.w * Math.max(0, 1 - (p.t - t) / (HOUR / 2));
      return prev.w + ((p.w - prev.w) * (t - prev.t)) / (p.t - prev.t);
    }
  }
  const last = points[points.length - 1];
  return last.w * Math.max(0, 1 - (t - last.t) / (HOUR / 2));
}

/**
 * Typical house load per hour of the day (local time) from hourly mean
 * statistics, e.g. the house sensor and the balcony plant behind the meter.
 * The median over the days keeps single appliance runs out of it.
 */
export function houseProfile(...rowSets) {
  const perHour = new Map();
  rowSets.forEach((rows) =>
    (rows || []).forEach((r) => {
      const t = toMs(r.start);
      if (!Number.isFinite(t) || !Number.isFinite(r.mean)) return;
      perHour.set(t, (perHour.get(t) || 0) + Math.max(0, r.mean));
    })
  );
  const byHour = Array.from({ length: 24 }, () => []);
  perHour.forEach((w, t) => byHour[new Date(t).getHours()].push(w));
  const profile = byHour.map(median);
  const known = profile.filter((v) => v !== null);
  if (!known.length) return null;
  const fallback = median(known);
  return profile.map((v) => (v === null ? fallback : v));
}

/**
 * Typical run of an appliance from 5-minute mean statistics: how long it runs
 * (median, rounded to 15 minutes) and how much it draws on average while
 * running, pauses included. Pauses up to `gapMs` belong to the same run.
 * The average matters for planning: a washing machine heats with 2.5 kW for
 * a few minutes only, the battery covers such a peak. Null with fewer than
 * two runs.
 */
export function runProfile(rows, runW, gapMs = 15 * 60 * 1000) {
  const FIVE_MIN = 5 * 60 * 1000;
  const sorted = (rows || [])
    .map((r) => ({ t: toMs(r.start), w: r.mean }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.w))
    .sort((a, b) => a.t - b.t);
  const runs = [];
  let first = null;
  let last = null;
  const close = () => {
    const inRun = sorted.filter((r) => r.t >= first && r.t <= last);
    const ms = last + FIVE_MIN - first;
    runs.push({ ms, averageW: inRun.reduce((sum, r) => sum + r.w, 0) / (ms / FIVE_MIN || 1) });
  };
  sorted
    .filter((r) => r.w >= runW)
    .forEach(({ t }) => {
      if (last !== null && t - last > gapMs + FIVE_MIN) {
        close();
        first = null;
      }
      if (first === null) first = t;
      last = t;
    });
  if (first !== null) close();
  const real = runs.filter((run) => run.ms >= 15 * 60 * 1000);
  if (real.length < 2) return null;
  return {
    minutes: Math.max(15, Math.round(median(real.map((run) => run.ms)) / 60000 / 15) * 15),
    averageW: Math.round(median(real.map((run) => run.averageW)) / 10) * 10,
  };
}

/** Midnight (local) of the day of `t`, plus `days`. */
export const dayStart = (t, days = 0) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
};

/**
 * Expected surplus from now until the end of tomorrow in PLAN_STEP_MS steps:
 * forecast PV minus the typical house load. Within the current hour the live
 * surplus counts, as it already knows the clouds of the moment.
 */
export function expectedSurplus({ forecast, profile, now, liveW = null }) {
  const series = [];
  const start = Math.floor(now / PLAN_STEP_MS) * PLAN_STEP_MS;
  for (let t = start; t < dayStart(now, 2); t += PLAN_STEP_MS) {
    const pv = forecastAt(forecast, t);
    const load = profile?.[new Date(t).getHours()] ?? 0;
    const w = Number.isFinite(liveW) && t - start < HOUR ? liveW : Math.max(0, pv - load);
    series.push({ t, w });
  }
  return series;
}

/**
 * When an appliance should run: the first period from `earliest` on in which
 * the expected surplus stays above its demand for its whole run time.
 * kind: now | today | tomorrow | none. `todayMin` tells how long today has
 * enough sun when that is too short.
 */
export function planDevice({ series, demandW, durationMin, now, earliest = now }) {
  if (!demandW || !series?.length) return null;
  const need = (durationMin || 60) * 60 * 1000;
  const periods = [];
  let open = null;
  series.forEach((s, i) => {
    const ok = s.t >= earliest - PLAN_STEP_MS && s.w >= demandW;
    if (ok && open === null) open = s.t;
    const end = s.t + PLAN_STEP_MS;
    const next = series[i + 1];
    const closes = !ok || !next || dayStart(next.t) !== dayStart(s.t);
    if (open !== null && closes) {
      periods.push({ start: Math.max(open, earliest), end: ok ? end : s.t });
      open = null;
    }
  });
  const tomorrow = dayStart(now, 1);
  const fit = periods.find((p) => p.end - p.start >= need);
  const todayLongest = periods
    .filter((p) => p.start < tomorrow)
    .reduce((max, p) => Math.max(max, p.end - p.start), 0);
  if (!fit) return { kind: 'none', todayMin: Math.round(todayLongest / 60000) };
  const kind =
    fit.start >= tomorrow ? 'tomorrow' : fit.start <= now + PLAN_STEP_MS ? 'now' : 'today';
  return {
    kind,
    start: fit.start,
    end: fit.end,
    todayMin: kind === 'tomorrow' ? Math.round(todayLongest / 60000) : null,
  };
}

// Forecast.Solar creates one set of sensors per array, numbered _2, _3, …
export const FORECAST_TODAY = /^sensor\.energy_production_today_remaining(_\d+)?$/;
export const FORECAST_TODAY_TOTAL = /^sensor\.energy_production_today(_\d+)?$/;
export const FORECAST_TOMORROW = /^sensor\.energy_production_tomorrow(_\d+)?$/;

/** Sum of all Forecast.Solar arrays in kWh, or null without any. */
export function forecastKwh(entities, pattern) {
  const values = Object.entries(entities || {})
    .filter(([id]) => pattern.test(id))
    .map(([, e]) => Number(e?.state))
    .filter(Number.isFinite);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}
