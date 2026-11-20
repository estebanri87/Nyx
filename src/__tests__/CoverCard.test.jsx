import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CoverCard from '../components/cards/CoverCard';

const POSITION = 4;
const STOP = 8;

const renderCover = ({
  position = 0,
  features = POSITION | STOP,
  settings = {},
  callService = vi.fn(() => Promise.resolve()),
} = {}) => {
  const entity = {
    state: position > 0 ? 'open' : 'closed',
    attributes: {
      friendly_name: 'Jalousie',
      current_position: position,
      supported_features: features,
    },
  };
  const props = {
    cardId: 'cover_card_1',
    entityId: 'cover.jalousie',
    entity,
    dragProps: {},
    controls: null,
    cardStyle: {},
    editMode: false,
    customNames: {},
    customIcons: {},
    onOpen: vi.fn(),
    callService,
    settings,
    isMobile: false,
    t: (key) => key,
  };
  const view = render(<CoverCard {...props} />);
  return { ...view, callService, props };
};

const positionCalls = (callService) =>
  callService.mock.calls.filter(([, service]) => service === 'set_cover_position');

describe('CoverCard position chips', () => {
  it('sends closed, half and open as Home Assistant positions', () => {
    const { callService } = renderCover({ position: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'cover.closed' }));
    fireEvent.click(screen.getByRole('button', { name: 'cover.half' }));
    fireEvent.click(screen.getByRole('button', { name: 'cover.open' }));
    expect(positionCalls(callService).map(([, , data]) => data.position)).toEqual([0, 50, 100]);
  });

  it('marks the chip matching the current position', () => {
    renderCover({ position: 0 });
    expect(screen.getByRole('button', { name: 'cover.closed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'cover.open' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('still closes the cover when the displayed number is inverted', () => {
    const { callService } = renderCover({ position: 100, settings: { invertPosition: true } });
    expect(screen.getByText('0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cover.closed' }));
    expect(positionCalls(callService)[0][2]).toEqual({
      entity_id: 'cover.jalousie',
      position: 0,
    });
  });

  it('leaves the chips out for covers without a position', () => {
    renderCover({ features: STOP });
    expect(screen.queryByRole('button', { name: 'cover.half' })).not.toBeInTheDocument();
  });
});

describe('CoverCard stop button', () => {
  const countStopButtons = (container) =>
    container.querySelectorAll('button div.rounded-sm').length;

  it('shows stop when the cover supports it', () => {
    const { container } = renderCover({ features: STOP });
    expect(countStopButtons(container)).toBe(1);
  });

  it('hides stop when the cover cannot stop', () => {
    const { container } = renderCover({ features: 0 });
    expect(countStopButtons(container)).toBe(0);
  });
});

describe('CoverCard failed and cancelled moves', () => {
  afterEach(() => vi.useRealTimers());

  it('puts the chip selection back when the move fails', async () => {
    const callService = vi.fn(() => Promise.reject(new Error('refused')));
    renderCover({ position: 0, callService });
    fireEvent.click(screen.getByRole('button', { name: 'cover.open' }));
    expect(screen.getByRole('button', { name: 'cover.open' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'cover.closed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('drops a requested position the cover never reaches after ten seconds', async () => {
    vi.useFakeTimers();
    renderCover({ position: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'cover.open' }));
    expect(screen.getByRole('button', { name: 'cover.open' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole('button', { name: 'cover.closed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('does not move the cover when a drag is cancelled', () => {
    const { container, callService } = renderCover({ position: 0 });
    const slider = container.querySelector('.cursor-ns-resize');
    slider.setPointerCapture = vi.fn();
    slider.getBoundingClientRect = () => ({ top: 0, height: 100, left: 0, width: 40 });
    fireEvent.pointerDown(slider, { clientY: 20, pointerId: 1 });
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(positionCalls(callService)).toHaveLength(0);
  });
});
