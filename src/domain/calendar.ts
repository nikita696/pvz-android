import type { AppState, Employee } from './types';

export type DayOffInfo = { label: string; holiday: boolean } | null;

const HOLIDAYS: Record<string, string> = {
  '01-01': 'Новогодние каникулы',
  '01-02': 'Новогодние каникулы',
  '01-03': 'Новогодние каникулы',
  '01-04': 'Новогодние каникулы',
  '01-05': 'Новогодние каникулы',
  '01-06': 'Новогодние каникулы',
  '01-07': 'Рождество Христово',
  '01-08': 'Новогодние каникулы',
  '02-23': 'День защитника Отечества',
  '03-08': 'Международный женский день',
  '05-01': 'Праздник Весны и Труда',
  '05-09': 'День Победы',
  '06-12': 'День России',
  '11-04': 'День народного единства',
};

export function getCalendarDays(month: string): Array<number | null> {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const days: Array<number | null> = Array.from({ length: offset }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(day);
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

export function chunkWeeks(days: Array<number | null>): Array<Array<number | null>> {
  const weeks: Array<Array<number | null>> = [];

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

export function shortEmployeeName(name: string): string {
  return [...name.trim()].slice(0, 3).join('');
}

export function getDayOffInfo(date: string): DayOffInfo {
  const [, month, day] = date.split('-');
  const holidayName = HOLIDAYS[`${month}-${day}`];

  if (holidayName) {
    return { label: holidayName, holiday: true };
  }

  const [yearNumber, monthNumber, dayNumber] = date.split('-').map(Number);
  const weekday = new Date(yearNumber, monthNumber - 1, dayNumber).getDay();

  if (weekday === 0 || weekday === 6) {
    return { label: 'Выходной день', holiday: false };
  }

  return null;
}

export function getShiftEmployeesByDate(state: AppState, date: string): Employee[] {
  const activeEmployees = state.employees.filter((employee) => employee.active);
  const employeeIds = new Set(
    state.shifts.filter((shift) => shift.date === date).map((shift) => shift.employeeId),
  );

  return activeEmployees.filter((employee) => employeeIds.has(employee.id));
}
