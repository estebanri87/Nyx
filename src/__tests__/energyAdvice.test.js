import { describe, expect, it } from 'vitest';
import {
  buildSurplusSamples,
  computeSurplus,
  learnDemand,
  recommendDevices,
  windowAverage,
} from '../components/pages/energy/energyAdvice';

describe('computeSurplus', () => {
  // Real snapshot: export 528 W, battery charging 2828 W at 91 %.
  const snapshot = { grid: 528, battery: -2828, soc: 91, battThreshold: 90 };

  it('counts battery charging once the battery is nearly full', () => {
    expect(computeSurplus(snapshot).surplusW).toBe(3356);
  });

  it('lets the battery fill first below the threshold', () => {
    const result = computeSurplus({ ...snapshot, soc: 60 });
    expect(result.surplusW).toBe(528);
    expect(result.battCounts).toBe(false);
  });

  it('has no surplus while drawing from the grid', () => {
    expect(computeSurplus({ grid: -400, battery: 300, soc: 95, battThreshold: 90 }).surplusW).toBe(
      0
    );
  });
});

describe('learnDemand', () => {
  it('takes the level the appliance stays below 90 % of its running time', () => {
    // Washing machine: mostly low spin phases, some heating at about 2.1 kW.
    const means = [6, 6, 350, 340, 360, 2130, 2100, 380, 2150, 400, 6];
    expect(learnDemand(means, 50)).toBe(2150);
  });

  it('waits for enough running samples', () => {
    expect(learnDemand([6, 6, 900, 6], 50)).toBeNull();
  });
});

describe('surplus over time', () => {
  it('combines grid and battery history into surplus steps', () => {
    const grid = [
      { t: 0, v: 500 },
      { t: 60, v: 100 },
    ];
    const batt = [{ t: 30, v: -1000 }];
    const samples = buildSurplusSamples(grid, batt, { soc: 95, battThreshold: 90 });
    expect(samples).toEqual([
      { t: 0, w: 500 },
      { t: 30, w: 1500 },
      { t: 60, w: 1100 },
    ]);
  });

  it('averages over the window by time', () => {
    const samples = [
      { t: 0, w: 1000 },
      { t: 50, w: 3000 },
    ];
    const { average, coveredMs } = windowAverage(samples, 100, 100);
    expect(average).toBe(2000);
    expect(coveredMs).toBe(100);
  });
});

describe('recommendDevices', () => {
  const devices = [
    { id: 'wm', name: 'Waschmaschine', powerW: 6, demandW: 2130 },
    { id: 'tr', name: 'Trockner', powerW: 0, demandW: 760 },
    { id: 'sp', name: 'Spülmaschine', powerW: 1900, demandW: 2130 },
    { id: 'kf', name: 'Kochfeld', powerW: 0, demandW: 3500 },
    { id: 'neu', name: 'Neu', powerW: 0, demandW: null },
  ];

  it('hands out the surplus in order and skips running appliances', () => {
    const items = recommendDevices({ surplusW: 3356, devices, runW: 50 });
    expect(items.map((i) => [i.id, i.status])).toEqual([
      ['wm', 'fits'],
      ['tr', 'fits'],
      ['sp', 'running'],
      ['kf', 'short'],
      ['neu', 'learning'],
    ]);
    expect(items[3].missingW).toBe(3500 - (3356 - 2130 - 760));
  });

  it('recommends nothing without surplus', () => {
    const items = recommendDevices({ surplusW: 0, devices, runW: 50 });
    expect(items.some((i) => i.status === 'fits')).toBe(false);
  });
});
