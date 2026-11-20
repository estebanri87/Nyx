import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRefreshTick } from '../hooks/useRefreshTick';

const makeConn = () => {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((name, fn) => listeners.set(name, fn)),
    removeEventListener: vi.fn((name) => listeners.delete(name)),
    emit: (name) => listeners.get(name)?.(),
  };
};

describe('useRefreshTick', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rises on the interval and when Home Assistant reconnects', () => {
    const conn = makeConn();
    const { result } = renderHook(() => useRefreshTick(conn, { intervalMs: 1000 }));
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1);
    act(() => conn.emit('ready'));
    expect(result.current).toBe(2);
  });

  it('stays put while disabled', () => {
    const conn = makeConn();
    const { result } = renderHook(() => useRefreshTick(conn, { enabled: false, intervalMs: 1000 }));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
    expect(conn.addEventListener).not.toHaveBeenCalled();
  });
});
