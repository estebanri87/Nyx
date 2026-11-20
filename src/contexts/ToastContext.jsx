import { createContext, useCallback, useContext, useMemo, useState, useRef } from 'react';

/** @typedef {{ label: string, onClick: () => void }} ToastAction */
/** @typedef {{ id: number, message: string, type?: 'error' | 'success' | 'info', action?: ToastAction }} Toast */
/** @typedef {{ addToast: (message: string, type?: 'error' | 'success' | 'info', action?: ToastAction) => void, dismissToast: (id: number) => void, toasts: Toast[] }} ToastContextValue */

const ToastContext = createContext(null);
const TOAST_DURATION = 4000;
// A toast with a button has to stay long enough to reach it on a wall tablet.
const ACTION_TOAST_DURATION = 8000;
const MAX_TOASTS = 3;

/** @returns {ToastContextValue} */
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

/** Like useToast, but null outside a ToastProvider instead of throwing. */
/** @returns {ToastContextValue | null} */
export const useOptionalToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message, type = 'error', action) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type, action }]);
      setTimeout(() => dismissToast(id), action ? ACTION_TOAST_DURATION : TOAST_DURATION);
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({ addToast, dismissToast, toasts }),
    [addToast, dismissToast, toasts]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
