import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogProvider, useDialog } from '../contexts/DialogContext';

let api;
function Capture() {
  api = useDialog();
  return null;
}

const renderProvider = () =>
  render(
    <DialogProvider>
      <Capture />
    </DialogProvider>
  );

const ask = (method, request) => {
  let answer;
  act(() => {
    api[method](request).then((value) => {
      answer = value;
    });
  });
  return () => answer;
};

const base = { title: 'Delete', message: 'Really?', confirmLabel: 'Yes', cancelLabel: 'No' };

describe('Nyx dialogs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a confirm dialog and resolves true on confirm', async () => {
    renderProvider();
    const answer = ask('confirm', base);
    expect(screen.getByRole('dialog')).toHaveTextContent('Really?');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes' })));
    expect(answer()).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false on cancel and on Escape', async () => {
    renderProvider();
    const first = ask('confirm', base);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'No' })));
    expect(first()).toBe(false);

    const second = ask('confirm', base);
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(second()).toBe(false);
  });

  it('returns the typed text from a prompt, or null when cancelled', async () => {
    renderProvider();
    const typed = ask('prompt', { ...base, defaultValue: 'Kitchen' });
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Kitchen');
    fireEvent.change(input, { target: { value: 'Living room' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes' })));
    expect(typed()).toBe('Living room');

    const cancelled = ask('prompt', base);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'No' })));
    expect(cancelled()).toBeNull();
  });

  it('marks a destructive action in the error colour', () => {
    renderProvider();
    ask('confirm', { ...base, destructive: true });
    expect(screen.getByRole('button', { name: 'Yes' }).className).toContain('status-error');
  });

  it('falls back to the browser dialogs without a provider', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Capture />);
    await expect(api.confirm(base)).resolves.toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Delete\n\nReally?');
  });
});
