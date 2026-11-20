import { useCallback, useEffect, useState } from 'react';

export const CONFIRM_TAP_TIMEOUT_MS = 3000;

/**
 * Two taps for actions that should not happen by accident (unlocking, opening a door,
 * starting an engine). The first tap arms the action named by `key`, the second within
 * the timeout runs it; any other key, or waiting, disarms it again.
 * @param {number} [timeoutMs]
 */
export function useConfirmTap(timeoutMs = CONFIRM_TAP_TIMEOUT_MS) {
  const [armedKey, setArmedKey] = useState(null);

  useEffect(() => {
    if (!armedKey) return undefined;
    const timer = setTimeout(() => setArmedKey(null), timeoutMs);
    return () => clearTimeout(timer);
  }, [armedKey, timeoutMs]);

  /**
   * @param {string} key
   * @param {() => void} action
   */
  const confirmTap = useCallback(
    (key, action) => {
      if (armedKey === key) {
        setArmedKey(null);
        action();
        return;
      }
      setArmedKey(key);
    },
    [armedKey]
  );

  const disarm = useCallback(() => setArmedKey(null), []);

  return { armedKey, confirmTap, disarm };
}
