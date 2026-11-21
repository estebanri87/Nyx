import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnergyPage from '../components/pages/EnergyPage';
import de from '../i18n/de.json';

const pages = vi.hoisted(() => ({ cardSettings: {} }));

vi.mock('../contexts', () => ({
  useConfig: () => ({ language: 'de' }),
  usePages: () => pages,
}));

const t = (key) => de[key] ?? key;

const sensor = (state, unit) => ({
  state: String(state),
  attributes: unit ? { unit_of_measurement: unit } : {},
});

const entities = {
  'sensor.pv': sensor(2433, 'W'),
  'sensor.bkw': sensor(200, 'W'),
  'sensor.house': sensor(1094, 'W'),
  'sensor.batt_power': sensor(-1159, 'W'),
  'sensor.batt_soc': sensor(13, '%'),
  'sensor.grid': sensor(180, 'W'),
  'sensor.wp': sensor(622, 'W'),
  'sensor.flow': sensor(28.75, '°C'),
  'sensor.flow_set': sensor(29.14, '°C'),
  'select.ems': sensor('Nur Solar'),
  'sensor.outdoor_wp': sensor(5.5, '°C'),
  'sensor.outdoor_station': {
    state: '5.9',
    attributes: { unit_of_measurement: '°C', friendly_name: 'Außentemperatur' },
  },
};

const pageSettings = {
  energie: {
    type: 'energy',
    energy: {
      slots: {
        pvPower: 'sensor.pv',
        bkwPower: 'sensor.bkw',
        houseConsumption: 'sensor.house',
        battPower: 'sensor.batt_power',
        battSoc: 'sensor.batt_soc',
        gridPower: 'sensor.grid',
        wpPower: 'sensor.wp',
        wpControl: 'select.ems',
        flowTemp: 'sensor.flow',
        flowSetpoint: 'sensor.flow_set',
        outdoorTemp: 'sensor.outdoor_wp',
      },
      extras: { aussen: ['sensor.outdoor_station'] },
      names: { 'sensor.outdoor_station': 'Wetterstation' },
      aliases: [{ from: 'Nur Solar', to: 'Solar optimiert' }],
    },
  },
};

const renderPage = (props = {}) =>
  render(
    <EnergyPage
      entities={entities}
      conn={null}
      pageSettings={pageSettings}
      pageId="energie"
      savePageSetting={vi.fn()}
      editMode={false}
      t={t}
      {...props}
    />
  );

describe('EnergyPage', () => {
  it('tells in plain words where the solar power goes', () => {
    renderPage();
    expect(screen.getByText('Der ganze Strom kommt gerade von der Sonne')).toBeTruthy();
    expect(screen.getByText('2.633 W · wird verwendet für:')).toBeTruthy();
    expect(screen.getByText('Heizung')).toBeTruthy();
    expect(screen.getByText('Wird geladen, 13 % voll · 44 %')).toBeTruthy();
  });

  it('switches to the heat pump view and shows flow actual against target', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Wärmepumpe', pressed: false }));
    expect(screen.getByRole('heading', { level: 2, name: 'Wärmepumpe' })).toBeTruthy();
    expect(screen.getAllByText('28,8 / 29,1 °C').length).toBeGreaterThan(0);
    expect(screen.queryByText('Der ganze Strom kommt gerade von der Sonne')).toBeNull();
  });

  it('shows renamed states in the detail panel', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Wärmepumpe', pressed: false }));
    expect(screen.getByText('Solar optimiert')).toBeTruthy();
    expect(screen.queryByText('Nur Solar')).toBeNull();
  });

  it('shows the balcony plant badge in the overview', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: /Balkonkraftwerk/ }).length).toBeGreaterThan(0);
  });

  it('labels extra values with the name given by the user', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Wärmepumpe', pressed: false }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Außen/ })[0]);
    expect(screen.getByText('Wetterstation')).toBeTruthy();
    expect(screen.getByText('5,9 °C')).toBeTruthy();
  });

  it('recommends appliances that fit into the spare solar power', async () => {
    const statsConn = {
      sendMessagePromise: vi.fn(async (msg) =>
        msg.type === 'recorder/statistics_during_period'
          ? { [msg.statistic_ids[0]]: [2130, 2100, 2150, 2130, 6].map((max) => ({ max })) }
          : { [msg.entity_ids[0]]: [] }
      ),
    };
    renderPage({
      conn: statsConn,
      entities: {
        ...entities,
        'sensor.grid': sensor(528, 'W'),
        'sensor.batt_power': sensor(-2828, 'W'),
        'sensor.batt_soc': sensor(91, '%'),
        'sensor.washer_power': sensor(6, 'W'),
      },
      pageSettings: {
        energie: {
          ...pageSettings.energie,
          energy: {
            ...pageSettings.energie.energy,
            devices: [{ entity: 'sensor.washer_power', name: 'Waschmaschine' }],
          },
        },
      },
    });
    expect(await screen.findByText('Jetzt starten')).toBeTruthy();
    expect(screen.getByText('3,4 kW')).toBeTruthy();
    expect(screen.getByText('braucht bis 2,2 kW')).toBeTruthy();
  });

  it('uses the weather card entity for the weather icon', () => {
    pages.cardSettings = { 'weather_temp_1::home': { weatherId: 'weather.home' } };
    const { container } = renderPage({
      entities: { ...entities, 'weather.home': { state: 'sunny', attributes: {} } },
    });
    expect(container.querySelector('image').getAttribute('href')).toMatch(/\/clear-day\.svg$/);
    pages.cardSettings = {};
  });

  it('tells in edit mode what was learned and why not', async () => {
    const statsConn = {
      sendMessagePromise: vi.fn(async (msg) =>
        msg.type === 'recorder/statistics_during_period'
          ? {
              [msg.statistic_ids[0]]:
                msg.statistic_ids[0] === 'sensor.dryer_power'
                  ? [870, 860, 850, 0].map((max) => ({ max }))
                  : [0, 0].map((max) => ({ max })),
            }
          : { [msg.entity_ids[0]]: [] }
      ),
    };
    renderPage({
      editMode: true,
      conn: statsConn,
      entities: {
        ...entities,
        'sensor.dryer_power': sensor(0, 'W'),
        'sensor.idle_power': sensor(0, 'W'),
        'sensor.dryer_energy': sensor(244, 'kWh'),
      },
      pageSettings: {
        energie: {
          ...pageSettings.energie,
          energy: {
            ...pageSettings.energie.energy,
            devices: [
              { entity: 'sensor.dryer_power' },
              { entity: 'sensor.idle_power' },
              { entity: 'sensor.dryer_energy' },
            ],
          },
        },
      },
    });
    expect(await screen.findByText('ermittelt: 0,9 kW')).toBeTruthy();
    expect(await screen.findByText('keine Laufwerte in 30 Tagen')).toBeTruthy();
    expect(screen.getByText('kein Leistungs-Sensor (kWh)')).toBeTruthy();
  });

  it('asks for setup when no entity is assigned', () => {
    renderPage({ pageSettings: { energie: { type: 'energy' } } });
    expect(screen.getByText(de['energy.empty'])).toBeTruthy();
  });

  it('shows the setup panel in edit mode', () => {
    renderPage({ editMode: true });
    expect(screen.getByText('Energie-Seite einrichten')).toBeTruthy();
  });
});
