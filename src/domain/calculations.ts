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

export function getShiftFraction(state: AppState, shift: Shift): number {
  const activeEmployeeIds = new Set(
    state.employees.filter((employee) => employee.active).map((employee) => employee.id),
  );
  const employeesOnShift = state.shifts.filter(
    (candidate) => candidate.date === shift.date && activeEmployeeIds.has(candidate.employeeId),
  ).length;

  return employeesOnShift === 2 ? 0.5 : 1;
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
    total: monthShifts.reduce((sum, shift) => sum + getShiftFraction(state, shift), 0),
    worked: monthShifts
      .filter((shift) => shift.date <= cutoffDate)
      .reduce((sum, shift) => sum + getShiftFraction(state, shift), 0),
  };
}

export function getEmployeeWorkedShiftCount(
  state: AppState,
  employeeId: string,
  cutoffDate = isoDateFromLocalDate(),
): number {
  return state.shifts
    .filter((shift) => shift.employeeId === employeeId && shift.date <= cutoffDate)
    .reduce((sum, shift) => sum + getShiftFraction(state, shift), 0);
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

export function getLatestPaymentDate(
  state: AppState,
  employeeId: string,
  cutoffDate = isoDateFromLocalDate(),
): string | null {
  return (
    state.payments
      .filter(
        (payment) =>
          payment.employeeId === employeeId &&
          payment.kind !== 'deduction' &&
          payment.paidAt <= cutoffDate,
      )
      .map((payment) => payment.paidAt)
      .sort()
      .at(-1) ?? null
  );
}

export function calculateSalary(
  state: AppState,
  employee: Employee,
  month: string,
  cutoffDate = isoDateFromLocalDate(),
): SalarySummary {
  const latestPaymentDate = getLatestPaymentDate(state, employee.id, cutoffDate);

  const unpaidEmployeeShifts = state.shifts.filter(
    (shift) =>
      shift.employeeId === employee.id &&
      isInMonth(shift.date, month) &&
      shift.date <= cutoffDate &&
      (!latestPaymentDate || shift.date >= latestPaymentDate),
  );

  const workedShifts = unpaidEmployeeShifts.reduce(
    (sum, shift) => sum + getShiftFraction(state, shift),
    0,
  );

  const deductions = state.payments
    .filter(
      (payment) =>
        payment.employeeId === employee.id &&
        payment.kind === 'deduction' &&
        payment.paidAt <= cutoffDate &&
        (!latestPaymentDate || payment.paidAt >= latestPaymentDate),
    )
    .reduce((sum, payment) => sum + payment.amount, 0);

  const accrued = unpaidEmployeeShifts.reduce(
    (sum, shift) => sum + getEmployeeShiftRate(employee, shift.date) * getShiftFraction(state, shift),
    0,
  );

  return {
    employeeId: employee.id,
    workedShifts,
    dailyRate: employee.dailyRate,
    accrued,
    paid: 0,
    deductions,
    paidAndDeductions: deductions,
    due: Math.max(0, accrued - deductions),
  };
}

export function calculateTotalDue(
  state: AppState,
  month: string,
  cutoffDate = isoDateFromLocalDate(),
): number {
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

export function getEmployeeShiftRate(employee: Employee, date: string): number {
  let weekdayRate = employee.weekdayRate ?? employee.dailyRate;
  let weekendRate = employee.weekendRate ?? employee.dailyRate;

  const history = [...(employee.rateHistory ?? [])].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );

  for (const change of history) {
    if (change.effectiveFrom > date) {
      break;
    }
    weekdayRate = change.weekdayRate;
    weekendRate = change.weekendRate;
  }

  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6 ? weekendRate : weekdayRate;
}
