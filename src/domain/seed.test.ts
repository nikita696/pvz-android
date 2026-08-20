import { describe, expect, it } from 'vitest';

import {
  getCurrentLocalDate,
  getCurrentMonth,
  getToday,
  refreshCurrentLocalDate,
} from './seed';

describe('dynamic current date helpers', () => {
  it('uses the supplied local date instead of a frozen module timestamp', () => {
    const august = new Date(2026, 7, 3, 23, 59);
    const september = new Date(2026, 8, 1, 0, 1);

    expect(getCurrentLocalDate(august)).toEqual({ month: '2026-08', today: '2026-08-03' });
    expect(getCurrentMonth(september)).toBe('2026-09');
    expect(getToday(september)).toBe('2026-09-01');
  });

  it('refreshes backwards-compatible live bindings for existing imports', async () => {
    refreshCurrentLocalDate(new Date(2026, 9, 7));
    const seed = await import('./seed');

    expect(seed.CURRENT_MONTH).toBe('2026-10');
    expect(seed.TODAY).toBe('2026-10-07');
  });
});
