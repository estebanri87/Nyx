import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EnergyAdvicePill, { findAdvicePageId } from '../components/cards/EnergyAdvicePill';
import Header from '../layouts/Header';
import de from '../i18n/de.json';

const sensor = (state, unit) => ({
  state: String(state),
  attributes: unit ? { unit_of_measurement: unit } : {},
});

const ctx = vi.hoisted(() => ({ entities: {}, pageSettings: {}, conn: null }));

vi.mock('../contexts', () => ({
  useConfig: () => ({ language: 'de', unitsMode: 'follow_ha' }),
  useHomeAssistantMeta: () => ({ haConfig: {} }),
  useHomeAssistant: () => ({ entities: ctx.entities, conn: ctx.conn }),
  usePages: () => ({ pageSettings: ctx.pageSettings }),
}));

const t = (key) => de[key] ?? key;

// Each test uses its own grid sensor: the surplus history is shared per setup.
const energyPage = (devices, gridPower = 'sensor.grid') => ({
  type: 'energy',
  energy: {
    slots: { gridPower, battPower: 'sensor.batt', battSoc: 'sensor.soc' },
    devices,
  },
});

const statsConn = {
  sendMessagePromise: vi.fn(async (msg) =>
    msg.type === 'recorder/statistics_during_period'
      ? { [msg.statistic_ids[0]]: [760, 750, 780, 770, 0].map((max) => ({ max })) }
      : { [msg.entity_ids[0]]: [] }
  ),
};

describe('EnergyAdvicePill', () => {
  beforeEach(() => {
    ctx.conn = statsConn;
    ctx.entities = {
      'sensor.grid': sensor(528, 'W'),
      'sensor.batt': sensor(-2828, 'W'),
      'sensor.soc': sensor(91, '%'),
      'sensor.dryer_power': sensor(0, 'W'),
    };
    ctx.pageSettings = {
      home: { type: 'grid' },
      energie: energyPage([{ entity: 'sensor.dryer_power', name: 'Trockner' }]),
    };
  });

  it('finds the energy page with appliances', () => {
    expect(findAdvicePageId(ctx.pageSettings)).toBe('energie');
    expect(findAdvicePageId({ energie: energyPage([]) })).toBeNull();
  });

  it('names the appliance that fits and opens the energy page', async () => {
    const onOpenPage = vi.fn();
    render(
      <EnergyAdvicePill
        pill={{ id: 'p', type: 'energy_advice', icon: 'Sun' }}
        t={t}
        onOpenPage={onOpenPage}
      />
    );
    fireEvent.click(await screen.findByText('Trockner jetzt starten'));
    expect(screen.getByText('3,4 kW Sonnenstrom übrig')).toBeTruthy();
    expect(onOpenPage).toHaveBeenCalledWith('energie');
  });

  it('offers either appliance when only one of them fits at a time', async () => {
    ctx.conn = {
      sendMessagePromise: vi.fn(async (msg) => {
        if (msg.type !== 'recorder/statistics_during_period') return { [msg.entity_ids[0]]: [] };
        const id = msg.statistic_ids[0];
        const peak = id === 'sensor.dish_power' ? 2150 : 2490;
        return { [id]: [peak, peak, peak, 0].map((max) => ({ max })) };
      }),
    };
    ctx.entities = {
      ...ctx.entities,
      'sensor.grid_either': sensor(3000, 'W'),
      'sensor.batt': sensor(0, 'W'),
      'sensor.dish_power': sensor(0, 'W'),
      'sensor.wash_power': sensor(0, 'W'),
    };
    ctx.pageSettings = {
      energie: energyPage(
        [
          { entity: 'sensor.dish_power', name: 'Spülmaschine' },
          { entity: 'sensor.wash_power', name: 'Waschmaschine' },
        ],
        'sensor.grid_either'
      ),
    };
    render(<EnergyAdvicePill pill={{ id: 'p', type: 'energy_advice' }} t={t} />);
    expect(await screen.findByText('Spülmaschine oder Waschmaschine')).toBeTruthy();
    expect(screen.getByText(/^3(,0)? kW Sonnenstrom übrig · eins von beiden$/)).toBeTruthy();
  });

  it('stays hidden without surplus', () => {
    ctx.entities = {
      ...ctx.entities,
      'sensor.grid_none': sensor(-300, 'W'),
      'sensor.batt': sensor(500, 'W'),
    };
    ctx.pageSettings = {
      energie: energyPage([{ entity: 'sensor.dryer_power', name: 'Trockner' }], 'sensor.grid_none'),
    };
    const { container } = render(
      <EnergyAdvicePill pill={{ id: 'p', type: 'energy_advice' }} t={t} />
    );
    expect(container.textContent).toBe('');
  });
});

describe('Header without title', () => {
  const now = new Date(2026, 10, 21, 13, 53);

  it('shows the date in place of the title', () => {
    render(
      <Header
        now={now}
        headerTitle="Home"
        headerScale={1}
        headerSettings={{ showTitle: false, showClock: true, showDate: true }}
        t={t}
      />
    );
    expect(screen.queryByText('Home')).toBeNull();
    const date = screen.getByText(/21\. November/);
    expect(date.parentElement.querySelector('h1')).toBeNull();
    expect(date.parentElement.parentElement.querySelector('h2')).toBeTruthy();
  });
});
