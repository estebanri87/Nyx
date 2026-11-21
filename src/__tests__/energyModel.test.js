import { describe, expect, it } from 'vitest';
import {
  applyAlias,
  computeAutarky,
  computeEnergyFlow,
  formatEntityState,
  normalizeEnergyConfig,
  readNumber,
} from '../components/pages/energy/energyModel';

describe('computeEnergyFlow', () => {
  // Real snapshot: PV 2433 W + balcony 200 W, battery charging 1159 W, export 180 W.
  const snapshot = { pv: 2433, bkw: 200, house: 1094, wp: 622, battery: -1159, grid: 180 };

  it('splits solar power into house, heating, battery and export', () => {
    const flow = computeEnergyFlow(snapshot);
    expect(flow.headline).toBe('only_sun');
    expect(flow.pvTotal).toBe(2633);
    expect(flow.houseTotal).toBe(1294);
    expect(flow.uses.map((u) => [u.key, u.w])).toEqual([
      ['house', 672],
      ['heat', 622],
      ['battery', 1159],
      ['grid', 180],
    ]);
    expect(flow.total).toBe(2633);
    expect(flow.uses.find((u) => u.key === 'battery').share).toBe(44);
  });

  it('leaves the balcony plant out of the house total when it is not behind the meter', () => {
    const flow = computeEnergyFlow({ ...snapshot, bkwBehindMeter: false });
    expect(flow.houseTotal).toBe(1094);
  });

  it('reports battery and grid as sources at night', () => {
    const flow = computeEnergyFlow({ pv: 0, house: 800, wp: 300, battery: 500, grid: -300 });
    expect(flow.headline).toBe('mixed');
    expect(flow.sources.map((s) => s.key)).toEqual(['battery', 'grid']);
    expect(flow.uses.map((u) => u.key)).toEqual(['house', 'heat']);
  });

  it('honours inverted sign conventions', () => {
    const flow = computeEnergyFlow({ pv: 0, house: 400, battery: -400, invertBattery: true });
    expect(flow.headline).toBe('only_battery');
    expect(flow.battDischarge).toBe(400);
  });

  it('ignores flows below the threshold', () => {
    const flow = computeEnergyFlow({ pv: 1000, house: 995, battery: -5, grid: 0 });
    expect(flow.uses.map((u) => u.key)).toEqual(['house']);
  });

  it('is idle when nothing flows', () => {
    expect(computeEnergyFlow({}).headline).toBe('idle');
  });
});

describe('energy helpers', () => {
  it('computes self-sufficiency from consumption and import', () => {
    expect(computeAutarky(13, 1.2)).toBe(91);
    expect(computeAutarky(0, 1)).toBeNull();
    expect(computeAutarky(10, null)).toBeNull();
  });

  it('reads numbers and rejects text states', () => {
    const entities = { 'sensor.a': { state: '12.5' }, 'sensor.b': { state: 'unavailable' } };
    expect(readNumber(entities, 'sensor.a')).toBe(12.5);
    expect(readNumber(entities, 'sensor.b')).toBeNull();
    expect(readNumber(entities, null)).toBeNull();
  });

  it('shows a renamed state instead of the raw Home Assistant value', () => {
    const aliases = [{ from: 'Nur Solar', to: 'Solar optimiert' }];
    expect(applyAlias('Nur Solar', aliases)).toBe('Solar optimiert');
    expect(formatEntityState({ state: 'Nur Solar', attributes: {} }, 'de-DE', aliases)).toBe(
      'Solar optimiert'
    );
    expect(
      formatEntityState({ state: '1.9', attributes: { unit_of_measurement: 'bar' } }, 'de-DE')
    ).toBe('1,9 bar');
    expect(formatEntityState({ state: 'unavailable', attributes: {} }, 'de-DE')).toBe('–');
  });

  it('normalizes a missing config to safe defaults', () => {
    const cfg = normalizeEnergyConfig(undefined);
    expect(cfg.slots).toEqual({});
    expect(cfg.strings).toEqual([]);
    expect(cfg.bkwBehindMeter).toBe(true);
  });
});
