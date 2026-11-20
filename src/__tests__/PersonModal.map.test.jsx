import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PersonModal from '../modals/PersonModal';

const leaflet = vi.hoisted(() => ({
  map: vi.fn(() => ({
    setView: vi.fn().mockReturnThis(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
  divIcon: vi.fn(),
  marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
  polyline: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
  circleMarker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
}));
vi.mock('leaflet', () => ({ default: leaflet }));

vi.mock('../contexts', () => ({
  useConfig: () => ({ unitsMode: 'follow_ha' }),
  useHomeAssistantMeta: () => ({ haConfig: {} }),
}));

const person = {
  entity_id: 'person.ola',
  state: 'not_home',
  attributes: { friendly_name: 'Ola', latitude: 60.4, longitude: 5.3 },
};

const renderModal = () =>
  render(
    <PersonModal
      show
      onClose={vi.fn()}
      personId="person.ola"
      entity={person}
      entities={{ 'person.ola': person }}
      t={(key) => key}
      settings={{}}
    />
  );

describe('PersonModal map', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    vi.clearAllMocks();
  });

  it('draws OpenStreetMap tiles with their attribution instead of CARTO', async () => {
    renderModal();
    await vi.waitFor(() => expect(leaflet.tileLayer).toHaveBeenCalled());
    const [url, options] = leaflet.tileLayer.mock.calls[0];
    expect(url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(options.attribution).toContain('OpenStreetMap');
    expect(leaflet.map.mock.calls[0][1]).toMatchObject({ attributionControl: true });
  });

  it('marks the map dark on dark themes so the tiles are inverted', () => {
    const { container } = renderModal();
    expect(container.ownerDocument.querySelector('.person-map')).toHaveAttribute(
      'data-map-theme',
      'dark'
    );
  });

  it('keeps the tiles as they are on the light theme', () => {
    document.documentElement.dataset.theme = 'light';
    const { container } = renderModal();
    expect(container.ownerDocument.querySelector('.person-map')).toHaveAttribute(
      'data-map-theme',
      'light'
    );
  });
});
