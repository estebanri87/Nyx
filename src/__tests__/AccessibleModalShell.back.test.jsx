import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

/** Lets queued history work and its popstate run on real timers. */
const settleHistory = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

function Popup({ id = 'popup', initialOpen = true, onClose, children }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {`open ${id}`}
      </button>
      <AccessibleModalShell
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        {() => (
          <div>
            <h3>{id}</h3>
            {children}
          </div>
        )}
      </AccessibleModalShell>
    </>
  );
}

describe('AccessibleModalShell Back button and stack', () => {
  const START_URL = '#/page/kitchen';
  let pushState;
  let go;
  let routerSaw;
  let userBacks = 0;

  /** How far above the starting entry the session history stands. */
  const depth = () =>
    pushState.mock.calls.length +
    go.mock.calls.reduce((sum, [delta]) => sum + (delta ?? 0), 0) -
    userBacks;

  const pressBack = async () => {
    userBacks += 1;
    window.history.back();
    await settleHistory();
  };

  beforeEach(async () => {
    await settleHistory();
    window.history.replaceState({ key: 'router' }, '', START_URL);
    userBacks = 0;
    pushState = vi.spyOn(window.history, 'pushState');
    go = vi.spyOn(window.history, 'go');
    routerSaw = vi.fn();
    window.addEventListener('popstate', routerSaw);
  });

  afterEach(async () => {
    cleanup();
    await settleHistory();
    window.removeEventListener('popstate', routerSaw);
    vi.restoreAllMocks();
  });

  it('adds one entry with the same URL when a popup opens', async () => {
    render(<Popup />);
    await settleHistory();
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe(START_URL);
    expect(window.history.state).toEqual({ key: 'router' });
  });

  it('closes the popup on Back and stays on the page', async () => {
    const onClose = vi.fn();
    render(<Popup onClose={onClose} />);
    await settleHistory();
    await pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(depth()).toBe(0);
    expect(window.location.hash).toBe(START_URL);
  });

  it('removes its entry when closed another way, without the router noticing', async () => {
    render(<Popup />);
    await settleHistory();
    routerSaw.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    await settleHistory();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(depth()).toBe(0);
    expect(routerSaw).not.toHaveBeenCalled();
  });

  it('closes only the top popup of a nested pair on Back and on Escape', async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <Popup id="outer" onClose={outerClose}>
        <Popup id="inner" initialOpen={false} onClose={innerClose} />
      </Popup>
    );
    await settleHistory();
    fireEvent.click(screen.getByRole('button', { name: 'open inner' }));
    await settleHistory();
    expect(depth()).toBe(2);

    await pressBack();
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
    expect(screen.getByText('outer')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await settleHistory();
    expect(outerClose).toHaveBeenCalledTimes(1);
    expect(depth()).toBe(0);
  });
});
