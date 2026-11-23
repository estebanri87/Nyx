import { describe, expect, it } from 'vitest';
import {
  dayStart,
  expectedSurplus,
  forecastAt,
  forecastPower,
  houseProfile,
  planDevice,
  runDuration,
} from '../components/pages/energy/energyPlan';

const HOUR = 60 * 60 * 1000;
const at = (day, h, m = 0) => {
  const d = new Date(2026, 10, 24 + day, h, m, 0, 0);
  return d.getTime();
};

describe('forecastPower', () => {
  it('adds up all arrays and turns Wh per period into W', () => {
    const forecasts = {
      a: { wh_hours: { [new Date(at(0, 12)).toISOString()]: 1000 } },
      b: {
        wh_hours: {
          [new Date(at(0, 11)).toISOString()]: 200,
          [new Date(at(0, 12)).toISOString()]: 500,
        },
      },
    };
    const points = forecastPower(forecasts);
    // 12:00 covers 11:00–12:00 and sits at 11:30.
    expect(points[points.length - 1]).toEqual({ t: at(0, 11, 30), w: 1500 });
    expect(forecastAt(points, at(0, 11, 30))).toBe(1500);
    expect(forecastAt(points, at(0, 20))).toBe(0);
  });
});

describe('houseProfile', () => {
  it('takes the median per hour so single appliance runs do not count', () => {
    const rows = [0, 1, 2].map((day) => ({ start: at(day - 3, 12), mean: day === 1 ? 2500 : 400 }));
    const bkw = [0, 1, 2].map((day) => ({ start: at(day - 3, 12), mean: 100 }));
    expect(houseProfile(rows, bkw)[12]).toBe(500);
  });

  it('knows nothing without statistics', () => {
    expect(houseProfile([], [])).toBeNull();
  });
});

describe('runDuration', () => {
  it('measures the typical run, pauses included', () => {
    const run = (startH, minutes, pauseAt = null) =>
      Array.from({ length: minutes / 5 }, (_, i) => ({
        start: at(-2, startH) + i * 5 * 60 * 1000,
        mean: pauseAt !== null && i === pauseAt ? 3 : 2000,
      }));
    const rows = [...run(8, 120, 10), ...run(14, 115), ...run(18, 130)];
    expect(runDuration(rows, 50)).toBe(120);
  });

  it('needs at least two runs', () => {
    expect(runDuration([{ start: at(0, 8), mean: 2000 }], 50)).toBeNull();
  });
});

describe('planDevice', () => {
  // Sunny 10–14 today with 3 kW, tomorrow 9–15 with 4 kW.
  const forecast = [];
  for (let h = 9; h <= 15; h += 1) {
    forecast.push({ t: at(0, h, 30), w: h >= 10 && h < 14 ? 3000 : 500 });
    forecast.push({ t: at(1, h, 30), w: h >= 9 && h < 15 ? 4000 : 500 });
  }
  forecast.sort((a, b) => a.t - b.t);
  const profile = Array(24).fill(0);

  it('starts now when the sun lasts for the whole run', () => {
    const now = at(0, 10, 30);
    const series = expectedSurplus({ forecast, profile, now });
    const plan = planDevice({ series, demandW: 2200, durationMin: 90, now });
    expect(plan.kind).toBe('now');
    expect(plan.end).toBeGreaterThan(at(0, 13));
  });

  it('moves a big load to tomorrow when today is too short', () => {
    const now = at(0, 12, 30);
    const series = expectedSurplus({ forecast, profile, now });
    const plan = planDevice({ series, demandW: 2500, durationMin: 120, now });
    expect(plan.kind).toBe('tomorrow');
    expect(plan.start).toBeGreaterThanOrEqual(dayStart(now, 1));
    expect(plan.todayMin).toBeGreaterThan(0);
  });

  it('waits for an appliance that has to run first', () => {
    const now = at(0, 9);
    const series = expectedSurplus({ forecast, profile, now });
    const plan = planDevice({
      series,
      demandW: 900,
      durationMin: 60,
      now,
      earliest: at(0, 12, 30),
    });
    expect(plan.kind).toBe('today');
    expect(plan.start).toBe(at(0, 12, 30));
  });

  it('finds nothing without enough sun', () => {
    const now = at(0, 9);
    const series = expectedSurplus({ forecast, profile, now });
    expect(planDevice({ series, demandW: 5000, durationMin: 60, now }).kind).toBe('none');
  });

  it('uses the live surplus within the current hour', () => {
    const now = at(0, 9, 5);
    const series = expectedSurplus({ forecast, profile, now, liveW: 2800 });
    expect(series[0].w).toBe(2800);
    expect(series.find((s) => s.t >= now + HOUR + 15 * 60 * 1000).w).not.toBe(2800);
  });
});
