import { render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../services/haClient', () => ({
  getTodoItems: vi.fn(),
  addTodoItem: vi.fn(),
  updateTodoItem: vi.fn(),
  removeTodoItem: vi.fn(),
}));

import TodoCard from '../components/cards/TodoCard';
import { getTodoItems } from '../services/haClient';

const box = (top, bottom) => ({ top, bottom, height: bottom - top, width: 200, toJSON() {} });

const renderCard = () =>
  render(
    <TodoCard
      cardId="todo"
      settings={{ todoEntityId: 'todo.home' }}
      conn={{ addEventListener: vi.fn(), removeEventListener: vi.fn() }}
      t={(key) => (key === 'common.moreCount' ? '+{count} more' : key)}
      className=""
      entity={{ entity_id: 'todo.home', state: '5', attributes: {} }}
      entitiesReady
    />
  );

describe('large TodoCard list', () => {
  beforeAll(() => {
    // The card loads its items once it is on screen.
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
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows only the items that fit whole, then how many more there are', async () => {
    // Rows are 40 px with 10 px between them; the "+N more" line ends 30 px below the last row.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const rows = Array.from(document.querySelectorAll('[data-fit-row]'));
      const index = rows.indexOf(this);
      if (index >= 0) return box(index * 50, index * 50 + 40);
      if (this.hasAttribute('data-fit-more')) return box(rows.length * 50, rows.length * 50 + 20);
      return box(0, 200);
    });
    getTodoItems.mockResolvedValue(
      ['A', 'B', 'C', 'D', 'E'].map((summary, index) => ({
        uid: String(index),
        summary,
        status: 'needs_action',
      }))
    );
    renderCard();

    await screen.findByText('+2 more');
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).toBeNull();
  });

  it('shows every item and no "more" line when they all fit', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const rows = Array.from(document.querySelectorAll('[data-fit-row]'));
      const index = rows.indexOf(this);
      if (index >= 0) return box(index * 50, index * 50 + 40);
      return box(0, 400);
    });
    getTodoItems.mockResolvedValue(
      ['A', 'B'].map((summary, index) => ({ uid: String(index), summary, status: 'needs_action' }))
    );
    renderCard();

    await screen.findByText('B');
    expect(screen.queryByText(/more/)).toBeNull();
  });
});
