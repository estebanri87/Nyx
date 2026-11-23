import { describe, expect, it } from 'vitest';
import {
  dayStart,
  expectedSurplus,
  forecastAt,
  forecastPower,
  houseProfile,
  planDevice,
  runProfile,
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
    // 12:00 covers 12:00–13:00 and sits at 12:30.
    expect(forecastAt(points, at(0, 12, 30))).toBe(1500);
    expect(forecastAt(points, at(0, 11, 30))).toBe(200);
    expect(forecastAt(points, at(0, 20))).toBe(0);
  });

  it('expects no sun before sunrise', () => {
    // Sunrise 07:50: 3 Wh until 08:00, then 300 Wh from 08:00 to 09:00.
    const iso = (h, m) => new Date(at(0, h, m)).toISOString();
    const points = forecastPower({
      a: { wh_hours: { [iso(7, 50)]: 3, [iso(8, 0)]: 300, [iso(9, 0)]: 900 } },
    });
    expect(forecastAt(points, at(0, 7, 30))).toBeLessThan(20);
    expect(forecastAt(points, at(0, 7, 55))).toBeLessThan(50);
    expect(forecastAt(points, at(0, 8, 30))).toBe(300);
  });

  it('keeps the short sunrise period of each array to itself', () => {
    // Five arrays with sunrise a few minutes apart. Mixing their timestamps
    // made the 08:00 values look like 5-minute periods: a false morning peak.
    const iso = (h, m) => new Date(at(0, h, m)).toISOString();
    const arrays = Object.fromEntries(
      [44, 47, 50, 52, 55].map((minute, i) => [
        `array${i}`,
        { wh_hours: { [iso(7, minute)]: 0, [iso(8, 0)]: 15, [iso(9, 0)]: 150 } },
      ])
    );
    const total = forecastPower(arrays);
    const single = Object.entries(arrays).map(([id, entry]) => forecastPower({ [id]: entry }));
    for (const t of [at(0, 7, 50), at(0, 7, 57), at(0, 8, 30), at(0, 9, 30)]) {
      const sum = single.reduce((s, points) => s + forecastAt(points, t), 0);
      expect(forecastAt(total, t)).toBeCloseTo(sum, 0);
    }
    expect(Math.max(...total.filter((p) => p.t < at(0, 8)).map((p) => p.w))).toBeLessThan(900);
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

describe('runProfile', () => {
  it('measures the typical run, pauses included', () => {
    const run = (startH, minutes, pauseAt = null) =>
      Array.from({ length: minutes / 5 }, (_, i) => ({
        start: at(-2, startH) + i * 5 * 60 * 1000,
        mean: pauseAt !== null && i === pauseAt ? 3 : 2000,
      }));
    const rows = [...run(8, 120, 10), ...run(14, 115), ...run(18, 130)];
    const profile = runProfile(rows, 50);
    expect(profile.minutes).toBe(120);
    // The pause lowers the first run's average; the median of the runs does not care.
    expect(profile.averageW).toBe(2000);
  });

  it('averages a washing machine far below its heating peak', () => {
    // Real 5-minute means of a wash: heating briefly, then about 350 W.
    const wash = [80, 348, 1627, 1697, 377, 372, 371, 391, 364, 389, 373, 360, 368, 299];
    const rest = [363, 310, 354, 299, 355, 288, 208];
    const day = (d) =>
      [...wash, ...rest].map((mean, i) => ({ start: at(d, 9) + i * 5 * 60 * 1000, mean }));
    const profile = runProfile([...day(-3), ...day(-1)], 50);
    expect(profile.minutes).toBe(105);
    expect(profile.averageW).toBeGreaterThan(400);
    expect(profile.averageW).toBeLessThan(600);
  });

  it('needs at least two runs', () => {
    expect(runProfile([{ start: at(0, 8), mean: 2000 }], 50)).toBeNull();
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
