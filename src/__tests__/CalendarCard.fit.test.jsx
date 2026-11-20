import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../services/haClient', () => ({ getCalendarEvents: vi.fn() }));

import CalendarCard from '../components/cards/CalendarCard';
import { getCalendarEvents } from '../services/haClient';

const localDay = (offset) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('sv-SE');
};

const box = (top, bottom) => ({
  top,
  bottom,
  height: bottom - top,
  left: 0,
  right: 300,
  width: 300,
  x: 0,
  y: top,
  toJSON() {},
});

// Rows are 40 px with 10 px between them; the "+N more" line is 20 px below the last row.
const fakeLayout = (listHeight) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const rows = Array.from(document.querySelectorAll('[data-fit-row]'));
    const index = rows.indexOf(this);
    if (index >= 0) return box(index * 50, index * 50 + 40);
    if (this.hasAttribute('data-fit-more')) return box(rows.length * 50, rows.length * 50 + 20);
    return box(0, listHeight);
  });

const renderList = () =>
  render(
    <CalendarCard
      cardId="cal"
      settings={{ calendars: ['calendar.a'] }}
      conn={{ addEventListener: vi.fn(), removeEventListener: vi.fn() }}
      t={(key) => (key === 'common.moreCount' ? '+{count} more' : key)}
      locale="en-GB"
    />
  );

const events = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'].map((summary) => ({
  summary,
  start: localDay(0),
  end: localDay(1),
}));

describe('large CalendarCard list', () => {
  beforeAll(() => {
    globalThis.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      unobserve() {}
      disconnect() {}
    };
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows only the events that fit whole, then how many more there are', async () => {
    fakeLayout(200);
    getCalendarEvents.mockResolvedValue({ 'calendar.a': { events } });
    renderList();

    await waitFor(() => expect(screen.getByText('+3 more')).toBeInTheDocument());
    expect(screen.getByText('E3')).toBeInTheDocument();
    expect(screen.queryByText('E4')).toBeNull();
  });

  it('shows every event and no "more" line when they all fit', async () => {
    fakeLayout(600);
    getCalendarEvents.mockResolvedValue({ 'calendar.a': { events } });
    renderList();

    await waitFor(() => expect(screen.getByText('E6')).toBeInTheDocument());
    expect(screen.queryByText(/more/)).toBeNull();
  });
});
