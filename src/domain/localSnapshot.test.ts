import { describe, expect, it } from 'vitest';

import type { AppState } from './types';
import { createLocalSnapshotStore } from './localSnapshot';

const state: AppState = {
  location: { id: 'main', name: 'Тестовый ПВЗ' },
  employees: [],
  shifts: [],
  payments: [],
  dayNotes: [],
};

describe('local successful-state snapshot', () => {
  it('stores and restores a validated workspace snapshot', async () => {
    let contents: string | null = null;
    const store = createLocalSnapshotStore({
      read: async () => contents,
      write: async (next) => { contents = next; },
      remove: async () => { contents = null; },
    });

    await store.save(state, new Date('2026-08-03T10:00:00.000Z'));
    const restored = await store.load();

    expect(restored?.exportedAt).toBe('2026-08-03T10:00:00.000Z');
    expect(restored?.state.location.name).toBe('Тестовый ПВЗ');
  });

  it('discards a corrupted local snapshot', async () => {
    let contents: string | null = '{broken';
    let removed = false;
    const store = createLocalSnapshotStore({
      read: async () => contents,
      write: async (next) => { contents = next; },
      remove: async () => {
        contents = null;
        removed = true;
      },
    });

    await expect(store.load()).resolves.toBeNull();
    expect(removed).toBe(true);
  });
});
