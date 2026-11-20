import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAssistantProvider, useHomeAssistantMeta } from '../contexts/HomeAssistantContext';
import { notifyHomeAssistantApiUnauthorized } from '../services/apiAuth';

const relay = vi.hoisted(() => ({ createRelayConnection: vi.fn() }));
vi.mock('../services/haRelayConnection', () => relay);

const relaySetup = {
  url: 'http://homeassistant.local:8123',
  token: '',
  authMethod: 'relay',
  isIngress: true,
};
const wrapper = ({ children }) => (
  <HomeAssistantProvider config={relaySetup}>{children}</HomeAssistantProvider>
);

describe('Home Assistant relay authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('ha_auth_method', 'relay');
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ user: { id: 'viewer-1', name: 'Viewer' } }),
    }));
    relay.createRelayConnection.mockResolvedValue({
      close: vi.fn(),
      sendMessagePromise: vi.fn(async () => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onEntities: vi.fn(() => vi.fn()),
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the relay connection when a backend request is rejected', async () => {
    const { result } = renderHook(useHomeAssistantMeta, { wrapper });
    await waitFor(() => expect(result.current.haUser?.id).toBe('viewer-1'));
    const connection = result.current.conn;
    act(() => {
      notifyHomeAssistantApiUnauthorized();
    });
    expect(result.current.conn).toBe(connection);
    expect(result.current.haUser?.id).toBe('viewer-1');
    expect(connection.close).not.toHaveBeenCalled();
  });
});
