import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LeafModal from '../modals/LeafModal';

vi.mock('../contexts', () => ({
  useConfig: () => ({ unitsMode: 'follow_ha' }),
  useHomeAssistantMeta: () => ({ haConfig: { unit_system: { temperature: '°C' } } }),
}));

const renderCar = (lockState, ignitionState) => {
  const entities = {
    'lock.car': { state: lockState, attributes: {} },
    'switch.engine': { state: ignitionState, attributes: {} },
  };
  const callService = vi.fn();
  render(
    <LeafModal
      show
      onClose={vi.fn()}
      entities={entities}
      callService={callService}
      getS={(id) => entities[id]?.state}
      getA={(id, attr, fallback = null) => entities[id]?.attributes?.[attr] ?? fallback}
      t={(key) => key}
      car={{ name: 'Car', lockId: 'lock.car', ignitionSwitchId: 'switch.engine' }}
    />
  );
  return callService;
};

describe('car popup confirmations', () => {
  it('unlocks only on the second tap', () => {
    const callService = renderCar('locked', 'off');
    fireEvent.click(screen.getByText('car.unlock'));
    expect(callService).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('lock.action.confirmUnlock'));
    expect(callService).toHaveBeenCalledWith('lock', 'unlock', { entity_id: 'lock.car' });
  });

  it('starts the engine only on the second tap', () => {
    const callService = renderCar('locked', 'off');
    fireEvent.click(screen.getByText('car.engineStart'));
    expect(callService).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('car.confirmEngineStart'));
    expect(callService).toHaveBeenCalledWith('switch', 'turn_on', { entity_id: 'switch.engine' });
  });

  it('locks and stops the engine at once', () => {
    const callService = renderCar('unlocked', 'on');
    fireEvent.click(screen.getByText('car.lock'));
    fireEvent.click(screen.getByText('car.engineStop'));
    expect(callService).toHaveBeenCalledWith('lock', 'lock', { entity_id: 'lock.car' });
    expect(callService).toHaveBeenCalledWith('switch', 'turn_off', { entity_id: 'switch.engine' });
  });
});
