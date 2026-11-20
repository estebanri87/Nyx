import { useEffect, useId, useRef } from 'react';
import { normalizeModalOverlayStyle } from './modalStyles';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const PRIORITY_FOCUS_SELECTOR =
  '[data-autofocus], [autofocus], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]';

/** @typedef {{ requestClose: () => void }} OpenModal */

// Open modals in opening order; only the top one reacts to Escape and Back.
/** @type {OpenModal[]} */
const openModalStack = [];

// Every open modal owns one history entry. The entries copy the current URL and router
// state, so they are interchangeable and only their number matters.
let modalHistoryEntries = 0;
let modalHistorySyncQueued = false;
let listeningForBack = false;
// Our own history.go() on its way, with the top entry as it was when the call was made.
/** @type {{ href: string, state: unknown } | null} */
let pendingHistoryStep = null;

function syncModalHistory() {
  // Pushing during a traversal races it, so this runs again when its popstate arrives.
  if (pendingHistoryStep) return;
  const wanted = openModalStack.length;
  for (let entry = modalHistoryEntries; entry < wanted; entry += 1) {
    window.history.pushState(window.history.state, '');
  }
  if (wanted < modalHistoryEntries) {
    pendingHistoryStep = { href: window.location.href, state: window.history.state };
    window.history.go(wanted - modalHistoryEntries);
  }
  modalHistoryEntries = wanted;
}

/** @param {PopStateEvent} event */
function handleModalPopState(event) {
  if (pendingHistoryStep) {
    // Removing our own entries is no navigation, so the router must not see it. If the page
    // changed while a modal was open, only the top entry got the new URL: carry it over.
    event.stopImmediatePropagation();
    const { href, state } = pendingHistoryStep;
    pendingHistoryStep = null;
    if (window.location.href !== href) window.history.replaceState(state, '', href);
    syncModalHistory();
    return;
  }
  if (modalHistoryEntries === 0) return;

  // The Back button closes the top popup instead of leaving the page. The entry it used up
  // had the same URL, so the router sees no navigation.
  modalHistoryEntries -= 1;
  const top = openModalStack[openModalStack.length - 1];
  if (top) top.requestClose();
  else syncModalHistory();
}

/** Runs after the current commit, so popups swapped in one update can share an entry. */
function queueModalHistorySync() {
  if (!listeningForBack) {
    // Capture: at the window this runs before the router's own listener.
    window.addEventListener('popstate', handleModalPopState, true);
    listeningForBack = true;
  }
  if (modalHistorySyncQueued) return;
  modalHistorySyncQueued = true;
  globalThis.queueMicrotask(() => {
    modalHistorySyncQueued = false;
    syncModalHistory();
  });
}

/**
 * Shared accessible modal shell with dialog semantics and focus management.
 * Keep visual styling in each modal by passing overlay/panel classes and styles.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {(e?: any) => void} props.onClose
 * @param {string} [props.titleId]
 * @param {string} [props.describedBy]
 * @param {string} [props.overlayClassName]
 * @param {Object} [props.overlayStyle]
 * @param {string} [props.panelClassName]
 * @param {Object} [props.panelStyle]
 * @param {Function} props.children
 */
export default function AccessibleModalShell({
  open,
  onClose,
  titleId,
  describedBy,
  overlayClassName,
  overlayStyle,
  panelClassName,
  panelStyle,
  children,
}) {
  const fallbackTitleId = useId().replace(/:/g, '');
  const resolvedTitleId = titleId || `modal-title-${fallbackTitleId}`;
  const panelRef = useRef(null);
  const previousActiveRef = useRef(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return undefined;
    }

    const openedNow = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (openedNow) {
      previousActiveRef.current = document.activeElement;
    }

    /** @type {OpenModal} */
    const openModal = { requestClose: () => onCloseRef.current?.() };
    openModalStack.push(openModal);
    queueModalHistorySync();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    if (openedNow && panel) {
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
      const priorityTarget = panel.querySelector(PRIORITY_FOCUS_SELECTOR);
      const nonCloseTarget = focusables.find((el) => !el.classList.contains('modal-close'));
      const target = priorityTarget || nonCloseTarget || focusables[0] || panel;
      if (target instanceof HTMLElement) target.focus();
    }

    const handleKeyDown = (event) => {
      if (!panelRef.current) return;
      // Nested popups: only the one on top reacts to keys.
      if (openModalStack[openModalStack.length - 1] !== openModal) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (!focusables.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        if (last instanceof HTMLElement) last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        if (first instanceof HTMLElement) first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = openModalStack.indexOf(openModal);
      if (index >= 0) openModalStack.splice(index, 1);
      queueModalHistorySync();
      document.body.style.overflow = prevOverflow;
      const previous = previousActiveRef.current;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  const resolvedOverlayStyle = normalizeModalOverlayStyle(overlayStyle);

  return (
    <div className={overlayClassName} style={resolvedOverlayStyle} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={resolvedTitleId}
        aria-describedby={describedBy}
        className={panelClassName}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {children(resolvedTitleId)}
      </div>
    </div>
  );
}
