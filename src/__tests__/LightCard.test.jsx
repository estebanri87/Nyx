import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LightCard from '../components/cards/LightCard';

const renderSmall = (entity, { optimistic = {} } = {}) => {
  const entities = { 'light.couch': entity };
  render(
    <LightCard
      cardId="light.couch"
      dragProps={{}}
      controls={null}
      cardStyle={{}}
      entities={entities}
      editMode={false}
      cardSettings={{ 'home::light.couch': { size: 'small' } }}
      settingsKey="home::light.couch"
      customNames={{}}
      customIcons={{}}
      getA={(id, attr, fallback = null) => entities[id]?.attributes?.[attr] ?? fallback}
      callService={vi.fn()}
      onOpen={vi.fn()}
      isMobile={false}
      optimisticLightBrightness={optimistic}
      setOptimisticLightBrightness={vi.fn()}
      t={(key) => key}
    />
  );
  return document.querySelector('[data-light-value]');
};

const dimmable = (state, brightness) => ({
  state,
  attributes: { friendly_name: 'Couch', brightness, supported_color_modes: ['brightness'] },
});

describe('small LightCard value', () => {
  it('shows the brightness in percent beside the slider', () => {
    expect(renderSmall(dimmable('on', 207)).textContent).toBe('81%');
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('follows the slider while it is being dragged', () => {
    expect(
      renderSmall(dimmable('on', 207), { optimistic: { 'light.couch': 128 } }).textContent
    ).toBe('50%');
  });

  it('says off instead of 0% when the light is off', () => {
    expect(renderSmall(dimmable('off', null)).textContent).toBe('common.off');
  });

  it('shows on or off for a light without dimming', () => {
    const value = renderSmall({
      state: 'on',
      attributes: { friendly_name: 'Couch', supported_color_modes: ['onoff'] },
    });
    expect(value.textContent).toBe('common.on');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('shows no number for an unavailable light', () => {
    expect(renderSmall({ state: 'unavailable', attributes: {} }).textContent).toBe('--');
  });
});
