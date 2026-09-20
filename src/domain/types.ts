export const EMPLOYEE_COLOR_PALETTE = [
  '#7c3aed',
  '#0e7490',
  '#b45309',
  '#2563eb',
  '#dc2626',
  '#db2777',
  '#65a30d',
] as const;

export interface Location {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  dailyRate: number;
  /** Rate for Monday-Friday. Falls back to dailyRate for old local data. */
  weekdayRate?: number;
  /** Rate for Saturday-Sunday. Falls back to dailyRate for old local data. */
  weekendRate?: number;
  color: string;
  active: boolean;
  createdAt: string;
}

export interface Shift {
  id: string;
  employeeId: string;
  date: string;
}

export type PaymentKind = 'payment' | 'deduction';

export interface SalaryPayment {
  id: string;
  employeeId: string;
  amount: number;
  paidAt: string;
  kind: PaymentKind;
  comment: string;
}

export interface DayNote {
  date: string;
  comment: string;
  updatedAt: string;
}

export interface AppState {
  location: Location;
  employees: Employee[];
  shifts: Shift[];
  payments: SalaryPayment[];
  dayNotes: DayNote[];
}

export interface SalarySummary {
  employeeId: string;
  workedShifts: number;
  dailyRate: number;
  accrued: number;
  paid: number;
  deductions: number;
  paidAndDeductions: number;
  due: number;
}

export type ApiAction =
  | { action: 'updateLocation'; name: string }
  | { action: 'addEmployee'; name: string; weekdayRate: number; weekendRate: number; color?: string }
  | { action: 'updateEmployeeColor'; employeeId: string; color: string }\n  | { action: 'updateEmployeeRates'; employeeId: string; weekdayRate: number; weekendRate: number }
  | { action: 'toggleShift'; employeeId: string; date: string }
  | { action: 'saveDayNote'; date: string; comment: string }
  | {
      action: 'addPayment';
      employeeId: string;
      amount: number;
      paidAt: string;
      kind?: PaymentKind;
      comment?: string;
    }
  | {
      action: 'updatePayment';
      id: string;
      employeeId: string;
      amount: number;
      paidAt: string;
      kind?: PaymentKind;
      comment?: string;
    }
  | { action: 'deletePayment'; id: string; employeeId: string; undoToken?: string }
  | { action: 'restoreDeletedPayment'; undoToken: string }
  | { action: 'archiveEmployee'; employeeId: string }
  | { action: 'deleteEmployee'; employeeId: string; undoToken?: string }
  | { action: 'restoreDeletedEmployee'; undoToken: string }
  | { action: 'importState'; state: AppState };
