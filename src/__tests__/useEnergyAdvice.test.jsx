import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEnergyAdvice } from '../components/pages/energy/useEnergyAdvice';

const sensor = (state, unit) => ({
  state: String(state),
  attributes: unit ? { unit_of_measurement: unit } : {},
});

describe('useEnergyAdvice', () => {
  it('learns every appliance when they are added one after another', async () => {
    const peaks = { 'sensor.a_power': 2490, 'sensor.b_power': 870, 'sensor.c_power': 2150 };
    const conn = {
      sendMessagePromise: vi.fn(
        (msg) =>
          new Promise((resolve) => {
            setTimeout(() => {
              if (msg.type === 'recorder/statistics_during_period') {
                const id = msg.statistic_ids[0];
                resolve({
                  [id]: [peaks[id], peaks[id] - 20, peaks[id] - 40, 5].map((max) => ({ max })),
                });
              } else {
                resolve({ [msg.entity_ids[0]]: [] });
              }
            }, 20);
          })
      ),
    };
    const entities = {
      'sensor.grid': sensor(500, 'W'),
      'sensor.a_power': sensor(0, 'W'),
      'sensor.b_power': sensor(0, 'W'),
      'sensor.c_power': sensor(0, 'W'),
    };
    const configWith = (ids) => ({
      slots: { gridPower: 'sensor.grid' },
      devices: ids.map((entity) => ({ entity })),
    });

    const { result, rerender } = renderHook(
      ({ config }) => useEnergyAdvice(entities, conn, config),
      {
        initialProps: { config: configWith(['sensor.a_power']) },
      }
    );
    act(() => rerender({ config: configWith(['sensor.a_power', 'sensor.b_power']) }));
    act(() =>
      rerender({ config: configWith(['sensor.a_power', 'sensor.b_power', 'sensor.c_power']) })
    );

    await waitFor(() =>
      expect(result.current.items.map((i) => i.demandW)).toEqual([2490, 870, 2150])
    );
    expect(result.current.items.every((i) => i.demandState === 'done')).toBe(true);
  });
});
