import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FanCard from '../components/cards/FanCard';
import VacuumCard from '../components/cards/VacuumCard';
import MowerCard from '../components/cards/MowerCard';
import { renderAutomationCard } from '../rendering/cards/automationRenderer';
import { getUnavailableLabel, isUnavailableState } from '../utils/entityState';

const t = (key) => key;

const cardProps = (idProp, entityId, state = 'unavailable') => {
  const entities = { [entityId]: { state, attributes: { friendly_name: 'Device' } } };
  return {
    [idProp]: entityId,
    dragProps: {},
    controls: null,
    cardStyle: {},
    entities,
    editMode: false,
    cardSettings: {},
    settingsKey: entityId,
    customNames: {},
    customIcons: {},
    getA: (id, attr, fallback = null) => entities[id]?.attributes?.[attr] ?? fallback,
    callService: vi.fn(),
    onOpen: vi.fn(),
    isMobile: false,
    t,
  };
};

describe('unavailable state helpers', () => {
  it('treats unavailable and unknown as unavailable', () => {
    expect(isUnavailableState('unavailable')).toBe(true);
    expect(isUnavailableState('unknown')).toBe(true);
    expect(isUnavailableState('off')).toBe(false);
  });

  it('names the state the way every card shows it', () => {
    expect(getUnavailableLabel('unavailable', t)).toBe('status.unavailable');
    expect(getUnavailableLabel('unknown', t)).toBe('common.unknown');
  });
});

describe('cards say unavailable instead of off, unknown or a raw state', () => {
  it.each([
    ['fan', FanCard, 'fanId', 'fan.stue'],
    ['vacuum', VacuumCard, 'vacuumId', 'vacuum.rocky'],
    ['mower', MowerCard, 'mowerId', 'lawn_mower.plen'],
  ])('%s card', (_name, Card, idProp, entityId) => {
    render(<Card {...cardProps(idProp, entityId)} />);
    expect(screen.getAllByText('status.unavailable').length).toBeGreaterThan(0);
    expect(screen.queryByText('unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('status.off')).not.toBeInTheDocument();
  });

  it('automation card says so, dims and sends nothing', () => {
    const props = cardProps('cardId', 'automation.morgon');
    const { container } = render(
      renderAutomationCard('automation.morgon', {}, () => null, {}, 'automation.morgon', props)
    );
    expect(screen.getByText('status.unavailable')).toBeInTheDocument();
    container.firstChild.click();
    expect(props.callService).not.toHaveBeenCalled();
    expect(container.firstChild).toHaveClass('opacity-70');
  });
});
