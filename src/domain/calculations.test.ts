import { describe, expect, it } from 'vitest';

import {
  calculateSalary,
  calculateTotalDue,
  getDayNoteByDate,
  getEmployeeFirstShiftDate,
  getEmployeeMonthShiftCounts,
  getEmployeeWorkedShiftCount,
  getLatestPaymentDate,
  getShiftCountByDate,
  getShiftFraction,
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

describe('payroll calculators', () => {
  it('calculates the unpaid balance from the latest payout through the cutoff date', () => {
    const salary = calculateSalary(state, state.employees[0], '2026-05', '2026-05-11');

    expect(getLatestPaymentDate(state, 'emp-1', '2026-05-11')).toBe('2026-05-10');
    expect(salary.workedShifts).toBe(1);
    expect(salary.accrued).toBe(2500);
    expect(salary.paid).toBe(0);
    expect(salary.deductions).toBe(300);
    expect(salary.paidAndDeductions).toBe(300);
    expect(salary.due).toBe(2200);
  });

  it('does not include shifts outside the selected month or after the cutoff date', () => {
    const salary = calculateSalary(state, state.employees[0], '2026-05', '2026-05-11');

    expect(salary.workedShifts).toBe(1);
    expect(salary.accrued).toBe(2500);
  });

  it('uses the rate that was effective on each unpaid shift date', () => {
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
    expect(
      getEmployeeMonthShiftCounts(doubleShiftState, 'emp-1', '2026-05', '2026-05-11'),
    ).toEqual({
      total: 3.5,
      worked: 2.5,
    });

    const salary = calculateSalary(
      doubleShiftState,
      doubleShiftState.employees[0],
      '2026-05',
      '2026-05-11',
    );

    expect(salary.workedShifts).toBe(0.5);
    expect(salary.accrued).toBe(1250);
  });

  it('calculates Nikita September balance as 5500 on September 21', () => {
    const nikita = {
      ...state.employees[0],
      id: 'nikita',
      name: 'Никита',
      weekdayRate: 3000,
      weekendRate: 2500,
      rateHistory: [
        { effectiveFrom: '1970-01-01', weekdayRate: 2500, weekendRate: 2500 },
        { effectiveFrom: '2026-09-14', weekdayRate: 3000, weekendRate: 2500 },
      ],
    };
    const sasha = {
      ...state.employees[0],
      id: 'sasha',
      name: 'Саша',
      color: '#123456',
      weekdayRate: 3000,
      weekendRate: 2500,
      rateHistory: [
        { effectiveFrom: '1970-01-01', weekdayRate: 2500, weekendRate: 2500 },
        { effectiveFrom: '2026-09-14', weekdayRate: 3000, weekendRate: 2500 },
      ],
    };
    const septemberState: AppState = {
      ...state,
      employees: [nikita, sasha, state.employees[1]],
      shifts: [
        { id: 'sep-20', employeeId: 'nikita', date: '2026-09-20' },
        { id: 'sep-21', employeeId: 'nikita', date: '2026-09-21' },
        { id: 'sep-25-n', employeeId: 'nikita', date: '2026-09-25' },
        { id: 'sep-25-s', employeeId: 'sasha', date: '2026-09-25' },
        { id: 'sep-22', employeeId: 'nikita', date: '2026-09-22' },
      ],
      payments: [
        {
          id: 'sep-payment',
          employeeId: 'nikita',
          amount: 11500,
          paidAt: '2026-09-20',
          kind: 'payment',
          comment: 'СБП',
        },
      ],
    };

    const salary = calculateSalary(septemberState, nikita, '2026-09', '2026-09-21');

    expect(getLatestPaymentDate(septemberState, 'nikita', '2026-09-21')).toBe('2026-09-20');
    expect(salary.workedShifts).toBe(2);
    expect(salary.accrued).toBe(5500);
    expect(salary.due).toBe(5500);
  });


  it('matches the real Neon September 21 snapshot at 5500 ₽', () => {
    const nikita = {
      ...state.employees[0],
      id: '743a27fb-d1cd-46cd-8bac-d106b5b1b996',
      name: 'Никита',
      weekdayRate: 3000,
      weekendRate: 2500,
      rateHistory: [
        { effectiveFrom: '1970-01-01', weekdayRate: 2500, weekendRate: 2500 },
        { effectiveFrom: '2026-09-14', weekdayRate: 3000, weekendRate: 2500 },
      ],
    };
    const sasha = {
      ...state.employees[0],
      id: '8ad20885-a3fe-4b7a-9951-8bfcac2e42e9',
      name: 'Саша',
      weekdayRate: 3000,
      weekendRate: 2500,
      rateHistory: [
        { effectiveFrom: '1970-01-01', weekdayRate: 2500, weekendRate: 2500 },
        { effectiveFrom: '2026-09-14', weekdayRate: 3000, weekendRate: 2500 },
      ],
    };
    const septemberState: AppState = {
      ...state,
      employees: [nikita, sasha],
      shifts: [
        ...[
          '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-06',
          '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-13',
          '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-20',
          '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-25',
          '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
        ].map((date, index) => ({ id: `nikita-${index}`, employeeId: nikita.id, date })),
        ...[
          '2026-09-04', '2026-09-05', '2026-09-10', '2026-09-11',
          '2026-09-12', '2026-09-17', '2026-09-18', '2026-09-19',
          '2026-09-24', '2026-09-25', '2026-09-26',
        ].map((date, index) => ({ id: `sasha-${index}`, employeeId: sasha.id, date })),
      ],
      payments: [
        { id: 'p-0906', employeeId: nikita.id, amount: 12500, paidAt: '2026-09-06', kind: 'payment', comment: 'СБП' },
        { id: 'p-0912', employeeId: nikita.id, amount: 2500, paidAt: '2026-09-12', kind: 'payment', comment: 'СБП' },
        { id: 'p-0913a', employeeId: nikita.id, amount: 7500, paidAt: '2026-09-13', kind: 'payment', comment: 'СБП' },
        { id: 'p-0913b', employeeId: nikita.id, amount: 7500, paidAt: '2026-09-13', kind: 'payment', comment: 'СБП' },
        { id: 'p-0920', employeeId: nikita.id, amount: 11500, paidAt: '2026-09-20', kind: 'payment', comment: 'Спб (будни по 3000₽)' },
      ],
    };

    expect(getLatestPaymentDate(septemberState, nikita.id, '2026-09-21')).toBe('2026-09-20');
    expect(calculateSalary(septemberState, nikita, '2026-09', '2026-09-21')).toMatchObject({
      workedShifts: 2,
      accrued: 5500,
      paid: 0,
      deductions: 0,
      paidAndDeductions: 0,
      due: 5500,
    });
    expect(calculateTotalDue(septemberState, '2026-09', '2026-09-21')).toBe(5500);
  });

  it('checks if a shift is already marked', () => {
    expect(hasShift(state, 'emp-1', '2026-05-02')).toBe(true);
    expect(hasShift(state, 'emp-1', '2026-05-04')).toBe(false);
  });

  it('sums total employee debt using the same unpaid-balance formula', () => {
    expect(calculateTotalDue(state, '2026-05', '2026-05-11')).toBe(2200);
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
