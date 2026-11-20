import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToastContainer from '../components/ui/ToastContainer';
import { ToastProvider, useToast } from '../contexts/ToastContext';
import { usePageManagement } from '../hooks/usePageManagement';

const t = (key) => key;

let hook;

function Harness({ deps }) {
  hook = usePageManagement(deps);
  return <ToastContainer />;
}

function setup(home, extra = {}) {
  const persistConfig = vi.fn();
  const makeDeps = (pagesConfig) => ({
    pagesConfig,
    persistConfig,
    pageSettings: {},
    persistPageSettings: vi.fn(),
    savePageSetting: vi.fn(),
    pageDefaults: {},
    activePage: 'home',
    setActivePage: vi.fn(),
    showAddPageModal: false,
    setShowAddPageModal: vi.fn(),
    t,
  });
  const wrap = (deps) => (
    <ToastProvider>
      <Harness deps={deps} />
    </ToastProvider>
  );
  const view = render(wrap(makeDeps({ pages: ['home'], home, ...extra })));
  return {
    persistConfig,
    update: (pagesConfig) => view.rerender(wrap(makeDeps(pagesConfig))),
  };
}

describe('undo after removing a card', () => {
  it('offers an Undo that puts the card back where it was', () => {
    const { persistConfig, update } = setup(['a', 'b', 'c']);

    act(() => hook.removeCard('b'));
    expect(persistConfig).toHaveBeenLastCalledWith(expect.objectContaining({ home: ['a', 'c'] }));
    expect(screen.getByText('toast.cardRemoved')).toBeInTheDocument();

    update({ pages: ['home'], home: ['a', 'c'] });
    fireEvent.click(screen.getByRole('button', { name: 'common.undo' }));

    expect(persistConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ home: ['a', 'b', 'c'] })
    );
    expect(screen.queryByText('toast.cardRemoved')).not.toBeInTheDocument();
  });

  it('keeps edits made after the removal', () => {
    const { persistConfig, update } = setup(['a', 'b', 'c']);

    act(() => hook.removeCard('c'));
    update({ pages: ['home'], home: ['z', 'a', 'b'], other: ['x'] });
    fireEvent.click(screen.getByRole('button', { name: 'common.undo' }));

    expect(persistConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ home: ['z', 'a', 'c', 'b'], other: ['x'] })
    );
  });

  it('restores a header card to the header', () => {
    const { persistConfig, update } = setup(['a'], { header: ['person.a', 'person.b'] });

    act(() => hook.removeCard('person.a', 'header'));
    update({ pages: ['home'], home: ['a'], header: ['person.b'] });
    fireEvent.click(screen.getByRole('button', { name: 'common.undo' }));

    expect(persistConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ header: ['person.a', 'person.b'] })
    );
  });

  it('does not restore a card onto a page that has since been deleted', () => {
    const { persistConfig, update } = setup(['a', 'b'], { kitchen: ['k1'] });

    act(() => hook.removeCard('k1', 'kitchen'));
    update({ pages: ['home'], home: ['a', 'b'] });
    const calls = persistConfig.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'common.undo' }));

    expect(persistConfig).toHaveBeenCalledTimes(calls);
  });

  it('shows no toast when the card is not on the list', () => {
    setup(['a']);

    act(() => hook.removeCard('missing'));

    expect(screen.queryByText('toast.cardRemoved')).not.toBeInTheDocument();
  });
});

describe('toast actions', () => {
  it('leaves a toast without an action unchanged', () => {
    let addToast = () => {};
    function Capture() {
      ({ addToast } = useToast());
      return <ToastContainer />;
    }
    render(
      <ToastProvider>
        <Capture />
      </ToastProvider>
    );

    act(() => addToast('Plain', 'info'));

    expect(screen.getByText('Plain')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
