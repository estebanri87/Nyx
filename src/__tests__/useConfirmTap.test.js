import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmTap } from '../hooks/useConfirmTap';

describe('useConfirmTap', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the action on the second tap of the same key', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirmTap());
    act(() => result.current.confirmTap('unlock', action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.armedKey).toBe('unlock');
    act(() => result.current.confirmTap('unlock', action));
    expect(action).toHaveBeenCalledOnce();
    expect(result.current.armedKey).toBeNull();
  });

  it('re-arms instead of running when another key is tapped', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirmTap());
    act(() => result.current.confirmTap('unlock', action));
    act(() => result.current.confirmTap('engine', action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.armedKey).toBe('engine');
  });

  it('disarms after the timeout', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirmTap(3000));
    act(() => result.current.confirmTap('open', action));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.armedKey).toBeNull();
    act(() => result.current.confirmTap('open', action));
    expect(action).not.toHaveBeenCalled();
  });
});
