import { describe, expect, it } from 'vitest';

import type { AppState } from './types';
import { createMonthScheduleText, createMonthSummaryText } from './shareSummary';

const state: AppState = {
  location: { id: 'main', name: 'Песочная 42к2' },
  employees: [
    {
      id: 'nikita',
      name: 'Никита',
      dailyRate: 2500,
      color: '#2563eb',
      active: true,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'sasha',
      name: 'Саша',
      dailyRate: 2000,
      color: '#7c3aed',
      active: false,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  shifts: [
    { id: 'shift-1', employeeId: 'nikita', date: '2026-08-01' },
    { id: 'shift-2', employeeId: 'nikita', date: '2026-08-02' },
    { id: 'shift-3', employeeId: 'sasha', date: '2026-08-02' },
  ],
  payments: [
    { id: 'payment-1', employeeId: 'nikita', amount: 1000, paidAt: '2026-08-02', kind: 'payment', comment: 'СБП' },
    { id: 'deduction-1', employeeId: 'nikita', amount: 200, paidAt: '2026-08-02', kind: 'deduction', comment: 'штраф' },
  ],
  dayNotes: [
    { date: '2026-08-02', comment: 'замена', updatedAt: '2026-08-02T12:00:00.000Z' },
  ],
};

describe('shareable schedule and month summary', () => {
  it('creates a compact chronological schedule including comments', () => {
    expect(createMonthScheduleText(state, '2026-08')).toBe([
      'Песочная 42к2 — август 2026',
      '',
      'График',
      '01.08 — Никита',
      '02.08 — Никита, Саша — замена',
    ].join('\n'));
  });

  it('creates a readable financial summary and keeps archived debt visible', () => {
    const summary = createMonthSummaryText(state, '2026-08', '2026-08-02').replaceAll('\u00a0', ' ');

    expect(summary).toContain(
      'Никита: 2 смены · начислено 5 000 ₽ · выплачено 1 000 ₽ · удержано 200 ₽ · к выплате 3 800 ₽',
    );
    expect(summary).toContain(
      'Саша: 1 смена · начислено 2 000 ₽ · к выплате 2 000 ₽',
    );
  });
});
