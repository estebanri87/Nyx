import { describe, expect, it } from 'vitest';
import { getClimateStatus } from '../utils/climateStatus';

describe('getClimateStatus', () => {
  it('uses the reported action when the integration provides one', () => {
    expect(getClimateStatus({ state: 'heat', attributes: { hvac_action: 'heating' } })).toEqual({
      translationKey: 'climate.action.heating',
      isHeating: true,
      isCooling: false,
    });
  });

  it('falls back to the selected mode instead of idle without an action', () => {
    expect(getClimateStatus({ state: 'heat', attributes: {} })).toEqual({
      translationKey: 'climate.hvac.heat',
      isHeating: true,
      isCooling: false,
    });
    expect(getClimateStatus({ state: 'heat_cool', attributes: {} }).translationKey).toBe(
      'climate.hvac.heatCool'
    );
  });

  it('reports off regardless of a stale action', () => {
    expect(getClimateStatus({ state: 'off', attributes: { hvac_action: 'heating' } })).toEqual({
      translationKey: 'climate.action.off',
      isHeating: false,
      isCooling: false,
    });
  });

  it('says unavailable or unknown instead of a mode', () => {
    expect(getClimateStatus({ state: 'unavailable', attributes: {} }).translationKey).toBe(
      'status.unavailable'
    );
    expect(getClimateStatus({ state: 'unknown', attributes: {} }).translationKey).toBe(
      'common.unknown'
    );
  });
});
