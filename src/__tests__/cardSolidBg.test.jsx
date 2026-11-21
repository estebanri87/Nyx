import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigProvider, useConfig } from '../contexts/ConfigContext';

let config;
function Capture() {
  config = useConfig();
  return null;
}

const solidBg = () => document.documentElement.style.getPropertyValue('--card-solid-bg');

describe('custom card color for opaque card materials', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--card-solid-bg');
  });

  it('exposes the custom card color as an opaque surface and clears it on reset', () => {
    render(
      <ConfigProvider>
        <Capture />
      </ConfigProvider>
    );
    expect(solidBg()).toBe('');

    act(() => config.setCardBgColor('#1f291f'));
    expect(solidBg()).toBe('rgb(31, 41, 31)');

    act(() => config.setCardBgColor(''));
    expect(solidBg()).toBe('');
  });
});
