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

  it('asks again on a new connection after the old one closed', async () => {
    const closed = {
      sendMessagePromise: vi.fn(() => Promise.reject(new Error('Relay connection closed'))),
    };
    const fresh = {
      sendMessagePromise: vi.fn(async (msg) =>
        msg.type === 'recorder/statistics_during_period'
          ? { [msg.statistic_ids[0]]: [900, 880, 870, 0].map((max) => ({ max })) }
          : { [msg.entity_ids[0]]: [] }
      ),
    };
    const entities = { 'sensor.grid': sensor(0, 'W'), 'sensor.retry_power': sensor(0, 'W') };
    const config = {
      slots: { gridPower: 'sensor.grid' },
      devices: [{ entity: 'sensor.retry_power' }],
    };
    const { result, rerender } = renderHook(({ conn }) => useEnergyAdvice(entities, conn, config), {
      initialProps: { conn: closed },
    });
    await waitFor(() => expect(result.current.items[0].demandState).toBe('failed'));
    rerender({ conn: fresh });
    await waitFor(() => expect(result.current.items[0].demandW).toBe(900));
  });

  it('holds the dryer back until the washing machine has run', async () => {
    const hour = 60 * 60 * 1000;
    const now = Date.now();
    const runs = {
      'sensor.wash_power': [{ start: now - 30 * hour, max: 2400 }],
      'sensor.dry_power': [{ start: now - 5 * hour, max: 860 }],
    };
    const conn = {
      sendMessagePromise: vi.fn(async (msg) =>
        msg.type === 'recorder/statistics_during_period'
          ? {
              [msg.statistic_ids[0]]: [
                ...runs[msg.statistic_ids[0]],
                { start: now - 60 * hour, max: 2000 },
                { start: now - 61 * hour, max: 900 },
              ],
            }
          : { [msg.entity_ids[0]]: [] }
      ),
    };
    const entities = {
      'sensor.grid': sensor(4000, 'W'),
      'sensor.wash_power': sensor(0, 'W'),
      'sensor.dry_power': sensor(0, 'W'),
    };
    const config = {
      slots: { gridPower: 'sensor.grid' },
      devices: [
        { entity: 'sensor.wash_power', name: 'Waschmaschine' },
        { entity: 'sensor.dry_power', name: 'Trockner', after: 'sensor.wash_power' },
      ],
    };
    const { result } = renderHook(() => useEnergyAdvice(entities, conn, config));
    // The dryer ran after the last wash, so it waits.
    await waitFor(() => expect(result.current.items[1].demandState).toBe('done'));
    expect(result.current.items[1].status).toBe('waiting');
    expect(result.current.items[1].waitingFor).toBe('Waschmaschine');
  });

  it('keeps the washing machine running while it pauses', async () => {
    const conn = {
      sendMessagePromise: vi.fn(async (msg) =>
        msg.type === 'recorder/statistics_during_period'
          ? { [msg.statistic_ids[0]]: [2490, 2400, 2450, 0].map((max) => ({ max })) }
          : { [msg.entity_ids[0]]: [] }
      ),
    };
    const config = {
      slots: { gridPower: 'sensor.grid_pause' },
      devices: [{ entity: 'sensor.pause_power', name: 'Waschmaschine' }],
    };
    const running = {
      'sensor.grid_pause': sensor(0, 'W'),
      'sensor.pause_power': sensor(2100, 'W'),
    };
    const { result, rerender } = renderHook(
      ({ entities }) => useEnergyAdvice(entities, conn, config),
      {
        initialProps: { entities: running },
      }
    );
    expect(result.current.items[0].status).toBe('running');
    // Soaking: almost no power for a moment, but the programme is not over.
    rerender({ entities: { ...running, 'sensor.pause_power': sensor(2, 'W') } });
    expect(result.current.items[0].status).toBe('running');
  });
});
