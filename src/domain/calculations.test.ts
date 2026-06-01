import { describe, expect, it } from 'vitest';

import {
  calculateSalary,
  calculateTotalDue,
  getEmployeeMonthShiftCounts,
  getShiftCountByDate,
  hasShift,
} from './calculations';
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
    { id: 'shift-today', employeeId: 'emp-1', date: '2026-05-11' },
    { id: 'shift-future', employeeId: 'emp-1', date: '2026-05-12' },
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
    {
      id: 'pay-future',
      employeeId: 'emp-1',
      amount: 9999,
      paidAt: '2026-05-12',
      kind: 'payment',
      comment: 'будущая выплата',
    },
    {
      id: 'deduction-future',
      employeeId: 'emp-1',
      amount: 9999,
      paidAt: '2026-05-13',
      kind: 'deduction',
      comment: 'будущий штраф',
    },
  ],
};

describe('minimal payroll formula', () => {
  it('uses worked shifts through today times daily rate minus current payouts and deductions', () => {
    const salary = calculateSalary(state, state.employees[0], '2026-05', '2026-05-11');

    expect(salary.workedShifts).toBe(4);
    expect(salary.dailyRate).toBe(2500);
    expect(salary.accrued).toBe(10000);
    expect(salary.paid).toBe(1700);
    expect(salary.deductions).toBe(300);
    expect(salary.paidAndDeductions).toBe(2000);
    expect(salary.due).toBe(8000);
  });

  it('checks if a shift is already marked', () => {
    expect(hasShift(state, 'emp-1', '2026-05-02')).toBe(true);
    expect(hasShift(state, 'emp-1', '2026-05-04')).toBe(false);
  });

  it('sums total employee debt', () => {
    expect(calculateTotalDue(state, '2026-05', '2026-05-11')).toBe(8000);
  });

  it('ignores archived employees in calendar shift counters', () => {
    expect(getShiftCountByDate(state, '2026-05-02')).toBe(1);
  });

  it('counts monthly employee shifts as total and worked through today', () => {
    expect(getEmployeeMonthShiftCounts(state, 'emp-1', '2026-05', '2026-05-11')).toEqual({
      total: 4,
      worked: 3,
    });
  });
});
