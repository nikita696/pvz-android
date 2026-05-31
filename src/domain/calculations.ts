import type { AppState, Employee, SalarySummary, Shift } from './types';

export function monthKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function isInMonth(date: string, month: string): boolean {
  return date.startsWith(`${month}-`);
}

export function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

export function getMonthShifts(state: AppState, month: string): Shift[] {
  return state.shifts.filter((shift) => isInMonth(shift.date, month));
}

export function hasShift(state: AppState, employeeId: string, date: string): boolean {
  return state.shifts.some((shift) => shift.employeeId === employeeId && shift.date === date);
}

export function calculateSalary(state: AppState, employee: Employee, month: string): SalarySummary {
  const workedShifts = state.shifts.filter(
    (shift) => shift.employeeId === employee.id && isInMonth(shift.date, month),
  ).length;
  const paid = state.payments
    .filter((payment) => payment.employeeId === employee.id && isInMonth(payment.paidAt, month))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const accrued = workedShifts * employee.dailyRate;

  return {
    employeeId: employee.id,
    workedShifts,
    dailyRate: employee.dailyRate,
    accrued,
    paid,
    due: Math.max(0, accrued - paid),
  };
}

export function calculateTotalDue(state: AppState, month: string): number {
  return state.employees
    .filter((employee) => employee.active)
    .reduce((sum, employee) => sum + calculateSalary(state, employee, month).due, 0);
}

export function getShiftCountByDate(state: AppState, date: string): number {
  return state.shifts.filter((shift) => shift.date === date).length;
}
