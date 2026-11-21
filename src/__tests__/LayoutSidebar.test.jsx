import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LayoutSidebar from '../components/sidebars/LayoutSidebar';

const noop = () => {};

function Harness() {
  const [cardBgColor, setCardBgColor] = useState('#1f291f');
  return (
    <LayoutSidebar
      open
      onClose={noop}
      t={(key) => key}
      gridGapH={16}
      setGridGapH={noop}
      gridGapV={16}
      setGridGapV={noop}
      gridColumns={4}
      setGridColumns={noop}
      dynamicGridColumns={false}
      setDynamicGridColumns={noop}
      effectiveGridColumns={4}
      cardBorderRadius={16}
      setCardBorderRadius={noop}
      cardTransparency={40}
      setCardTransparency={noop}
      cardBorderOpacity={5}
      setCardBorderOpacity={noop}
      cardBgColor={cardBgColor}
      setCardBgColor={setCardBgColor}
      cardMaterial="glass"
      setCardMaterial={noop}
      density="normal"
      setDensity={noop}
      cardScale={100}
      setCardScale={noop}
      sectionSpacing={{}}
      updateSectionSpacing={noop}
      activePage="home"
      pageSettings={{}}
      savePageSetting={noop}
    />
  );
}

describe('LayoutSidebar', () => {
  it('keeps the card color controls mounted while the color changes', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('settings.layoutCards'));

    const colorInput = screen.getByDisplayValue('#1f291f');
    const sliders = screen.getAllByRole('slider');
    const redSlider = sliders.find((slider) => slider.getAttribute('aria-valuenow') === '31');

    fireEvent.change(redSlider, { target: { value: '120' } });
    // M3Slider forwards the change on the next animation frame.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(screen.getByDisplayValue('#78291f')).toBe(colorInput);
    expect(redSlider.isConnected).toBe(true);
  });
});
