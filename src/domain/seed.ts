import type { AppState } from './types';
import { monthKeyFromDate } from './calculations';

const now = new Date();

export const CURRENT_MONTH = monthKeyFromDate(now);
export const TODAY = now.toISOString().slice(0, 10);

export const emptyAppState: AppState = {
  location: {
    id: 'main',
    name: 'Основной пункт',
  },
  employees: [],
  shifts: [],
  payments: [],
};
