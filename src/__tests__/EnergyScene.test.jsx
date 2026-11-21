import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EnergyScene from '../components/pages/energy/EnergyScene';

const SHOW = { pv: true, bkw: true, batt: true, netz: true, wp: true };
const IDLE = { pv: false, bkw: false, house: true, batt: 0, grid: 0 };

const animated = (container) =>
  [...container.querySelectorAll('path.nyx-energy-flow')].map((p) => ({
    d: p.getAttribute('d'),
    reverse: p.classList.contains('nyx-energy-flow--reverse'),
  }));
const has = (paths, prefix) => paths.find((p) => p.d.startsWith(prefix));

const BATTERY = 'M720 680';
const GRID = 'M670 700';
const PV = 'M670 290';
const TO_TANK = 'M1000 640';
const FLOOR = 'M1000 506';
const WP_OUT = 'M470 605';
const WP_POWER = 'M620 650';

describe('EnergyScene', () => {
  it('runs battery and grid towards the house in the evening', () => {
    const { container } = render(
      <EnergyScene view="gesamt" show={SHOW} flow={{ ...IDLE, batt: -1, grid: -1 }} />
    );
    const paths = animated(container);
    expect(has(paths, BATTERY).reverse).toBe(true);
    expect(has(paths, GRID).reverse).toBe(true);
    expect(has(paths, PV)).toBeUndefined();
  });

  it('runs battery charging and export away from the inverter', () => {
    const { container } = render(
      <EnergyScene view="gesamt" show={SHOW} flow={{ ...IDLE, pv: true, batt: 1, grid: 1 }} />
    );
    const paths = animated(container);
    expect(has(paths, BATTERY).reverse).toBe(false);
    expect(has(paths, GRID).reverse).toBe(false);
  });

  it('animates only the floor heating while heating', () => {
    const { container } = render(
      <EnergyScene view="wp" show={SHOW} flow={{ ...IDLE, heatRun: true, heating: true }} />
    );
    const paths = animated(container);
    expect(has(paths, FLOOR)).toBeTruthy();
    expect(has(paths, WP_OUT)).toBeTruthy();
    expect(has(paths, TO_TANK)).toBeUndefined();
  });

  it('animates only the tank while making hot water', () => {
    const { container } = render(
      <EnergyScene view="wp" show={SHOW} flow={{ ...IDLE, heatRun: true, dhw: true }} />
    );
    const paths = animated(container);
    expect(has(paths, TO_TANK)).toBeTruthy();
    expect(has(paths, FLOOR)).toBeUndefined();
  });

  it('stops every heat line in standby', () => {
    const { container } = render(<EnergyScene view="wp" show={SHOW} flow={IDLE} />);
    const paths = animated(container);
    [WP_POWER, WP_OUT, TO_TANK, FLOOR].forEach((d) => expect(has(paths, d)).toBeUndefined());
    expect(container.querySelector('.nyx-energy-fan')).toBeNull();
  });

  it('replaces the drawn sun with the weather icon', () => {
    const { container } = render(
      <EnergyScene view="gesamt" show={SHOW} flow={IDLE} weatherIcon="https://x/rain.svg" />
    );
    expect(container.querySelector('image').getAttribute('href')).toBe('https://x/rain.svg');
    expect(container.querySelector('circle[fill="#ca8a04"]')).toBeNull();
  });
});
