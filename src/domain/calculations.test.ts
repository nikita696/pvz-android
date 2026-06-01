import { describe, expect, it } from 'vitest';

import { calculateSalary, calculateTotalDue, getShiftCountByDate, hasShift } from './calculations';
import type { AppState } from './types';

const state: AppState = {
  location: { id: 'main', name: 'Основной пункт' },
  employees: [
    {
      id: 'emp-1',
      name: 'Анна',
      dailyRate: 2500,
      color: '#a8d5ba',
      active: true,
      createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'emp-archived',
      name: 'Архив',
      dailyRate: 1000,
      color: '#f0dd92',
      active: false,
      createdAt: '2026-05-02T00:00:00.000Z',
    },
  ],
  shifts: [
    { id: 'shift-1', employeeId: 'emp-1', date: '2026-05-02' },
    { id: 'shift-2', employeeId: 'emp-1', date: '2026-05-03' },
    { id: 'shift-archived', employeeId: 'emp-archived', date: '2026-05-02' },
    { id: 'shift-old', employeeId: 'emp-1', date: '2026-04-30' },
  ],
  payments: [
    {
      id: 'pay-1',
      employeeId: 'emp-1',
      amount: 1000,
      paidAt: '2026-05-10',
      kind: 'payment',
      comment: 'аванс',
    },
    {
      id: 'deduction-1',
      employeeId: 'emp-1',
      amount: 300,
      paidAt: '2026-05-11',
      kind: 'deduction',
      comment: 'штраф',
    },
    {
      id: 'pay-old',
      employeeId: 'emp-1',
      amount: 700,
      paidAt: '2026-04-10',
      kind: 'payment',
      comment: 'прошлая выплата',
    },
  ],
};

describe('minimal payroll formula', () => {
  it('uses all worked shifts times daily rate minus payouts and deductions', () => {
    const salary = calculateSalary(state, state.employees[0], '2026-05');

    expect(salary.workedShifts).toBe(3);
    expect(salary.dailyRate).toBe(2500);
    expect(salary.accrued).toBe(7500);
    expect(salary.paid).toBe(1700);
    expect(salary.deductions).toBe(300);
    expect(salary.paidAndDeductions).toBe(2000);
    expect(salary.due).toBe(5500);
  });

  it('checks if a shift is already marked', () => {
    expect(hasShift(state, 'emp-1', '2026-05-02')).toBe(true);
    expect(hasShift(state, 'emp-1', '2026-05-04')).toBe(false);
  });

  it('sums total employee debt', () => {
    expect(calculateTotalDue(state, '2026-05')).toBe(5500);
  });

  it('ignores archived employees in calendar shift counters', () => {
    expect(getShiftCountByDate(state, '2026-05-02')).toBe(1);
  });
});
