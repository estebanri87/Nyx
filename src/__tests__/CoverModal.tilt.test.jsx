import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoverModal from '../modals/CoverModal';

// SET_POSITION (4) | OPEN_TILT (16) | CLOSE_TILT (32) | STOP_TILT (64) | SET_TILT_POSITION (128)
const FEATURES = 4 | 16 | 32 | 64 | 128;

const renderModal = (callService = vi.fn()) => {
  const entity = {
    entity_id: 'cover.jalousie',
    state: 'closed',
    attributes: {
      friendly_name: 'Jalousie',
      current_position: 0,
      current_tilt_position: 0,
      supported_features: FEATURES,
      device_class: 'blind',
    },
  };
  render(
    <CoverModal
      show
      onClose={vi.fn()}
      entityId="cover.jalousie"
      entity={entity}
      entities={{ 'cover.jalousie': entity }}
      callService={callService}
      customIcons={{}}
      settings={{}}
      t={(key) => key}
    />
  );
  return callService;
};

const tiltCalls = (callService) =>
  callService.mock.calls.filter(([, service]) => service === 'set_cover_tilt_position');

describe('cover popup tilt visual', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets the tilt by dragging the slats, sending once after the drag settles', () => {
    const callService = renderModal();
    const slats = screen.getByRole('slider', { name: 'cover.tilt' });
    slats.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 80 });
    fireEvent.pointerDown(slats, { clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(slats, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(slats, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(250));
    expect(tiltCalls(callService)).toEqual([
      ['cover', 'set_cover_tilt_position', { entity_id: 'cover.jalousie', tilt_position: 50 }],
    ]);
    expect(slats).toHaveAttribute('aria-valuenow', '50');
  });

  it('steps the tilt with the arrow keys', () => {
    const callService = renderModal();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'cover.tilt' }), { key: 'End' });
    act(() => vi.advanceTimersByTime(250));
    expect(tiltCalls(callService)[0][2].tilt_position).toBe(100);
  });

  it('marks the active position and tilt preset', () => {
    renderModal();
    const positionBar = screen.getByRole('group', { name: 'cover.presets' });
    const tiltBar = screen.getByRole('group', { name: 'cover.tilt' });
    expect(positionBar.querySelector('[aria-pressed="true"]')).toHaveTextContent(
      'cover.presetClosed'
    );
    expect(tiltBar.querySelector('[aria-pressed="true"]')).toHaveTextContent('cover.tiltClosed');
  });
});
