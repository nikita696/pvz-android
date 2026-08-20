import type { AppState } from './types';
import { isoDateFromLocalDate, monthKeyFromDate } from './calculations';

export type CurrentLocalDate = {
  month: string;
  today: string;
};

export function getCurrentLocalDate(now = new Date()): CurrentLocalDate {
  return {
    month: monthKeyFromDate(now),
    today: isoDateFromLocalDate(now),
  };
}

export function getCurrentMonth(now = new Date()): string {
  return getCurrentLocalDate(now).month;
}

export function getToday(now = new Date()): string {
  return getCurrentLocalDate(now).today;
}

const initialDate = getCurrentLocalDate();

/**
 * Backwards-compatible live bindings for existing imports. New lifecycle code
 * should call refreshCurrentLocalDate when the app returns to the foreground.
 */
export let CURRENT_MONTH = initialDate.month;
export let TODAY = initialDate.today;

export function refreshCurrentLocalDate(now = new Date()): CurrentLocalDate {
  const current = getCurrentLocalDate(now);
  CURRENT_MONTH = current.month;
  TODAY = current.today;
  return current;
}

export const emptyAppState: AppState = {
  location: {
    id: 'main',
    name: 'Основной пункт',
  },
  employees: [],
  shifts: [],
  payments: [],
  dayNotes: [],
};
