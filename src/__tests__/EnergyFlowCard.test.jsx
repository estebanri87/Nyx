import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnergyFlowCard from '../components/cards/EnergyFlowCard';

const makeEntities = ({ grid, solar, battery, home }) => ({
  'sensor.grid_power': { state: String(grid) },
  'sensor.solar_power': { state: String(solar) },
  'sensor.battery_power': { state: String(battery) },
  'sensor.home_power': { state: String(home) },
});

const baseProps = (overrides = {}) => ({
  cardId: 'energy_flow_1',
  gridEntityId: 'sensor.grid_power',
  solarEntityId: 'sensor.solar_power',
  batteryEntityId: 'sensor.battery_power',
  homeEntityId: 'sensor.home_power',
  entities: makeEntities({ grid: 500, solar: 1200, battery: -200, home: 1500 }),
  dragProps: {},
  controls: null,
  cardStyle: {},
  editMode: false,
  customNames: {},
  customIcons: {},
  settings: { size: 'large' },
  isMobile: false,
  onOpen: vi.fn(),
  t: (key) => key,
  ...overrides,
});

describe('EnergyFlowCard', () => {
  it('renders the four node labels with formatted power values', () => {
    render(<EnergyFlowCard {...baseProps()} />);

    expect(screen.getByText('energyFlow.grid')).toBeInTheDocument();
    expect(screen.getByText('energyFlow.solar')).toBeInTheDocument();
    expect(screen.getByText('energyFlow.battery')).toBeInTheDocument();
    expect(screen.getByText('energyFlow.home')).toBeInTheDocument();
    expect(screen.getByText('1.2 kW')).toBeInTheDocument();
    expect(screen.getByText('1.5 kW')).toBeInTheDocument();
  });

  it('hides solar and battery nodes when not configured', () => {
    render(
      <EnergyFlowCard
        {...baseProps({
          solarEntityId: null,
          batteryEntityId: null,
        })}
      />
    );

    expect(screen.queryByText('energyFlow.solar')).not.toBeInTheDocument();
    expect(screen.queryByText('energyFlow.battery')).not.toBeInTheDocument();
    expect(screen.getByText('energyFlow.grid')).toBeInTheDocument();
    expect(screen.getByText('energyFlow.home')).toBeInTheDocument();
  });

  it('shows a compact layout for the small size setting', () => {
    render(<EnergyFlowCard {...baseProps({ settings: { size: 'small' } })} />);

    expect(screen.getByText('energyFlow.home')).toBeInTheDocument();
    expect(screen.queryByText('energyFlow.grid')).not.toBeInTheDocument();
  });

  describe('compact layout status lines', () => {
    const compactProps = (items, entities) =>
      baseProps({
        entities,
        settings: { size: 'large', layout: 'compact', items },
        t: (key) =>
          ({ 'energyFlow.status.heating': 'Heizen', 'energyFlow.home': 'Haus' })[key] || key,
      });

    it('shows the translated mode below a heat pump item', () => {
      render(
        <EnergyFlowCard
          {...compactProps(
            [
              {
                id: 'hp',
                label: 'Wärmepumpe',
                entityId: 'sensor.hp_power',
                statusEntityId: 'sensor.hp_mode',
              },
            ],
            {
              'sensor.hp_power': { state: '587.6', attributes: { unit_of_measurement: 'W' } },
              'sensor.hp_mode': { state: 'HEATING', attributes: {} },
            }
          )}
        />
      );

      expect(screen.getByText('Wärmepumpe')).toBeInTheDocument();
      expect(screen.getByText('Heizen')).toBeInTheDocument();
    });

    it('shows an arrow and the power for a discharging battery', () => {
      render(
        <EnergyFlowCard
          {...compactProps(
            [
              {
                id: 'bat',
                label: 'Batterie',
                entityId: 'sensor.bat_soc',
                statusEntityId: 'sensor.bat_power',
              },
            ],
            {
              'sensor.bat_soc': { state: '15', attributes: { unit_of_measurement: '%' } },
              'sensor.bat_power': { state: '1200', attributes: { unit_of_measurement: 'W' } },
            }
          )}
        />
      );

      expect(screen.getByText('▼ 1.2 kW')).toBeInTheDocument();
    });

    it('renders a calculated house ring without its own sensor', () => {
      render(
        <EnergyFlowCard
          {...compactProps(
            [{ id: 'home', source: 'home', homeSolarId: 'sensor.pv', homeGridId: 'sensor.grid' }],
            {
              'sensor.pv': { state: '1000', attributes: { unit_of_measurement: 'W' } },
              'sensor.grid': { state: '250', attributes: { unit_of_measurement: 'W' } },
            }
          )}
        />
      );

      expect(screen.getByText('Haus')).toBeInTheDocument();
      expect(screen.getByText('1250.0')).toBeInTheDocument();
    });
  });

  it('renders -- for unavailable entity state', () => {
    const entities = makeEntities({ grid: 500, solar: 1200, battery: -200, home: 1500 });
    entities['sensor.grid_power'] = { state: 'unavailable' };
    render(<EnergyFlowCard {...baseProps({ entities })} />);

    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
  });
});
