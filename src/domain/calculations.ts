import type { AppState, Employee, SalarySummary, Shift } from './types';

export function monthKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function isoDateFromLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export function getEmployeeMonthShiftCounts(
  state: AppState,
  employeeId: string,
  month: string,
  cutoffDate = isoDateFromLocalDate(),
): { total: number; worked: number } {
  const monthShifts = state.shifts.filter(
    (shift) => shift.employeeId === employeeId && isInMonth(shift.date, month),
  );

  return {
    total: monthShifts.length,
    worked: monthShifts.filter((shift) => shift.date <= cutoffDate).length,
  };
}

export function getEmployeeWorkedShiftCount(
  state: AppState,
  employeeId: string,
  cutoffDate = isoDateFromLocalDate(),
): number {
  return state.shifts.filter((shift) => shift.employeeId === employeeId && shift.date <= cutoffDate).length;
}

export function getEmployeeFirstShiftDate(state: AppState, employeeId: string): string | null {
  return (
    state.shifts
      .filter((shift) => shift.employeeId === employeeId)
      .map((shift) => shift.date)
      .sort()[0] ?? null
  );
}

export function getDayNoteByDate(state: AppState, date: string): string {
  return state.dayNotes.find((note) => note.date === date)?.comment ?? '';
}

export function hasShift(state: AppState, employeeId: string, date: string): boolean {
  return state.shifts.some((shift) => shift.employeeId === employeeId && shift.date === date);
}

export function calculateSalary(
  state: AppState,
  employee: Employee,
  month: string,
  cutoffDate = isoDateFromLocalDate(),
): SalarySummary {
  void month;

  const workedShifts = state.shifts.filter(
    (shift) => shift.employeeId === employee.id && shift.date <= cutoffDate,
  ).length;
  const employeePayments = state.payments.filter(
    (payment) => payment.employeeId === employee.id && payment.paidAt <= cutoffDate,
  );
  const paid = employeePayments
    .filter((payment) => payment.kind !== 'deduction')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const deductions = employeePayments
    .filter((payment) => payment.kind === 'deduction')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const accrued = workedShifts * employee.dailyRate;
  const paidAndDeductions = paid + deductions;

  return {
    employeeId: employee.id,
    workedShifts,
    dailyRate: employee.dailyRate,
    accrued,
    paid,
    deductions,
    paidAndDeductions,
    due: Math.max(0, accrued - paidAndDeductions),
  };
}

export function calculateTotalDue(
  state: AppState,
  month: string,
  cutoffDate = isoDateFromLocalDate(),
): number {
  void month;

  return state.employees
    .filter((employee) => employee.active)
    .reduce((sum, employee) => sum + calculateSalary(state, employee, month, cutoffDate).due, 0);
}

export function getShiftCountByDate(state: AppState, date: string): number {
  const activeEmployeeIds = new Set(
    state.employees.filter((employee) => employee.active).map((employee) => employee.id),
  );

  return state.shifts.filter((shift) => shift.date === date && activeEmployeeIds.has(shift.employeeId)).length;
}
