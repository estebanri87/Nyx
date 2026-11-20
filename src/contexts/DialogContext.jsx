import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

/**
 * @typedef {Object} DialogRequest
 * @property {string} title
 * @property {string} [message]
 * @property {string} confirmLabel
 * @property {string} cancelLabel
 * @property {boolean} [destructive]
 * @property {boolean} [input] ask for text instead of a yes/no answer
 * @property {string} [inputType] e.g. 'password' for a PIN
 * @property {string} [defaultValue]
 */

/**
 * @typedef {Object} DialogApi
 * @property {(request: Omit<DialogRequest, 'input'>) => Promise<boolean>} confirm
 * @property {(request: Omit<DialogRequest, 'input'>) => Promise<string | null>} prompt
 */

const DialogContext = createContext(null);

/** @type {DialogApi} */
const BROWSER_DIALOGS = {
  confirm: async ({ title, message }) =>
    Boolean(globalThis.confirm?.(message ? `${title}\n\n${message}` : title)),
  prompt: async ({ title, defaultValue }) =>
    (defaultValue === undefined
      ? globalThis.prompt?.(title)
      : globalThis.prompt?.(title, defaultValue)) ?? null,
};

/**
 * Nyx-styled replacements for window.confirm() and window.prompt():
 * `if (await confirm({...}))` and `const value = await prompt({...})`.
 * Outside a DialogProvider they fall back to the browser's own dialogs.
 * @returns {DialogApi}
 */
export const useDialog = () => useContext(DialogContext) || BROWSER_DIALOGS;

export function DialogProvider({ children }) {
  /** @type {[DialogRequest | null, Function]} */
  const [request, setRequest] = useState(null);
  const [value, setValue] = useState('');
  const resolverRef = useRef(null);

  // A caller awaiting an answer must not hang when the provider goes away.
  useEffect(
    () => () => {
      resolverRef.current?.(null);
      resolverRef.current = null;
    },
    []
  );

  const open = useCallback((next) => {
    // A new request answers an older, still open one with "no".
    resolverRef.current?.(null);
    setRequest(next);
    setValue(next.defaultValue ?? '');
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (answer) => {
    resolverRef.current?.(answer);
    resolverRef.current = null;
    setRequest(null);
  };

  const api = useMemo(
    () => ({
      confirm: async (next) => (await open({ ...next, input: false })) === true,
      prompt: async (next) => {
        const answer = await open({ ...next, input: true });
        return typeof answer === 'string' ? answer : null;
      },
    }),
    [open]
  );

  const accept = () => settle(request?.input ? value : true);
  const cancel = () => settle(request?.input ? null : false);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AccessibleModalShell
        open={Boolean(request)}
        onClose={cancel}
        titleId="nyx-dialog-title"
        describedBy={request?.message ? 'nyx-dialog-message' : undefined}
        overlayClassName="fixed inset-0 z-[300] flex items-center justify-center p-6"
        overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
        panelClassName="popup-anim relative w-full max-w-md rounded-3xl border p-6 font-sans shadow-2xl backdrop-blur-xl md:rounded-[2.5rem] md:p-8"
        panelStyle={{
          background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
          borderColor: 'var(--glass-border)',
          color: 'var(--text-primary)',
        }}
      >
        {() => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              accept();
            }}
          >
            <h3
              id="nyx-dialog-title"
              className="text-xl font-light tracking-widest text-[var(--text-primary)] uppercase italic"
            >
              {request?.title}
            </h3>
            {request?.message && (
              <p
                id="nyx-dialog-message"
                className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]"
              >
                {request.message}
              </p>
            )}
            {request?.input && (
              <input
                data-autofocus
                type={request.inputType || 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-labelledby="nyx-dialog-title"
                className="popup-surface mt-5 w-full rounded-2xl px-5 py-3 text-[var(--text-primary)] transition-colors outline-none focus:border-[var(--glass-border)]"
              />
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                className="popup-surface popup-surface-hover min-h-11 rounded-2xl px-5 text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase"
              >
                {request?.cancelLabel}
              </button>
              <button
                type="submit"
                data-autofocus={request?.input ? undefined : true}
                className={`min-h-11 rounded-2xl border px-5 text-xs font-bold tracking-widest uppercase transition-colors hover:opacity-90 ${
                  request?.destructive
                    ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]'
                    : 'border-[var(--accent-color)] bg-[var(--accent-bg)] text-[var(--accent-color)]'
                }`}
              >
                {request?.confirmLabel}
              </button>
            </div>
          </form>
        )}
      </AccessibleModalShell>
    </DialogContext.Provider>
  );
}
