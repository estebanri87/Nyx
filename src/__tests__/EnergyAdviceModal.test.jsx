import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnergyAdviceModal from '../components/pages/energy/EnergyAdviceModal';
import de from '../i18n/de.json';

const t = (key) => de[key] ?? key;
const sensor = (state, unit) => ({
  state: String(state),
  attributes: unit ? { unit_of_measurement: unit } : {},
});
const HOUR = 60 * 60 * 1000;
const tomorrowAt = (h) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};

describe('EnergyAdviceModal', () => {
  it('shows surplus, forecast chart, appliances with their plan and the forecast', async () => {
    const now = Date.now();
    const advice = {
      advice: { battThreshold: 10, stableMinutes: 10, runW: 50 },
      soc: 24,
      exportW: 200,
      chargeW: 2800,
      battCounts: true,
      usableW: 3000,
      forecastSeries: [
        { t: now, w: 3000 },
        { t: now + HOUR, w: 2600 },
        { t: now + 2 * HOUR, w: 0 },
      ],
      items: [
        {
          id: 'sp',
          name: 'Spülmaschine',
          status: 'fits',
          demandW: 2150,
          durationMin: 90,
          suggestedSince: now,
          plan: { kind: 'now', start: now, end: now + 2 * HOUR },
        },
        {
          id: 'wm',
          name: 'Waschmaschine',
          status: 'alternative',
          demandW: 2490,
          durationMin: 120,
          insteadOf: ['Spülmaschine'],
          plan: { kind: 'tomorrow', start: tomorrowAt(10), end: tomorrowAt(13), todayMin: 30 },
        },
      ],
    };
    const conn = {
      sendMessagePromise: vi.fn(async (msg) => ({
        [msg.entity_ids[0]]:
          msg.entity_ids[0] === 'sensor.grid' ? [{ s: '2500', lu: (now - HOUR) / 1000 }] : [],
      })),
    };
    const entities = {
      'sensor.grid': sensor(200, 'W'),
      'sensor.batt': sensor(-2800, 'W'),
      'sensor.energy_production_today_3': sensor(9, 'kWh'),
      'sensor.energy_production_today_remaining_3': sensor(3.5, 'kWh'),
      'sensor.energy_production_today_remaining_4': sensor(3, 'kWh'),
      'sensor.energy_production_tomorrow_3': sensor(17.6, 'kWh'),
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
    expect(screen.getByText(/läuft etwa 1:30 h · passt seit 1 min/)).toBeTruthy();
    expect(screen.getByText(/^Bestes Fenster heute: jetzt bis \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText('Heute nur 30 min genug · besser morgen 10:00–13:00')).toBeTruthy();
    // Forecast.Solar arrays are added up, and a much sunnier tomorrow is named.
    expect(screen.getByText('6,5 kWh')).toBeTruthy();
    expect(screen.getByText('17,6 kWh')).toBeTruthy();
    expect(screen.getByText(/Morgen wird deutlich sonniger/)).toBeTruthy();
    expect(await screen.findByText('Waschmaschine 2,5 kW')).toBeTruthy();
    expect(screen.getByText('Prognose: PV minus üblicher Hausverbrauch')).toBeTruthy();
  });
});
