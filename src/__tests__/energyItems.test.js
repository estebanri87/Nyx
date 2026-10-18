import { describe, expect, it } from 'vitest';
import {
  computeHomeConsumption,
  getItemStatus,
  getPowerDirection,
  getRenderableEnergyItems,
  resolveEnergyItemEntity,
} from '../components/cards/energyItems';

const translate = (key) =>
  ({ 'energyFlow.status.heating': 'Heizen', 'energyFlow.status.idle': 'Leerlauf' })[key] || key;

const power = (state, unit = 'W') => ({
  state: String(state),
  attributes: { unit_of_measurement: unit },
});

describe('getPowerDirection', () => {
  it('reads positive power as discharging and negative as charging', () => {
    expect(getPowerDirection(1200)).toBe('discharging');
    expect(getPowerDirection(-800)).toBe('charging');
  });

  it('treats small values and missing readings as idle', () => {
    expect(getPowerDirection(0)).toBe('idle');
    expect(getPowerDirection(5)).toBe('idle');
    expect(getPowerDirection(null)).toBe('idle');
  });

  it('flips the direction when inverted', () => {
    expect(getPowerDirection(1200, true)).toBe('charging');
    expect(getPowerDirection(-800, true)).toBe('discharging');
  });
});

describe('getItemStatus', () => {
  it('shows an arrow with the magnitude for a power sensor', () => {
    expect(getItemStatus(power(1250), {}, translate)).toMatchObject({
      text: '▼ 1.3 kW',
      statusKey: 'discharging',
    });
    expect(getItemStatus(power(-800), {}, translate)).toMatchObject({
      text: '▲ 800 W',
      statusKey: 'charging',
    });
  });

  it('shows the idle label instead of an arrow when nothing flows', () => {
    expect(getItemStatus(power(0), {}, translate)).toMatchObject({ text: 'Leerlauf' });
  });

  it('honours the invert flag', () => {
    expect(getItemStatus(power(800), { statusInvert: true }, translate)).toMatchObject({
      text: '▲ 800 W',
    });
  });

  it('translates known text states, case-insensitively', () => {
    expect(getItemStatus({ state: 'HEATING' }, {}, translate)).toMatchObject({
      text: 'Heizen',
      statusKey: 'heating',
    });
  });

  it('maps GoodWe grid and PV modes', () => {
    const t = (key) => ({ 'energyFlow.status.importing': 'Bezug' })[key] || key;
    expect(getItemStatus({ state: 'Importing' }, {}, t)).toMatchObject({
      text: 'Bezug',
      statusKey: 'importing',
    });
    expect(getItemStatus({ state: 'Exporting' }, {}, t).statusKey).toBe('exporting');
    expect(getItemStatus({ state: 'Idle' }, {}, t).statusKey).toBe('idle');
    expect(getItemStatus({ state: 'PV panels connected, producing power' }, {}, t).statusKey).toBe(
      'producing'
    );
    expect(getItemStatus({ state: 'PV panels not connected' }, {}, t).statusKey).toBe('inactive');
  });

  it('passes unknown text states through unchanged', () => {
    expect(getItemStatus({ state: 'Sparbetrieb' }, {}, translate)).toMatchObject({
      text: 'Sparbetrieb',
      statusKey: null,
    });
  });

  it('returns nothing for unavailable entities', () => {
    expect(getItemStatus({ state: 'unavailable' }, {}, translate)).toBeNull();
    expect(getItemStatus(undefined, {}, translate)).toBeNull();
  });
});

describe('computeHomeConsumption', () => {
  it('adds solar, grid import and battery discharge', () => {
    expect(computeHomeConsumption({ grid: 300, solar: 1200, battery: 100 })).toBe(1600);
  });

  it('subtracts export and battery charging', () => {
    expect(computeHomeConsumption({ grid: -500, solar: 2000, battery: -700 })).toBe(800);
  });

  it('never goes negative and needs at least one flow', () => {
    expect(computeHomeConsumption({ grid: -900, solar: 100, battery: null })).toBe(0);
    expect(computeHomeConsumption({ grid: null, solar: null, battery: null })).toBeNull();
  });
});

describe('calculated house items', () => {
  const entities = {
    'sensor.grid': power(300),
    'sensor.solar': power(1200),
    'sensor.battery': power(-200),
  };
  const home = {
    id: 'home',
    source: 'home',
    homeGridId: 'sensor.grid',
    homeSolarId: 'sensor.solar',
    homeBatteryId: 'sensor.battery',
  };

  it('resolves a stand-in power entity', () => {
    const entity = resolveEnergyItemEntity(home, entities);
    expect(entity.state).toBe('1300');
    expect(entity.attributes.unit_of_measurement).toBe('W');
  });

  it('is renderable without a sensor of its own, but needs a source', () => {
    expect(getRenderableEnergyItems([home], entities)).toHaveLength(1);
    expect(getRenderableEnergyItems([{ id: 'x', source: 'home' }], entities)).toHaveLength(0);
  });

  it('still requires an existing entity for plain sensor items', () => {
    const items = [
      { id: 'a', entityId: 'sensor.grid' },
      { id: 'b', entityId: 'sensor.missing' },
    ];
    expect(getRenderableEnergyItems(items, entities).map((item) => item.id)).toEqual(['a']);
  });
});
