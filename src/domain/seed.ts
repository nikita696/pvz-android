import type { AppState } from './types';
import { isoDateFromLocalDate, monthKeyFromDate } from './calculations';

const now = new Date();

export const CURRENT_MONTH = monthKeyFromDate(now);
export const TODAY = isoDateFromLocalDate(now);

export const emptyAppState: AppState = {
  location: {
    id: 'main',
    name: 'Основной пункт',
  },
  employees: [],
  shifts: [],
  payments: [],
};
