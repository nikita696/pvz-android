import { describe, expect, it } from 'vitest';

import {
  calculateSalary,
  calculateTotalDue,
  getDayNoteByDate,
  getEmployeeFirstShiftDate,
  getEmployeeMonthShiftCounts,
  getShiftFraction,
  getEmployeeWorkedShiftCount,
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
      weekdayRate: 2500,
      weekendRate: 2500,
      rateHistory: [{ effectiveFrom: '1970-01-01', weekdayRate: 2500, weekendRate: 2500 }],
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
  dayNotes: [
    {
      date: '2026-05-11',
      comment: 'замена',
      updatedAt: '2026-05-11T12:00:00.000Z',
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

  it('uses the rate that was effective on each shift date', () => {
    const employee = {
      ...state.employees[0],
      weekdayRate: 3000,
      weekendRate: 3200,
      rateHistory: [
        { effectiveFrom: '1970-01-01', weekdayRate: 2500, weekendRate: 2500 },
        { effectiveFrom: '2026-05-03', weekdayRate: 3000, weekendRate: 3200 },
      ],
    };

    const historicalState: AppState = {
      ...state,
      employees: [employee, ...state.employees.slice(1)],
    };

    expect(calculateSalary(historicalState, employee, '2026-05', '2026-05-03').accrued).toBe(
      2500 + 3200,
    );
  });

  it('splits a double shift into half a shift and half pay for each active employee', () => {
    const secondEmployee = {
      ...state.employees[0],
      id: 'emp-2',
      name: 'Саша',
      color: '#123456',
    };
    const doubleShiftState: AppState = {
      ...state,
      employees: [state.employees[0], secondEmployee, state.employees[1]],
      shifts: [
        ...state.shifts,
        { id: 'shift-double', employeeId: 'emp-2', date: '2026-05-11' },
      ],
    };

    expect(getShiftFraction(doubleShiftState, doubleShiftState.shifts[2])).toBe(0.5);
    expect(getEmployeeMonthShiftCounts(doubleShiftState, 'emp-1', '2026-05', '2026-05-11')).toEqual({
      total: 3.5,
      worked: 2.5,
    });
    expect(calculateSalary(doubleShiftState, doubleShiftState.employees[0], '2026-05', '2026-05-11').workedShifts).toBe(3.5);
    expect(calculateSalary(doubleShiftState, doubleShiftState.employees[0], '2026-05', '2026-05-11').accrued).toBe(8750);
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

  it('counts all worked employee shifts through today', () => {
    expect(getEmployeeWorkedShiftCount(state, 'emp-1', '2026-05-11')).toBe(4);
  });

  it('finds employee first shift date', () => {
    expect(getEmployeeFirstShiftDate(state, 'emp-1')).toBe('2026-04-30');
    expect(getEmployeeFirstShiftDate(state, 'unknown')).toBeNull();
  });

  it('finds day notes by selected date', () => {
    expect(getDayNoteByDate(state, '2026-05-11')).toBe('замена');
    expect(getDayNoteByDate(state, '2026-05-12')).toBe('');
  });
});
