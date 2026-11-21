import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnergyPage from '../components/pages/EnergyPage';
import de from '../i18n/de.json';

vi.mock('../contexts', () => ({
  useConfig: () => ({ language: 'de' }),
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
      },
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

  it('asks for setup when no entity is assigned', () => {
    renderPage({ pageSettings: { energie: { type: 'energy' } } });
    expect(screen.getByText(de['energy.empty'])).toBeTruthy();
  });

  it('shows the setup panel in edit mode', () => {
    renderPage({ editMode: true });
    expect(screen.getByText('Energie-Seite einrichten')).toBeTruthy();
  });
});
