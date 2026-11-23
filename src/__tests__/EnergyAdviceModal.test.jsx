import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnergyAdviceModal from '../components/pages/energy/EnergyAdviceModal';
import de from '../i18n/de.json';

const t = (key) => de[key] ?? key;
const sensor = (state, unit) => ({
  state: String(state),
  attributes: unit ? { unit_of_measurement: unit } : {},
});

const advice = {
  advice: { battThreshold: 10, stableMinutes: 10, runW: 50 },
  soc: 24,
  exportW: 200,
  chargeW: 2800,
  battCounts: true,
  usableW: 3000,
  items: [
    { id: 'sp', name: 'Spülmaschine', status: 'fits', demandW: 2150, suggestedSince: Date.now() },
    {
      id: 'wm',
      name: 'Waschmaschine',
      status: 'alternative',
      demandW: 2490,
      insteadOf: ['Spülmaschine'],
    },
  ],
};

describe('EnergyAdviceModal', () => {
  it('shows surplus, history with demand lines, appliances and the forecast', async () => {
    const now = Date.now();
    const conn = {
      sendMessagePromise: vi.fn(async (msg) => ({
        [msg.entity_ids[0]]:
          msg.entity_ids[0] === 'sensor.grid'
            ? [{ s: '2500', lu: (now - 60 * 60 * 1000) / 1000 }]
            : [],
      })),
    };
    const entities = {
      'sensor.grid': sensor(200, 'W'),
      'sensor.batt': sensor(-2800, 'W'),
      'sensor.energy_production_today_remaining_3': sensor(3.5, 'kWh'),
      'sensor.energy_production_today_remaining_4': sensor(3, 'kWh'),
      'sensor.energy_production_tomorrow_3': sensor(8, 'kWh'),
    };
    render(
      <EnergyAdviceModal
        show
        onClose={vi.fn()}
        advice={advice}
        config={{ slots: { gridPower: 'sensor.grid', battPower: 'sensor.batt' } }}
        entities={entities}
        conn={conn}
        locale="de-DE"
        label="Spülmaschine oder Waschmaschine"
        t={t}
        onOpenPage={vi.fn()}
      />
    );
    expect(screen.getByText('Spülmaschine oder Waschmaschine')).toBeTruthy();
    expect(screen.getByText('Oder statt Spülmaschine')).toBeTruthy();
    expect(screen.getByText(/passt seit 1 min/)).toBeTruthy();
    // Forecast.Solar arrays are added up.
    expect(screen.getByText('Noch 6,5 kWh heute · morgen 8 kWh')).toBeTruthy();
    expect(await screen.findByText('Waschmaschine 2,5 kW')).toBeTruthy();
  });
});
