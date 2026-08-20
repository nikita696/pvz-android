import {
  calculateSalary,
  formatMoney,
  getEmployeeDailyRateForDate,
  getEmployeeMonthShiftCounts,
  isoDateFromLocalDate,
  isInMonth,
} from './calculations';
import type { AppState, Employee } from './types';

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const;

export function createMonthScheduleText(state: AppState, month: string): string {
  const title = `${state.location.name} — ${formatMonth(month)}`;
  const employeeById = new Map(state.employees.map((employee) => [employee.id, employee.name]));
  const dates = new Set<string>();

  state.shifts.filter((shift) => isInMonth(shift.date, month)).forEach((shift) => dates.add(shift.date));
  state.dayNotes.filter((note) => isInMonth(note.date, month)).forEach((note) => dates.add(note.date));

  const lines = [...dates]
    .sort()
    .map((date) => {
      const employees = state.shifts
        .filter((shift) => shift.date === date)
        .map((shift) => employeeById.get(shift.employeeId))
        .filter((name): name is string => Boolean(name));
      const note = state.dayNotes.find((candidate) => candidate.date === date)?.comment.trim();
      const details = [employees.length ? employees.join(', ') : 'смен нет', note ? `— ${note}` : '']
        .filter(Boolean)
        .join(' ');

      return `${formatShortDate(date)} — ${details}`;
    });

  return [title, '', 'График', ...(lines.length ? lines : ['Смен пока нет.'])].join('\n');
}

export function createMonthSummaryText(
  state: AppState,
  month: string,
  cutoffDate = isoDateFromLocalDate(),
): string {
  const employees = getSummaryEmployees(state, month, cutoffDate);
  const employeeLines = employees.map((employee) => createEmployeeSummaryLine(state, employee, month, cutoffDate));

  return [
    `${state.location.name} — ${formatMonth(month)}`,
    '',
    'Сводка',
    ...(employeeLines.length ? employeeLines : ['Данных пока нет.']),
  ].join('\n');
}

function createEmployeeSummaryLine(
  state: AppState,
  employee: Employee,
  month: string,
  cutoffDate: string,
): string {
  const counts = getEmployeeMonthShiftCounts(state, employee.id, month, cutoffDate);
  const workedMonthShifts = state.shifts.filter(
    (shift) => shift.employeeId === employee.id && isInMonth(shift.date, month) && shift.date <= cutoffDate,
  );
  const monthPayments = state.payments.filter(
    (payment) => payment.employeeId === employee.id && isInMonth(payment.paidAt, month) && payment.paidAt <= cutoffDate,
  );
  const accrued = workedMonthShifts.reduce(
    (sum, shift) => sum + getEmployeeDailyRateForDate(employee, shift.date),
    0,
  );
  const paid = monthPayments
    .filter((payment) => payment.kind === 'payment')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const deductions = monthPayments
    .filter((payment) => payment.kind === 'deduction')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const balance = calculateSalary(state, employee, month, cutoffDate).due;
  const shiftText = counts.total === counts.worked
    ? formatShiftCount(counts.worked)
    : `${counts.worked} из ${counts.total} смен`;
  const operationParts = [
    `начислено ${formatMoney(accrued)}`,
    paid ? `выплачено ${formatMoney(paid)}` : '',
    deductions ? `удержано ${formatMoney(deductions)}` : '',
    formatBalance(balance),
  ].filter(Boolean);

  return `${employee.name}: ${shiftText} · ${operationParts.join(' · ')}`;
}

function getSummaryEmployees(state: AppState, month: string, cutoffDate: string): Employee[] {
  return state.employees.filter((employee) => {
    const hasMonthData = state.shifts.some(
      (shift) => shift.employeeId === employee.id && isInMonth(shift.date, month),
    ) || state.payments.some(
      (payment) => payment.employeeId === employee.id && isInMonth(payment.paidAt, month),
    );
    const balance = calculateSalary(state, employee, month, cutoffDate).due;

    return employee.active || hasMonthData || balance !== 0;
  });
}

function formatBalance(balance: number): string {
  if (balance > 0) {
    return `к выплате ${formatMoney(balance)}`;
  }

  if (balance < 0) {
    return `аванс ${formatMoney(Math.abs(balance))}`;
  }

  return 'расчёт закрыт';
}

function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const monthIndex = match ? Number(match[2]) - 1 : -1;

  if (!match || monthIndex < 0 || monthIndex >= MONTH_NAMES.length) {
    throw new Error('INVALID_MONTH');
  }

  return `${MONTH_NAMES[monthIndex]} ${match[1]}`;
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}.${month}`;
}

function formatShiftCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11
    ? 'смена'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'смены'
      : 'смен';

  return `${count} ${noun}`;
}
